"""Faux MongoDB en mémoire pour les tests unitaires (sans serveur réel).

Implémente le sous-ensemble d'API utilisé par les services :
find/find_one/insert/update/find_one_and_update/count/aggregate minimal.
La sémantique de find_one_and_update (filtre + $inc/$set atomiques,
ReturnDocument.AFTER) est fidèle pour tester la concurrence optimiste.
"""

from __future__ import annotations

import re
from typing import Any

# pymongo.ReturnDocument.AFTER est littéralement True (BEFORE = False).
AFTER = True


def _get_path(doc: dict, path: str) -> Any:
    cur: Any = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _set_path(doc: dict, path: str, value: Any) -> None:
    parts = path.split(".")
    cur = doc
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


def _match_condition(value: Any, cond: Any) -> bool:
    if isinstance(cond, dict):
        for op, operand in cond.items():
            if op == "$gte" and not (value is not None and value >= operand):
                return False
            if op == "$gt" and not (value is not None and value > operand):
                return False
            if op == "$lt" and not (value is not None and value < operand):
                return False
            if op == "$lte" and not (value is not None and value <= operand):
                return False
            if op == "$ne" and value == operand:
                return False
            if op == "$in" and value not in operand:
                return False
            if op == "$nin" and value in operand:
                return False
            if op == "$exists":
                if bool(operand) != (value is not None):
                    return False
        return True
    return value == cond


def _match(doc: dict, filters: dict) -> bool:
    for key, cond in filters.items():
        if key == "$or":
            if not any(_match(doc, sub) for sub in cond):
                return False
        elif key == "$and":
            if not all(_match(doc, sub) for sub in cond):
                return False
        else:
            value = _get_path(doc, key)
            if isinstance(cond, dict) and cond and all(
                k.startswith("$") for k in cond
            ):
                if not _match_condition(value, cond):
                    return False
            elif key.endswith("$options"):
                continue
            elif isinstance(cond, dict) and "$regex" in cond:
                pattern = re.compile(cond["$regex"], re.IGNORECASE if cond.get("$options") and "i" in cond["$options"] else 0)
                if not (isinstance(value, str) and pattern.search(value)):
                    return False
            elif value != cond:
                return False
    return True


def _apply_update(doc: dict, update: dict) -> dict:
    for op, fields in update.items():
        if op == "$set":
            for path, value in fields.items():
                _set_path(doc, path, value)
        elif op == "$inc":
            for path, amount in fields.items():
                current = _get_path(doc, path) or 0
                _set_path(doc, path, current + amount)
        elif op == "$push":
            for path, value in fields.items():
                current = _get_path(doc, path)
                if current is None:
                    current = []
                    _set_path(doc, path, current)
                current.append(value)
        elif op == "$setOnInsert":
            pass  # géré par upsert
        else:
            raise NotImplementedError(f"Opérateur non supporté par le faux Mongo : {op}")
    return doc


def _sort_key(spec: list[tuple[str, int]]):
    def keyfn(doc: dict) -> tuple:
        return tuple(_get_path(doc, field) if _get_path(doc, field) is not None else "" for field, _ in spec)

    return keyfn


class FakeCursor:
    def __init__(self, docs: list[dict], filters: dict) -> None:
        self._docs = [d for d in docs if _match(d, filters)]
        self._sort_spec: list[tuple[str, int]] = []
        self._skip = 0
        self._limit: int | None = None

    def sort(self, key_or_list, direction: int = 1) -> "FakeCursor":
        if isinstance(key_or_list, str):
            self._sort_spec = [(key_or_list, direction)]
        else:
            self._sort_spec = list(key_or_list)
        return self

    def skip(self, n: int) -> "FakeCursor":
        self._skip = n
        return self

    def limit(self, n: int) -> "FakeCursor":
        self._limit = n
        return self

    async def to_list(self, length: int | None = None) -> list[dict]:
        docs = sorted(self._docs, key=_sort_key(self._sort_spec)) if self._sort_spec else self._docs
        docs = docs[self._skip:]
        if self._limit is not None:
            docs = docs[: self._limit]
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


class FakeUpdateResult:
    """Résultat compatible pymongo.UpdateResult (attributs)."""

    def __init__(self, matched: int, modified: int, upserted_id: Any = None) -> None:
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id
        self.acknowledged = True


