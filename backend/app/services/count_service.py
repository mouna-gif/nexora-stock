"""Inventaires physiques (comptages) avec contrôle de concurrence.

Une session de comptage fige les quantités attendues, l'opérateur saisit
les comptés, puis la validation génère des mouvements de type `inventory`
(un par écart) via le service de stock atomique.
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import COL_COUNTS, COL_PRODUCTS, COL_STOCK_ITEMS, new_id, now
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import CountOut
from app.services.stock_service import apply_movement


async def list_counts(
    db: AsyncDatabase[dict[str, Any]],
    *,
    warehouse_id: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if warehouse_id:
        filters["warehouse_id"] = warehouse_id
    if status:
        filters["status"] = status
    cursor = db[COL_COUNTS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_COUNTS].count_documents(filters)
    return {"items": serialize_many(CountOut, items), "total": total, "skip": skip, "limit": limit}


async def get_count(db: AsyncDatabase[dict[str, Any]], count_id: str) -> dict[str, Any]:
    doc = await db[COL_COUNTS].find_one({"_id": count_id})
    if not doc:
        raise not_found("Inventaire", count_id)
    return serialize(CountOut, doc)


async def create_count(
    db: AsyncDatabase[dict[str, Any]],
    *,
    warehouse_id: str,
    product_ids: list[str],
    user: dict[str, Any],
) -> dict[str, Any]:
    warehouse = await db["warehouses"].find_one({"_id": warehouse_id})
    if not warehouse:
        raise not_found("Entrepôt", warehouse_id)

    filters: dict[str, Any] = {"warehouse_id": warehouse_id}
    if product_ids:
        filters["product_id"] = {"$in": product_ids}
    stock_rows = await db[COL_STOCK_ITEMS].find(filters).to_list(length=1000)
    if not stock_rows:
        raise DomainError(422, "empty_count", "Aucune ligne de stock à compter pour cet entrepôt.")

    lines = []
    for row in stock_rows:
        product = await db[COL_PRODUCTS].find_one({"_id": row["product_id"]})
        lines.append(
            {
                "product_id": row["product_id"],
                "product_name": (product or {}).get("name", ""),
                "product_sku": (product or {}).get("sku", ""),
                "expected_qty": int(row.get("qty", 0)),
                "counted_qty": None,
                "variance": None,
            }
        )

    seq = await db[COL_COUNTS].count_documents({}) + 1
    doc = {
        "_id": new_id("cnt"),
        "reference": f"CNT-{now().year}-{seq:04d}",
        "warehouse_id": warehouse_id,
        "status": "open",
        "lines": lines,
        "created_by": user["id"],
        "created_at": now(),
        "completed_at": None,
    }
    await db[COL_COUNTS].insert_one(doc)
    return serialize(CountOut, doc)


async def upsert_count_line(
    db: AsyncDatabase[dict[str, Any]], count_id: str, product_id: str, counted_qty: int
) -> dict[str, Any]:
    if counted_qty < 0:
        raise DomainError(422, "invalid_quantity", "La quantité comptée doit être positive ou nulle.")
    count = await db[COL_COUNTS].find_one({"_id": count_id})
    if not count:
        raise not_found("Inventaire", count_id)
    if count["status"] != "open":
        raise DomainError(409, "count_closed", "Cet inventaire n'est plus modifiable.")

    line = next((l for l in count["lines"] if l["product_id"] == product_id), None)
    if line is None:
        raise not_found("Ligne d'inventaire", product_id)

    variance = counted_qty - line["expected_qty"]
    doc = await db[COL_COUNTS].find_one_and_update(
        {"_id": count_id, "status": "open", "lines.product_id": product_id},
        {
            "$set": {
                "lines.$.counted_qty": counted_qty,
                "lines.$.variance": variance,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise DomainError(409, "count_modified", "Inventaire modifié concurrentement, réessayez.")
    return serialize(CountOut, doc)


async def complete_count(
    db: AsyncDatabase[dict[str, Any]], count_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    count = await get_count(db, count_id)
    if count["status"] != "open":
        raise DomainError(409, "count_closed", "Cet inventaire est déjà clôturé.")
    counted_lines = [l for l in count["lines"] if l["counted_qty"] is not None]
    if not counted_lines:
        raise DomainError(422, "no_counted_lines", "Aucune ligne comptée : clôture impossible.")

    for line in counted_lines:
        if line["variance"] != 0:
            # Mouvement de type `inventory` : mise à niveau atomique vers le compté.
            await apply_movement(
                db,
                product_id=line["product_id"],
                warehouse_id=count["warehouse_id"],
                mtype="inventory",
                counted_quantity=int(line["counted_qty"]),
                reason=f"Écart d'inventaire {count['reference']}",
                user=user,
                reference=count_id,
            )

    doc = await db[COL_COUNTS].find_one_and_update(
        {"_id": count_id, "status": "open"},
        {"$set": {"status": "completed", "completed_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise DomainError(409, "count_modified", "Clôture concurrente détectée.")
    return serialize(CountOut, doc)


async def cancel_count(db: AsyncDatabase[dict[str, Any]], count_id: str) -> dict[str, Any]:
    doc = await db[COL_COUNTS].find_one_and_update(
        {"_id": count_id, "status": "open"},
        {"$set": {"status": "cancelled", "completed_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Inventaire ouvert", count_id)
    return serialize(CountOut, doc)
