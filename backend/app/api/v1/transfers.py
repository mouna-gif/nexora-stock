"""Transferts inter-entrepôts — /api/v1/transfers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import TransferCreate
from app.services import transfer_service

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.get("")
async def list_transfers(
    product_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("inventory:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await transfer_service.list_transfers(db, product_id=product_id, skip=skip, limit=limit)


@router.post("")
async def create_transfer(
    payload: TransferCreate,
    user: dict = Depends(require_permission("inventory:move")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await transfer_service.create_transfer(
        db,
        product_id=payload.product_id,
        from_warehouse_id=payload.from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        quantity=payload.quantity,
        reason=payload.reason,
        user=user,
    )
