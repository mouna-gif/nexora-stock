"""Catalogue : produits, catégories, marques, fournisseurs."""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, conflict, not_found
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import ProductOut, SupplierOut
from app.models.fields import (
    COL_BRANDS,
    COL_CATEGORIES,
    COL_PRODUCTS,
    COL_SUPPLIERS,
    new_id,
    now,
)


def _product_public(doc: dict[str, Any]) -> dict[str, Any]:
    return doc


# ── Produits ─────────────────────────────────────────────────


async def list_products(
    db: AsyncDatabase[dict[str, Any]],
    *,
    search: str | None = None,
    category: str | None = None,
    brand: str | None = None,
    status: str | None = None,
    warehouse_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if search:
        filters["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
        ]
    if category and category != "Tous":
        filters["category"] = category
    if brand:
        filters["brand"] = brand
    if status:
        filters["status"] = status
    if warehouse_id:
        filters["warehouse_id"] = warehouse_id

    cursor = db[COL_PRODUCTS].find(filters).skip(skip).limit(limit).sort("name", 1)
    items = await cursor.to_list(length=limit)
    total = await db[COL_PRODUCTS].count_documents(filters)
    return {"items": serialize_many(ProductOut, items), "total": total, "skip": skip, "limit": limit}


async def get_product(db: AsyncDatabase[dict[str, Any]], product_id: str) -> dict[str, Any]:
    doc = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not doc:
        raise not_found("Produit", product_id)
    return serialize(ProductOut, doc)


async def create_product(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any] | None = None
) -> dict[str, Any]:
    payload = dict(payload)
    initial_stock = payload.pop("initial_stock", None)
    sku = payload["sku"].strip()
    if await db[COL_PRODUCTS].find_one({"sku": sku}):
        raise conflict("sku_exists", f"Un produit existe déjà avec le SKU {sku}.")
    barcode = (payload.get("barcode") or "").strip() or None
    if barcode and await db[COL_PRODUCTS].find_one({"barcode": barcode}):
        raise conflict("barcode_exists", f"Un produit existe déjà avec le code-barres {barcode}.")
    if payload["min_stock"] < 0 or payload["max_stock"] < payload["min_stock"]:
        raise DomainError(422, "invalid_thresholds", "Seuils de stock incohérents (min ≤ max).")
    doc = {
        "_id": new_id("prd"),
        **payload,
        "sku": sku,
        "barcode": barcode,
        "images": payload.get("images") or [],
        "unit_conversions": payload.get("unit_conversions") or [],
        "is_active": payload.get("is_active", True),
        "stock": 0,
        "status": "out_of_stock",
        "ai_risk": "none",
        "ai_risk_score": 0,
        "tags": payload.get("tags") or [],
        "created_at": now(),
        "updated_at": now(),
    }
    await db[COL_PRODUCTS].insert_one(doc)
    # Catégorie/marque référencées automatiquement (idempotent).
    await ensure_category(db, doc["category"])
    await ensure_brand(db, doc["brand"])
    # Stock initial UNIQUEMENT via une opération de stock valide (mouvement tracé).
    if user and initial_stock:
        qty = int(initial_stock.get("quantity") or 0)
        if qty > 0:
            from app.services.stock_service import apply_movement

            warehouse_id = initial_stock.get("warehouse_id") or payload.get("warehouse_id")
            await apply_movement(
                db,
                product_id=doc["_id"],
                warehouse_id=warehouse_id,
                mtype="in",
                quantity=qty,
                reason="Stock initial",
                user=user,
                location_id=initial_stock.get("location_id"),
                reference=doc["_id"],
            )
            return await get_product(db, doc["_id"])
    return serialize(ProductOut, doc)


