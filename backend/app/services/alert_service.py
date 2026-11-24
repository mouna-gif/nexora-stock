"""Alertes : création (manuelle + automatique), lecture, résolution."""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import not_found
from app.models.fields import COL_ALERTS, COL_PRODUCTS, new_id, now
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import AlertOut
from app.services.events import event_bus


async def create_alert(
    db: AsyncDatabase[dict[str, Any]],
    *,
    type: str,
    severity: str,
    title: str,
    message: str,
    product_id: str | None = None,
    warehouse_id: str | None = None,
    action_url: str | None = None,
    dedup: bool = False,
) -> dict[str, Any] | None:
    """Crée une alerte. Avec `dedup=True`, évite les doublons non résolus
    de même type/produit (ex. alertes de stock bas répétitives)."""
    if dedup:
        filters: dict[str, Any] = {"type": type, "is_resolved": False}
        if product_id:
            filters["product_id"] = product_id
        if warehouse_id:
            filters["warehouse_id"] = warehouse_id
        if await db[COL_ALERTS].find_one(filters):
            return None

    doc = {
        "_id": new_id("alr"),
        "type": type,
        "severity": severity,
        "title": title,
        "message": message,
        "product_id": product_id,
        "warehouse_id": warehouse_id,
        "is_read": False,
        "is_resolved": False,
        "created_at": now(),
        "action_url": action_url,
    }
    await db[COL_ALERTS].insert_one(doc)
    await event_bus.publish("alert.created", {"id": doc["_id"], "title": title, "severity": severity})
    return doc


async def list_alerts(
    db: AsyncDatabase[dict[str, Any]],
    *,
    unread_only: bool = False,
    severity: str | None = None,
    type: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if unread_only:
        filters["is_read"] = False
    if severity:
        filters["severity"] = severity
    if type:
        filters["type"] = type
    cursor = (
        db[COL_ALERTS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    )
    items = await cursor.to_list(length=limit)
    total = await db[COL_ALERTS].count_documents(filters)
    return {"items": serialize_many(AlertOut, items), "total": total, "skip": skip, "limit": limit}


async def mark_read(db: AsyncDatabase[dict[str, Any]], alert_id: str) -> dict[str, Any]:
    doc = await db[COL_ALERTS].find_one_and_update(
        {"_id": alert_id}, {"$set": {"is_read": True}}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise not_found("Alerte", alert_id)
    return serialize(AlertOut, doc)


async def resolve(db: AsyncDatabase[dict[str, Any]], alert_id: str) -> dict[str, Any]:
    doc = await db[COL_ALERTS].find_one_and_update(
        {"_id": alert_id},
        {"$set": {"is_resolved": True, "is_read": True, "resolved_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Alerte", alert_id)
    return serialize(AlertOut, doc)


async def check_low_stock(db: AsyncDatabase[dict[str, Any]], product_id: str) -> None:
    """Après chaque mouvement : alerte si seuils franchis (avec déduplication)."""
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        return
    stock = int(product.get("stock", 0))
    min_stock = int(product.get("min_stock", 0))
    reorder_point = int(product.get("reorder_point", 0))
    sku = product.get("sku", product_id)
    name = product.get("name", "")
    warehouse = product.get("warehouse_id")

    if stock <= 0:
        await create_alert(
            db,
            type="stock",
            severity="critical",
            title=f"Rupture de stock — {name}",
            message=f"Le produit {sku} est en rupture totale (stock = 0).",
            product_id=product_id,
            warehouse_id=warehouse,
            action_url="/app/products",
            dedup=True,
        )
    elif stock < min_stock:
        await create_alert(
            db,
            type="stock",
            severity="warning",
            title=f"Stock bas — {name}",
            message=f"Stock actuel ({stock}) inférieur au minimum ({min_stock}).",
            product_id=product_id,
            warehouse_id=warehouse,
            action_url="/app/products",
            dedup=True,
        )
    elif reorder_point and stock < reorder_point:
        await create_alert(
            db,
            type="purchasing",
            severity="info",
            title=f"Point de réapprovisionnement atteint — {name}",
            message=f"Stock ({stock}) sous le point de commande ({reorder_point}).",
            product_id=product_id,
            warehouse_id=warehouse,
            action_url="/app/smart-procurement",
            dedup=True,
        )
