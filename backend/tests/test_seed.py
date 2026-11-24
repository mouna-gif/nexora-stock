"""Garde-fou du script de seed — exécuté contre une fausse base fidèle à PyMongo async.

Contexte : sur MongoDB réel, `db[c].replace_one(...)` sans `await` n'insère RIEN
et ne crashe que plus loin (coroutine jamais attendue). Les fausses bases plus
permissives masquent ce bug. Ici, chaque méthode du fake est un coroutine comme
le vrai PyMongo, et les RuntimeWarning (« coroutine was never awaited ») sont
convertis en ÉCHEC de test — tout `await` oublié dans seed.py est donc détecté.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

seed = importlib.import_module("scripts.seed")


class SeedCollection:
    """Imitation stricte de pymongo AsyncCollection : méthodes = coroutines."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.docs: dict[str, dict] = {}

    async def replace_one(self, filters: dict, replacement: dict, upsert: bool = False) -> dict:
        _id = filters["_id"]
        existed = _id in self.docs
        if existed or upsert:
            self.docs[_id] = replacement
        return {"matched_count": 1 if existed else 0, "upserted_id": None if existed else _id}

    async def count_documents(self, filters: dict | None = None, **kwargs) -> int:
        return len(self.docs)

    async def insert_many(self, docs: list[dict]) -> None:
        for d in docs:
            self.docs[d["_id"]] = d

    async def insert_one(self, doc: dict) -> None:
        self.docs[doc["_id"]] = doc

    async def find_one(self, filters: dict | None = None, **kwargs) -> dict | None:
        if not filters:
            return next(iter(self.docs.values()), None)
        return self.docs.get(filters.get("_id"))

    async def update_one(self, filters: dict, update: dict, upsert: bool = False) -> dict:
        """Sémantique MongoDB simplifiée ($set / $setOnInsert + upsert par _id)."""
        _id = filters.get("_id")
        if _id is not None and _id in self.docs:
            if "$set" in update:
                self.docs[_id].update(update["$set"])
            return {"matched_count": 1, "modified_count": 1}
        if upsert and _id is not None and "$setOnInsert" in update:
            self.docs[_id] = dict(update["$setOnInsert"])
        return {"matched_count": 0, "modified_count": 0}


class SeedDatabase:
    """Base factice : collections créées à la demande (comme MongoDB)."""

    def __init__(self) -> None:
        self._cols: dict[str, SeedCollection] = {}

    def __getitem__(self, name: str) -> SeedCollection:
        if name not in self._cols:
            self._cols[name] = SeedCollection(name)
        return self._cols[name]


def _patch_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Neutralise les index et redirige le stockage média vers tmp_path."""

    async def _no_indexes(db) -> None:
        return None

    def _fake_media_root() -> Path:
        root = tmp_path / "media"
        root.mkdir(parents=True, exist_ok=True)
        return root

    monkeypatch.setattr(seed, "ensure_indexes", _no_indexes)
    monkeypatch.setattr(seed, "media_root", _fake_media_root)


@pytest.mark.filterwarnings("error::RuntimeWarning")
async def test_seed_inserts_all_demo_data(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Le seed s'exécute sans `await` oublié et insère toutes les données de démo."""
    _patch_env(monkeypatch, tmp_path)
    db = SeedDatabase()

    await seed.seed(force=True, db=db)

    assert len(db["users"].docs) == 8
    assert len(db["products"].docs) == 8
    assert len(db["stock_items"].docs) == 8
    assert len(db["warehouses"].docs) == 2
    assert len(db["suppliers"].docs) == 7
    assert len(db["purchase_orders"].docs) == 3
    assert len(db["alerts"].docs) == 5
    assert len(db["movements"].docs) > 0
    assert len(db["categories"].docs) > 0
    assert len(db["brands"].docs) > 0

    # Comptes de démonstration @nexora.tn
    emails = {u["email"] for u in db["users"].docs.values()}
    assert "admin@nexora.tn" in emails
    assert "aziz.sakly@nexora.tn" in emails

    # Paramètres société « Nexora » + logo persisté dans le stockage média
    settings = db["company_settings"].docs["main"]
    assert settings["company_name"] == "Nexora"
    assert settings["logo_media_id"] == "med-nexora-logo"
    media = db["media"].docs["med-nexora-logo"]
    assert media["content_type"] == "image/png"
    assert media["url"] == "/api/v1/media/med-nexora-logo/file"
    assert (tmp_path / "media" / "med-nexora-logo.png").exists()


@pytest.mark.filterwarnings("error::RuntimeWarning")
async def test_seed_preserves_admin_settings_on_force(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """--force ré-amorce les données démo mais JAMAIS les paramètres société édités."""
    _patch_env(monkeypatch, tmp_path)
    db = SeedDatabase()

    await seed.seed(force=True, db=db)
    db["company_settings"].docs["main"]["company_name"] = "Nexora SARL (édité par l'admin)"

    await seed.seed(force=True, db=db)
    assert db["company_settings"].docs["main"]["company_name"] == "Nexora SARL (édité par l'admin)"


@pytest.mark.filterwarnings("error::RuntimeWarning")
async def test_seed_skips_when_products_already_exist(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Sans --force et produits déjà présents : le seed ne réécrit rien."""
    _patch_env(monkeypatch, tmp_path)
    db = SeedDatabase()

    await seed.seed(force=True, db=db)
    products_before = dict(db["products"].docs)
    movements_before = dict(db["movements"].docs)

    await seed.seed(force=False, db=db)

    assert db["products"].docs == products_before
    assert db["movements"].docs == movements_before
