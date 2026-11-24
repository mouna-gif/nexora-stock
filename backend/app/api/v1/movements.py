"""Mouvements de stock (journal immuable) — /api/v1/movements."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import MovementCreate
from app.services import stock_service

router = APIRouter(prefix="/movements", tags=["movements"])


@router.get("")
async def list_movements(
    product_id: str | None = None,
    warehouse_id: str | None = None,
    type: str | None = None,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(require_permission("inventory:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await stock_service.list_movements(
        db, product_id=product_id, warehouse_id=warehouse_id, mtype=type,
        status=status, skip=skip, limit=limit,
    )


@router.post("")
async def create_movement(
    payload: MovementCreate,
    user: dict = Depends(require_permission("inventory:move")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Entrée / sortie / ajustement signé — application ATOMIQUE."""
    return await stock_service.apply_movement(
        db,
        product_id=payload.product_id,
        warehouse_id=payload.warehouse_id,
        mtype=payload.type,
        quantity=payload.quantity,
        reason=payload.reason,
        user=user,
        location_id=payload.location_id,
        to_warehouse_id=payload.to_warehouse_id,
    )
