"""Entrepôts, zones et emplacements."""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import conflict, not_found
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import LocationOut, WarehouseOut, ZoneOut
from app.models.fields import COL_PRODUCTS, COL_STOCK_ITEMS, COL_WAREHOUSES, new_id, now


def _zone_public(zone: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": zone["id"],
        "warehouse_id": zone.get("warehouse_id", ""),
        "name": zone.get("name", ""),
        "code": zone.get("code", ""),
        "type": zone.get("type", "storage"),
        "capacity": zone.get("capacity", 0),
        "used_capacity": zone.get("used_capacity", 0),
        "locations": zone.get("locations", []),
    }


def warehouse_public(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["_id"],
        "name": doc.get("name", ""),
        "code": doc.get("code", ""),
        "address": doc.get("address", ""),
        "city": doc.get("city", ""),
        "capacity": doc.get("capacity", 0),
        "used_capacity": doc.get("used_capacity", 0),
        "zones": [_zone_public(z) for z in doc.get("zones", [])],
        "manager": doc.get("manager", ""),
        "is_active": doc.get("is_active", True),
    }


async def list_warehouses(db: AsyncDatabase[dict[str, Any]]) -> list[dict[str, Any]]:
    docs = await db[COL_WAREHOUSES].find({}).sort("name", 1).to_list(length=200)
    return [serialize(WarehouseOut, warehouse_public(d)) for d in docs]


async def get_warehouse(db: AsyncDatabase[dict[str, Any]], warehouse_id: str) -> dict[str, Any]:
    doc = await db[COL_WAREHOUSES].find_one({"_id": warehouse_id})
    if not doc:
        raise not_found("Entrepôt", warehouse_id)
    return serialize(WarehouseOut, warehouse_public(doc))


async def create_warehouse(db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    code = payload["code"].strip()
    if await db[COL_WAREHOUSES].find_one({"code": code}):
        raise conflict("warehouse_code_exists", f"Un entrepôt existe déjà avec le code {code}.")
    doc = {
        "_id": new_id("wh"),
        **payload,
        "code": code,
        "used_capacity": 0,
        "zones": [],
        "is_active": True,
        "created_at": now(),
    }
    await db[COL_WAREHOUSES].insert_one(doc)
    return serialize(WarehouseOut, warehouse_public(doc))


async def create_zone(
    db: AsyncDatabase[dict[str, Any]], warehouse_id: str, payload: dict[str, Any]
) -> dict[str, Any]:
    warehouse = await db[COL_WAREHOUSES].find_one({"_id": warehouse_id})
    if not warehouse:
        raise not_found("Entrepôt", warehouse_id)
    if any(z["code"] == payload["code"] for z in warehouse.get("zones", [])):
        raise conflict("zone_code_exists", f"Une zone existe déjà avec le code {payload['code']}.")
    zone = {
        "id": new_id("zone"),
        "warehouse_id": warehouse_id,
        "name": payload["name"],
        "code": payload["code"],
        "type": payload.get("type", "storage"),
        "capacity": payload.get("capacity", 0),
        "used_capacity": 0,
        "locations": [],
    }
    await db[COL_WAREHOUSES].update_one(
        {"_id": warehouse_id}, {"$push": {"zones": zone}, "$set": {"updated_at": now()}}
    )
    return serialize(ZoneOut, _zone_public(zone))


async def create_location(
    db: AsyncDatabase[dict[str, Any]], warehouse_id: str, zone_id: str, payload: dict[str, Any]
) -> dict[str, Any]:
    warehouse = await db[COL_WAREHOUSES].find_one(
        {"_id": warehouse_id, "zones.id": zone_id},
        {"zones": {"$elemMatch": {"id": zone_id}}},
    )
    if not warehouse or not warehouse.get("zones"):
        raise not_found("Zone", zone_id)
    location = {
        "id": new_id("loc"),
        "zone_id": zone_id,
        "code": payload["code"],
        "row": payload.get("row", ""),
        "column": payload.get("column", ""),
        "level": payload.get("level", ""),
        "product_id": None,
        "quantity": 0,
        "max_quantity": payload.get("max_quantity", 0),
    }
    await db[COL_WAREHOUSES].update_one(
        {"_id": warehouse_id, "zones.id": zone_id},
        {"$push": {"zones.$.locations": location}, "$set": {"updated_at": now()}},
    )
    return serialize(LocationOut, location)


async def list_locations(
    db: AsyncDatabase[dict[str, Any]], *, warehouse_id: str | None = None, zone_id: str | None = None
) -> list[dict[str, Any]]:
    filters: dict[str, Any] = {}
    if warehouse_id:
        filters["_id"] = warehouse_id
    docs = await db[COL_WAREHOUSES].find(filters).to_list(length=200)
    result: list[dict[str, Any]] = []
    for doc in docs:
        for zone in doc.get("zones", []):
            if zone_id and zone["id"] != zone_id:
                continue
            for loc in zone.get("locations", []):
                result.append(serialize(LocationOut, loc))
    return result


async def recalc_used_capacity(db: AsyncDatabase[dict[str, Any]], warehouse_id: str) -> None:
    """Capacité utilisée = somme des quantités en stock (calcul non destructif)."""
    pipeline = [
        {"$match": {"warehouse_id": warehouse_id}},
        {"$group": {"_id": None, "total": {"$sum": "$qty"}}},
    ]
    rows = await db[COL_STOCK_ITEMS].aggregate(pipeline).to_list(length=1)
    total = rows[0]["total"] if rows else 0
    await db[COL_WAREHOUSES].update_one(
        {"_id": warehouse_id}, {"$set": {"used_capacity": total, "updated_at": now()}}
    )


async def count_products_for(db: AsyncDatabase[dict[str, Any]], warehouse_id: str) -> int:
    return await db[COL_PRODUCTS].count_documents({"warehouse_id": warehouse_id})
