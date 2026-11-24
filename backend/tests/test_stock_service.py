"""Tests du service de stock ATOMIQUE — le cœur critique du backend.

Vérifie, avec un faux MongoDB fidèle :
  • entrées / sorties / ajustements signés / inventaire (mise à niveau),
  • refus 409 si stock insuffisant (jamais de stock négatif),
  • écriture du journal immuable des mouvements,
  • incrément atomique de products.stock,
  • sémantique de concurrence optimiste (version) avec retry,
  • contrôle de concurrence réelle sous asyncio.gather.
"""

from __future__ import annotations

import asyncio

import pytest

from app.core.errors import DomainError
from app.services import stock_service
from tests.fakes import FakeCollection, FakeDatabase


def _seed_data(db: FakeDatabase) -> None:
    db["products"].docs.append(
        {
            "_id": "prd-001", "sku": "CER-PLN-30X60-BL", "name": "Carrelage 30×60",
            "category": "Carrelage", "brand": "Saloni", "unit": "m²",
            "cost_price": 12.5, "selling_price": 19.9,
            "stock": 100, "min_stock": 50, "max_stock": 500, "reorder_point": 60,
            "status": "in_stock", "ai_risk": "low", "ai_risk_score": 10,
            "warehouse_id": "wh-001", "supplier_id": "sup-001",
            "lead_time_days": 14, "tags": [],
        }
    )
    db["warehouses"].docs.append(
        {"_id": "wh-001", "name": "Tunis", "code": "WH-TUN-01", "zones": []}
    )
    db["stock_items"].docs.append(
        {
            "_id": "stk-1", "product_id": "prd-001", "warehouse_id": "wh-001",
            "location_id": None, "qty": 100, "version": 5,
            "min_stock": 50, "max_stock": 500, "reorder_point": 60,
        }
    )


async def test_increases_stock_and_writes_journal(fake_db: FakeDatabase, demo_user: dict) -> None:
    _seed_data(fake_db)
    mov = await stock_service.apply_movement(
        fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="in",
        quantity=50, reason="Réception", user=demo_user,
    )
    assert mov["status"] == "applied"
    item = await fake_db["stock_items"].find_one({"product_id": "prd-001"})
    assert item["qty"] == 150
    assert item["version"] == 6
    product = await fake_db["products"].find_one({"_id": "prd-001"})
    assert product["stock"] == 150
    journal = await fake_db["movements"].find({}).to_list(None)
    assert len(journal) == 1
    assert journal[0]["type"] == "in"
    # Le journal en base reste en snake_case ; la sérialisation camelCase
    # s'opère uniquement à la frontière API.
    assert journal[0]["previous_stock"] == 100
    assert journal[0]["new_stock"] == 150


async def test_out_rejects_insufficient_stock(fake_db: FakeDatabase, demo_user: dict) -> None:
    _seed_data(fake_db)
    with pytest.raises(DomainError) as exc:
        await stock_service.apply_movement(
            fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="out",
            quantity=999, reason="Vente", user=demo_user,
        )
    assert exc.value.code == "insufficient_stock"
    # Aucun mouvement écrit, aucun stock modifié.
    assert await fake_db["movements"].count_documents({}) == 0
    item = await fake_db["stock_items"].find_one({"product_id": "prd-001"})
    assert item["qty"] == 100


async def test_out_can_never_overdraw_concurrently(fake_db: FakeDatabase, demo_user: dict) -> None:
    """100 en stock : 5 sorties concurrentes de 40 → 2 réussites, 3 refus."""
    _seed_data(fake_db)

    async def try_out() -> str:
        try:
            await stock_service.apply_movement(
                fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="out",
                quantity=40, reason="Vente", user=demo_user,
            )
            return "ok"
        except DomainError:
            return "rejected"

    results = await asyncio.gather(*(try_out() for _ in range(5)))
    item = await fake_db["stock_items"].find_one({"product_id": "prd-001"})
    assert item["qty"] == 20  # 100 - 2×40, jamais négatif
    assert item["version"] == 7
    assert results.count("ok") == 2
    assert results.count("rejected") == 3


async def test_inventory_sets_absolute_quantity(fake_db: FakeDatabase, demo_user: dict) -> None:
    _seed_data(fake_db)
    mov = await stock_service.apply_movement(
        fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="inventory",
        counted_quantity=80, reason="Inventaire", user=demo_user,
    )
    assert mov["quantity"] == 80
    item = await fake_db["stock_items"].find_one({"product_id": "prd-001"})
    assert item["qty"] == 80
    product = await fake_db["products"].find_one({"_id": "prd-001"})
    assert product["stock"] == 80


async def test_negative_adjustment_writes_journal(fake_db: FakeDatabase, demo_user: dict) -> None:
    _seed_data(fake_db)
    mov = await stock_service.apply_movement(
        fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="adjustment",
        quantity=-10, reason="Casse", user=demo_user,
    )
    assert mov["delta"] == -10
    assert mov["newStock"] == 90


async def test_version_conflict_triggers_retry(fake_db: FakeDatabase, demo_user: dict) -> None:
    """Injection d'un conflit : un autre écrivain incrémente la version entre
    la lecture et la mise à jour → le service annule l'entrée du journal
    (statut aborted) et retente avec succès."""
    _seed_data(fake_db)
    collection = fake_db["stock_items"]
    injected = {"count": 0}

    def inject_conflict(col: FakeCollection, filters: dict, update: dict) -> None:
        if injected["count"] == 0 and "version" in filters and "qty" in col.docs[0]:
            injected["count"] += 1
            col.docs[0]["version"] += 1  # écrivain concurrent fantôme

    collection.conflict_injector = inject_conflict
    try:
        mov = await stock_service.apply_movement(
            fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="in",
            quantity=10, reason="Test conflit", user=demo_user,
        )
    finally:
        collection.conflict_injector = None

    assert mov["status"] == "applied"
    journal = await fake_db["movements"].find({}).to_list(None)
    statuses = sorted(m["status"] for m in journal)
    assert statuses == ["aborted", "applied"]  # l'entrée annulée reste tracée
    item = await fake_db["stock_items"].find_one({"product_id": "prd-001"})
    assert item["qty"] == 110


async def test_unknown_product_or_warehouse_404(fake_db: FakeDatabase, demo_user: dict) -> None:
    _seed_data(fake_db)
    with pytest.raises(DomainError) as exc:
        await stock_service.apply_movement(
            fake_db, product_id="prd-404", warehouse_id="wh-001", mtype="in",
            quantity=1, user=demo_user,
        )
    assert exc.value.status_code == 404
    with pytest.raises(DomainError) as exc2:
        await stock_service.apply_movement(
            fake_db, product_id="prd-001", warehouse_id="wh-404", mtype="in",
            quantity=1, user=demo_user,
        )
    assert exc2.value.status_code == 404


async def test_rebuild_stock_recomputes_from_items(fake_db: FakeDatabase, demo_user: dict) -> None:
    _seed_data(fake_db)
    await stock_service.apply_movement(
        fake_db, product_id="prd-001", warehouse_id="wh-001", mtype="out",
        quantity=30, reason="Vente", user=demo_user,
    )
    fake_db["products"].docs[0]["stock"] = 0  # simulate drift
    result = await stock_service.rebuild_stock(fake_db)
    assert result["products_updated"] == 1
    product = await fake_db["products"].find_one({"_id": "prd-001"})
    assert product["stock"] == 70