async def update_product(
    db: AsyncDatabase[dict[str, Any]], product_id: str, fields: dict[str, Any]
) -> dict[str, Any]:
    fields = {k: v for k, v in fields.items() if v is not None}
    if "barcode" in fields:
        barcode = (fields["barcode"] or "").strip() or None
        fields["barcode"] = barcode
        if barcode:
            existing = await db[COL_PRODUCTS].find_one({"barcode": barcode})
            if existing and existing["_id"] != product_id:
                raise conflict(
                    "barcode_exists", f"Un produit existe déjà avec le code-barres {barcode}.")
    if not fields:
        return await get_product(db, product_id)
    doc = await db[COL_PRODUCTS].find_one_and_update(
        {"_id": product_id},
        {"$set": {**fields, "updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Produit", product_id)
    return serialize(ProductOut, doc)


async def refresh_product_status(db: AsyncDatabase[dict[str, Any]], product_id: str) -> str:
    """Recalcule le statut du produit d'après son stock courant (non destructif)."""
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        return "unknown"
    if product.get("status") == "discontinued":
        return "discontinued"
    stock = int(product.get("stock", 0))
    min_stock = int(product.get("min_stock", 0))
    if stock <= 0:
        status = "out_of_stock"
    elif stock < min_stock:
        status = "low_stock"
    else:
        status = "in_stock"
    if status != product.get("status"):
        await db[COL_PRODUCTS].update_one(
            {"_id": product_id}, {"$set": {"status": status, "updated_at": now()}}
        )
    return status


# ── Catégories & marques ─────────────────────────────────────


async def ensure_category(db: AsyncDatabase[dict[str, Any]], name: str) -> None:
    await db[COL_CATEGORIES].update_one(
        {"name": name}, {"$setOnInsert": {"_id": new_id("cat"), "name": name, "created_at": now()}},
        upsert=True,
    )


async def ensure_brand(db: AsyncDatabase[dict[str, Any]], name: str) -> None:
    await db[COL_BRANDS].update_one(
        {"name": name}, {"$setOnInsert": {"_id": new_id("brd"), "name": name, "created_at": now()}},
        upsert=True,
    )


async def list_categories(db: AsyncDatabase[dict[str, Any]]) -> list[dict[str, Any]]:
    cats = await db[COL_CATEGORIES].find({}).sort("name", 1).to_list(length=500)
    result = []
    for cat in cats:
        count = await db[COL_PRODUCTS].count_documents({"category": cat["name"]})
        result.append({"id": cat["_id"], "name": cat["name"], "product_count": count})
    return result


async def list_brands(db: AsyncDatabase[dict[str, Any]]) -> list[dict[str, Any]]:
    brands = await db[COL_BRANDS].find({}).sort("name", 1).to_list(length=500)
    result = []
    for brand in brands:
        count = await db[COL_PRODUCTS].count_documents({"brand": brand["name"]})
        result.append({"id": brand["_id"], "name": brand["name"], "product_count": count})
    return result


# ── Fournisseurs ─────────────────────────────────────────────


async def list_suppliers(
    db: AsyncDatabase[dict[str, Any]], *, skip: int = 0, limit: int = 200
) -> dict[str, Any]:
    cursor = db[COL_SUPPLIERS].find({}).skip(skip).limit(limit).sort("name", 1)
    items = await cursor.to_list(length=limit)
    total = await db[COL_SUPPLIERS].count_documents({})
    return {"items": serialize_many(SupplierOut, items), "total": total, "skip": skip, "limit": limit}


async def get_supplier(db: AsyncDatabase[dict[str, Any]], supplier_id: str) -> dict[str, Any]:
    doc = await db[COL_SUPPLIERS].find_one({"_id": supplier_id})
    if not doc:
        raise not_found("Fournisseur", supplier_id)
    return serialize(SupplierOut, doc)


async def create_supplier(db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    code = payload["code"].strip()
    if await db[COL_SUPPLIERS].find_one({"code": code}):
        raise conflict("supplier_code_exists", f"Un fournisseur existe déjà avec le code {code}.")
    doc = {
        "_id": new_id("sup"),
        **payload,
        "code": code,
        "performance_score": 50,
        "reliability_score": 50,
        "avg_lead_time_days": 0,
        "total_orders": 0,
        "on_time_delivery_rate": 0,
        "is_active": True,
        "created_at": now(),
    }
    await db[COL_SUPPLIERS].insert_one(doc)
    return serialize(SupplierOut, doc)


async def update_supplier(
    db: AsyncDatabase[dict[str, Any]], supplier_id: str, fields: dict[str, Any]
) -> dict[str, Any]:
    fields = {k: v for k, v in fields.items() if v is not None or k == "is_active"}
    if not fields:
        return await get_supplier(db, supplier_id)
    doc = await db[COL_SUPPLIERS].find_one_and_update(
        {"_id": supplier_id},
        {"$set": {**fields, "updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Fournisseur", supplier_id)
    return serialize(SupplierOut, doc)