class FakeCollection:
    def __init__(self, name: str) -> None:
        self.name = name
        self.docs: list[dict] = []
        self.conflict_injector = None  # test hook : forçage d'un conflit de version

    def _find(self, filters: dict | None) -> list[dict]:
        return [d for d in self.docs if _match(d, filters or {})]

    # ── Lectures ─────────────────────────────────────────────
    def find(self, filters: dict | None = None, projection=None, *args, **kwargs) -> FakeCursor:
        return FakeCursor(self.docs, filters or {})

    async def find_one(self, filters: dict | None = None, projection=None, sort=None, **kwargs) -> dict | None:
        docs = self._find(filters or {})
        if sort:
            docs = sorted(docs, key=_sort_key(sort if isinstance(sort, list) else [(sort[0], sort[1])]))
        return dict(docs[0]) if docs else None

    async def count_documents(self, filters: dict | None = None, **kwargs) -> int:
        return len(self._find(filters or {}))

    async def distinct(self, key: str, filters: dict | None = None) -> list:
        return list({_get_path(d, key) for d in self._find(filters or {}) if _get_path(d, key) is not None})

    # ── Écritures ────────────────────────────────────────────
    async def insert_one(self, doc: dict) -> None:
        if any(d["_id"] == doc["_id"] for d in self.docs):
            from pymongo.errors import DuplicateKeyError

            raise DuplicateKeyError(f"_id dupliqué : {doc['_id']}")
        self.docs.append(dict(doc))

    async def insert_many(self, docs: list[dict]) -> None:
        for doc in docs:
            await self.insert_one(doc)

    async def update_one(self, filters: dict, update: dict, upsert: bool = False) -> dict:
        matched = self._find(filters)
        for doc in matched:
            _apply_update(doc, update)
        if not matched and upsert:
            new_doc = {**{k: v for k, v in filters.items() if not k.startswith("$")}}
            if "$setOnInsert" in update:
                for k, v in update["$setOnInsert"].items():
                    _set_path(new_doc, k, v)
            if "$set" in update:
                for k, v in update["$set"].items():
                    _set_path(new_doc, k, v)
            self.docs.append(new_doc)
            return FakeUpdateResult(0, 0, new_doc.get("_id"))
        return FakeUpdateResult(len(matched), len(matched))

    async def update_many(self, filters: dict, update: dict) -> dict:
        matched = self._find(filters)
        for doc in matched:
            _apply_update(doc, update)
        return FakeUpdateResult(len(matched), len(matched))

    async def replace_one(self, filters: dict, replacement: dict, upsert: bool = False) -> dict:
        matched = self._find(filters)
        if matched:
            self.docs[self.docs.index(matched[0])] = dict(replacement)
            return FakeUpdateResult(1, 1)
        if upsert:
            self.docs.append(dict(replacement))
            return FakeUpdateResult(0, 0, replacement.get("_id"))
        return FakeUpdateResult(0, 0)

    async def delete_one(self, filters: dict) -> "FakeUpdateResult":
        """Suppression unitaire TOUJOURS filtrée (garde-fous du projet)."""
        matched = self._find(filters)
        if matched:
            self.docs.remove(matched[0])
            return FakeUpdateResult(1, 1)
        return FakeUpdateResult(0, 0)

    async def find_one_and_update(
        self,
        filters: dict,
        update: dict,
        return_document=None,
        sort=None,
        upsert: bool = False,
        **kwargs,
    ) -> dict | None:
        if self.conflict_injector is not None:
            self.conflict_injector(self, filters, update)
        docs = self._find(filters)
        if sort:
            docs = sorted(docs, key=_sort_key(sort if isinstance(sort, list) else [(sort[0], sort[1])]))
        if not docs:
            if upsert:
                new_doc = {**{k: v for k, v in filters.items() if not k.startswith("$")}}
                _apply_update(new_doc, update)
                self.docs.append(new_doc)
                return dict(new_doc)
            return None
        doc = docs[0]
        before = dict(doc)
        _apply_update(doc, update)
        if return_document == AFTER:
            return dict(doc)
        return before

    # ── Agrégations (sous-ensemble) ──────────────────────────
    def aggregate(self, pipeline: list[dict]) -> "FakeCursor":
        docs = self.docs
        pending_group = None
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if _match(d, stage["$match"])]
            elif "$group" in stage:
                pending_group = stage["$group"]
            elif "$lookup" in stage or "$unwind" in stage or "$addFields" in stage or "$sort" in stage:
                continue
            else:
                raise NotImplementedError(f"Étape d'agrégation non supportée : {list(stage)}")

        if pending_group:
            group_by = pending_group["_id"]
            field = group_by.lstrip("$") if isinstance(group_by, str) else None
            groups: dict[Any, dict] = {}
            for d in docs:
                key = _get_path(d, field) if field else None
                bucket = groups.setdefault(key, {"_id": key})
                for out_field, spec in pending_group.items():
                    if out_field == "_id":
                        continue
                    if isinstance(spec, dict) and "$sum" in spec:
                        src = str(spec["$sum"]).lstrip("$")
                        bucket[out_field] = bucket.get(out_field, 0) + (_get_path(d, src) or 0)
                    elif isinstance(spec, dict) and "$count" in spec:
                        bucket[out_field] = bucket.get(out_field, 0) + 1
            result_docs = list(groups.values())
        else:
            result_docs = docs
        return FakeCursor(result_docs, {})


class FakeDatabase:
    """Base factice : collections créées à la demande, nom de base dédié."""

    def __init__(self, name: str = "nexora_test") -> None:
        self.name = name
        self._collections: dict[str, FakeCollection] = {}

    def __getitem__(self, name: str) -> FakeCollection:
        if name not in self._collections:
            self._collections[name] = FakeCollection(name)
        return self._collections[name]

    def collection(self, name: str) -> FakeCollection:
        return self.__getitem__(name)
