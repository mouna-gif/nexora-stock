"""Transferts inter-entrepôts — deux jambes atomiques (sortie puis entrée)."""

from __future__ import annotations

from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import COL_TRANSFERS, new_id, now
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import TransferOut
from app.services.stock_service import apply_movement


async def list_transfers(
    db: AsyncDatabase[dict[str, Any]], *, product_id: str | None = None, skip: int = 0, limit: int = 100
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if product_id:
        filters["product_id"] = product_id
    cursor = db[COL_TRANSFERS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_TRANSFERS].count_documents(filters)
    return {"items": serialize_many(TransferOut, items), "total": total, "skip": skip, "limit": limit}


async def create_transfer(
    db: AsyncDatabase[dict[str, Any]],
    *,
    product_id: str,
    from_warehouse_id: str,
    to_warehouse_id: str,
    quantity: int,
    reason: str,
    user: dict[str, Any],
) -> dict[str, Any]:
    if quantity <= 0:
        raise DomainError(422, "invalid_quantity", "La quantité transférée doit être positive.")
    if from_warehouse_id == to_warehouse_id:
        raise DomainError(
            422, "same_warehouse", "L'entrepôt source et l'entrepôt de destination doivent différer."
        )
    product = await db["products"].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)

    transfer = {
        "_id": new_id("trf"),
        "product_id": product_id,
        "from_warehouse_id": from_warehouse_id,
        "to_warehouse_id": to_warehouse_id,
        "quantity": quantity,
        "reason": reason or "Transfert inter-entrepôts",
        "status": "completed",
        "user_id": user["id"],
        "created_at": now(),
    }

    # Jambe 1 : sortie (atomique, condition de disponibilité).
    out_mov = await apply_movement(
        db,
        product_id=product_id,
        warehouse_id=from_warehouse_id,
        mtype="out",
        quantity=quantity,
        reason=f"Transfert vers {to_warehouse_id} — {transfer['reason']}",
        user=user,
        reference=transfer["_id"],
    )
    transfer["movement_out_id"] = out_mov["id"]

    # Jambe 2 : entrée (validée en amont : entrepôts existants).
    try:
        in_mov = await apply_movement(
            db,
            product_id=product_id,
            warehouse_id=to_warehouse_id,
            mtype="in",
            quantity=quantity,
            reason=f"Transfert depuis {from_warehouse_id} — {transfer['reason']}",
            user=user,
            reference=transfer["_id"],
        )
        transfer["movement_in_id"] = in_mov["id"]
    except DomainError:
        transfer["status"] = "failed"
        await db[COL_TRANSFERS].insert_one(transfer)
        raise

    await db[COL_TRANSFERS].insert_one(transfer)
    return serialize(TransferOut, transfer)
