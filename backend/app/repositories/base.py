"""Dépôt Mongo générique — aucune méthode destructive exposée.

Règles :
  • Les suppressions sont interdites : désactivation (`is_active=False`)
    ou statut `cancelled` selon le domaine.
  • Les mises à jour passent toujours par un filtre explicite.
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection

from app.models.fields import now


class PaginatedResult:
    def __init__(self, items: list[dict[str, Any]], total: int, skip: int, limit: int) -> None:
        self.items = items
        self.total = total
        self.skip = skip
        self.limit = limit


class MongoRepository:
    """Dépôt mince autour d'une collection AsyncMongoClient."""

    def __init__(self, collection: AsyncCollection[dict[str, Any]]) -> None:
        self.col = collection

    # ── Lectures ─────────────────────────────────────────────
    async def get(self, doc_id: str) -> dict[str, Any] | None:
        return await self.col.find_one({"_id": doc_id})

    async def find_one(self, filters: dict[str, Any]) -> dict[str, Any] | None:
        return await self.col.find_one(filters)

    async def list(
        self,
        filters: dict[str, Any] | None = None,
        *,
        skip: int = 0,
        limit: int = 50,
        sort: list[tuple[str, int]] | None = None,
    ) -> PaginatedResult:
        filters = filters or {}
        cursor = self.col.find(filters).skip(skip).limit(limit)
        if sort:
            cursor = cursor.sort(sort)
        items = await cursor.to_list(length=limit)
        total = await self.col.count_documents(filters)
        return PaginatedResult(items, total, skip, limit)

    async def count(self, filters: dict[str, Any] | None = None) -> int:
        return await self.col.count_documents(filters or {})

    # ── Écritures ────────────────────────────────────────────
    async def insert(self, doc: dict[str, Any]) -> dict[str, Any]:
        doc.setdefault("created_at", now())
        await self.col.insert_one(doc)
        return doc

    async def insert_many(self, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for doc in docs:
            doc.setdefault("created_at", now())
        if docs:
            await self.col.insert_many(docs)
        return docs

    async def update(self, doc_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        """Mise à jour partielle par identifiant (filtre explicite)."""
        fields = {k: v for k, v in fields.items() if v is not None or k == "is_active"}
        if not fields:
            return await self.get(doc_id)
        return await self.col.find_one_and_update(
            {"_id": doc_id},
            {"$set": {**fields, "updated_at": now()}},
            return_document=ReturnDocument.AFTER,
        )

    async def update_where(self, filters: dict[str, Any], set_fields: dict[str, Any]) -> int:
        result = await self.col.update_many(filters, {"$set": set_fields})
        return result.modified_count
