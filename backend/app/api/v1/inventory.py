"""Inventaire (lignes de stock) — /api/v1/inventory."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import InventoryAdjustCount, MessageOut
from app.services import stock_service

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/stock-items")
async def list_stock_items(
    product_id: str | None = None,
    warehouse_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    user: dict = Depends(require_permission("inventory:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await stock_service.list_stock_items(
        db, product_id=product_id, warehouse_id=warehouse_id, skip=skip, limit=limit
    )


@router.post("/adjust", response_model=None)
async def adjust_count(
    payload: InventoryAdjustCount,
    user: dict = Depends(require_permission("inventory:adjust")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Ajustement de type inventaire : met le stock à niveau vers la quantité comptée."""
    movement = await stock_service.apply_movement(
        db,
        product_id=payload.product_id,
        warehouse_id=payload.warehouse_id,
        mtype="inventory",
        counted_quantity=payload.counted_quantity,
        reason=payload.reason or "Ajustement manuel",
        user=user,
        location_id=payload.location_id,
    )
    return movement


@router.post("/rebuild", response_model=MessageOut)
async def rebuild_stock(
    user: dict = Depends(require_permission("inventory:adjust")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Maintenance : recalcule products.stock depuis les lignes de stock (non destructif)."""
    result = await stock_service.rebuild_stock(db)
    return {"message": f"Stock recalculé pour {result['products_updated']} produit(s)."}
