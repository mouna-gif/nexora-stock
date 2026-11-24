"""Bons de réception — /api/v1/receipts (workflow brouillon → validé)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import GoodsReceiptCreate
from app.services import receipt_service

router = APIRouter(prefix="/receipts", tags=["purchasing"])


@router.get("")
async def list_receipts(
    po_id: str | None = None,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await receipt_service.list_goods_receipts(
        db, po_id=po_id, status=status, skip=skip, limit=limit)


@router.get("/{receipt_id}")
async def get_receipt(
    receipt_id: str,
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await receipt_service.get_goods_receipt(db, receipt_id)


@router.post("")
async def create_receipt(
    payload: GoodsReceiptCreate,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Crée un bon de réception BROUILLON — aucun stock à ce stade."""
    return await receipt_service.create_goods_receipt(
        db,
        po_id=payload.po_id,
        lines=[l.model_dump() for l in payload.lines],
        warehouse_id=payload.warehouse_id,
        location_id=payload.location_id,
        notes=payload.notes,
        user=user,
    )


@router.post("/{receipt_id}/validate")
async def validate_receipt(
    receipt_id: str,
    user: dict = Depends(require_permission("inventory:move")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """VALIDATION = entrée de stock réelle (mouvements atomiques, anti-doublon)."""
    return await receipt_service.validate_goods_receipt(db, receipt_id, user)
