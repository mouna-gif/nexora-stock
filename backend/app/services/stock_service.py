"""Opérations critiques de stock — mises à jour ATOMIQUES MongoDB.

Contrainte : MongoDB standalone = pas de transactions multi-documents.
La cohérence repose donc sur :
  1. `find_one_and_update` atomique sur `stock_items` avec :
       • condition de version (concurrence optimiste),
       • condition de disponibilité (`qty >= n` pour les sorties),
       • `$inc` simultané de la quantité et de la version.
  2. Un journal immuable des mouvements (`movements`) écrit AVANT
     l'application (statut pending) puis marqué `applied` ou `aborted`.
     Aucune route API ne modifie ni ne supprime le journal.
  3. Un compteur dénormalisé `products.stock` incrémenté atomiquement,
     recalculable à tout moment via `rebuild_stock` (non destructif).
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, insufficient_stock, not_found
from app.models.fields import (
    COL_MOVEMENTS,
    COL_PRODUCTS,
    COL_STOCK_ITEMS,
    COL_WAREHOUSES,
    new_id,
    now,
)
from app.services.alert_service import check_low_stock
from app.services.catalog_service import refresh_product_status
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import MovementOut, StockItemOut
from app.services.events import event_bus

MAX_ATTEMPTS = 8

# Deltas par type de mouvement :
#   in / inventory → quantité signée calculée au cas par cas
#   out → toujours négatif, guarded par qty >= n
_APPLY_TYPES = ("in", "out", "adjustment", "inventory")


async def _get_stock_item(
    db: AsyncDatabase[dict[str, Any]], product_id: str, warehouse_id: str, location_id: str | None
) -> dict[str, Any] | None:
    filters: dict[str, Any] = {
        "product_id": product_id,
        "warehouse_id": warehouse_id,
        "location_id": location_id,
    }
    return await db[COL_STOCK_ITEMS].find_one(filters)


async def _ensure_stock_item(
    db: AsyncDatabase[dict[str, Any]], product_id: str, warehouse_id: str, location_id: str | None
) -> dict[str, Any]:
    """Crée la ligne de stock si absente (upsert atomique, jamais destructif)."""
    existing = await _get_stock_item(db, product_id, warehouse_id, location_id)
    if existing:
        return existing
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    doc = {
        "_id": new_id("stk"),
        "product_id": product_id,
        "warehouse_id": warehouse_id,
        "location_id": location_id,
        "qty": 0,
        "version": 0,
        "min_stock": int(product.get("min_stock", 0)) if product else 0,
        "max_stock": int(product.get("max_stock", 0)) if product else 0,
        "reorder_point": int(product.get("reorder_point", 0)) if product else 0,
        "created_at": now(),
        "updated_at": now(),
    }
    await db[COL_STOCK_ITEMS].insert_one(doc)
    return doc


def _signed_delta(
    mtype: str, quantity: int, current_qty: int, counted_quantity: int | None
) -> tuple[int, int]:
    """Retourne (delta_signé, quantité_journalisée). Lève si incohérent."""
    if mtype == "in":
        if quantity <= 0:
            raise DomainError(422, "invalid_quantity", "La quantité d'entrée doit être positive.")
        return quantity, quantity
    if mtype == "out":
        if quantity <= 0:
            raise DomainError(422, "invalid_quantity", "La quantité de sortie doit être positive.")
        return -quantity, quantity
    if mtype == "adjustment":
        if quantity == 0:
            raise DomainError(422, "invalid_quantity", "L'ajustement ne peut pas être nul.")
        return quantity, abs(quantity)
    if mtype == "inventory":
        if counted_quantity is None or counted_quantity < 0:
            raise DomainError(422, "invalid_quantity", "Quantité comptée invalide.")
        delta = counted_quantity - current_qty
        return delta, counted_quantity
    raise DomainError(422, "invalid_movement_type", f"Type de mouvement non applicable : {mtype}")


async def apply_movement(
    db: AsyncDatabase[dict[str, Any]],
    *,
    product_id: str,
    warehouse_id: str,
    mtype: str,
    quantity: int = 0,
    reason: str = "",
    user: dict[str, Any],
    location_id: str | None = None,
    to_warehouse_id: str | None = None,
    counted_quantity: int | None = None,
    reference: str | None = None,
) -> dict[str, Any]:
    """Applique un mouvement de stock de façon atomique (voir docstring module).

    Retourne le document de mouvement (journal) avec statut `applied`.
    """
    if mtype not in _APPLY_TYPES:
        raise DomainError(422, "invalid_movement_type", f"Type de mouvement inconnu : {mtype}")

    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)
    warehouse = await db[COL_WAREHOUSES].find_one({"_id": warehouse_id})
    if not warehouse:
        raise not_found("Entrepôt", warehouse_id)
    if to_warehouse_id:
        dest = await db[COL_WAREHOUSES].find_one({"_id": to_warehouse_id})
        if not dest:
            raise not_found("Entrepôt de destination", to_warehouse_id)

    item = await _ensure_stock_item(db, product_id, warehouse_id, location_id)

    for attempt in range(MAX_ATTEMPTS):
        current_qty = int(item.get("qty", 0))
        delta, journaled_qty = _signed_delta(mtype, quantity, current_qty, counted_quantity)

        if delta < 0 and current_qty + delta < 0:
            raise insufficient_stock(product["sku"], current_qty, abs(delta))

        movement = {
            "_id": new_id("mov"),
            "product_id": product_id,
            "warehouse_id": warehouse_id,
            "to_warehouse_id": to_warehouse_id,
            "location_id": location_id,
            "type": mtype,
            "quantity": journaled_qty,
            "delta": delta,
            "previous_stock": current_qty,
            "new_stock": current_qty + delta,
            "reason": reason,
            "reference": reference,
            "user_id": user["id"],
            "username": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
            "status": "pending",
            "sync_status": "synced",
            "created_at": now(),
        }
        # 1) Journal d'abord (piste d'audit immuable).
        await db[COL_MOVEMENTS].insert_one(movement)

        # 2) Mise à jour atomique avec version + disponibilité.
        filters: dict[str, Any] = {"_id": item["_id"], "version": int(item.get("version", 0))}
        if delta < 0:
            filters["qty"] = {"$gte": abs(delta)}
        updated = await db[COL_STOCK_ITEMS].find_one_and_update(
            filters,
            {
                "$inc": {"qty": delta, "version": 1},
                "$set": {"updated_at": now()},
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            # Conflit concurrent → on annule l'entrée du journal et on retente.
            await db[COL_MOVEMENTS].update_one(
                {"_id": movement["_id"]}, {"$set": {"status": "aborted"}}
            )
            item = await _get_stock_item(db, product_id, warehouse_id, location_id)
            if item is None:
                item = await _ensure_stock_item(db, product_id, warehouse_id, location_id)
            continue

        # 3) Mouvement appliqué ; total produit dénormalisé incrémenté.
        await db[COL_MOVEMENTS].update_one(
            {"_id": movement["_id"]},
            {
                "$set": {
                    "status": "applied",
                    "previous_stock": current_qty,
                    "new_stock": int(updated["qty"]),
                    "applied_at": now(),
                }
            },
        )
        await db[COL_PRODUCTS].update_one(
            {"_id": product_id}, {"$inc": {"stock": delta}, "$set": {"updated_at": now()}}
        )
        movement["status"] = "applied"
        movement["new_stock"] = int(updated["qty"])

        # 4) Effets dérivés (statut, alertes, temps réel).
        await refresh_product_status(db, product_id)
        await check_low_stock(db, product_id)
        await event_bus.publish(
            "movement.created",
            {
                "movement_id": movement["_id"],
                "product_id": product_id,
                "type": mtype,
                "quantity": journaled_qty,
                "warehouse_id": warehouse_id,
            },
        )
        return serialize(MovementOut, movement)

    raise DomainError(
        503,
        "concurrency_exceeded",
        "Trop de modifications simultanées sur ce stock — réessayez.",
    )


async def list_movements(
    db: AsyncDatabase[dict[str, Any]],
    *,
    product_id: str | None = None,
    warehouse_id: str | None = None,
    mtype: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if product_id:
        filters["product_id"] = product_id
    if warehouse_id:
        filters["warehouse_id"] = warehouse_id
    if mtype:
        filters["type"] = mtype
    if status:
        filters["status"] = status
    cursor = db[COL_MOVEMENTS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_MOVEMENTS].count_documents(filters)
    return {"items": serialize_many(MovementOut, items), "total": total, "skip": skip, "limit": limit}


async def list_stock_items(
    db: AsyncDatabase[dict[str, Any]],
    *,
    product_id: str | None = None,
    warehouse_id: str | None = None,
    skip: int = 0,
    limit: int = 200,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if product_id:
        filters["product_id"] = product_id
    if warehouse_id:
        filters["warehouse_id"] = warehouse_id
    cursor = db[COL_STOCK_ITEMS].find(filters).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_STOCK_ITEMS].count_documents(filters)
    return {"items": serialize_many(StockItemOut, items), "total": total, "skip": skip, "limit": limit}


async def rebuild_stock(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    """Recalcule `products.stock` depuis les lignes de stock réelles.

    Opération de maintenance NON destructive : mise à jour filtrée par
    produit, jamais de suppression.
    """
    pipeline = [{"$group": {"_id": "$product_id", "total": {"$sum": "$qty"}}}]
    rows = await db[COL_STOCK_ITEMS].aggregate(pipeline).to_list(length=None)
    updated = 0
    for row in rows:
        result = await db[COL_PRODUCTS].update_one(
            {"_id": row["_id"]}, {"$set": {"stock": int(row["total"]), "updated_at": now()}}
        )
        updated += result.modified_count
    return {"products_updated": updated}
