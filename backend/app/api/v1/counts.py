"""Inventaires physiques (comptages) — /api/v1/counts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import CountCreate, CountLineUpsert, MessageOut
from app.services import count_service

router = APIRouter(prefix="/counts", tags=["counts"])


@router.get("")
async def list_counts(
    warehouse_id: str | None = None,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("inventory:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await count_service.list_counts(db, warehouse_id=warehouse_id, status=status, skip=skip, limit=limit)


@router.get("/{count_id}")
async def get_count(
    count_id: str,
    user: dict = Depends(require_permission("inventory:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await count_service.get_count(db, count_id)


@router.post("")
async def create_count(
    payload: CountCreate,
    user: dict = Depends(require_permission("inventory:adjust")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await count_service.create_count(
        db, warehouse_id=payload.warehouse_id, product_ids=payload.product_ids, user=user
    )


@router.post("/{count_id}/lines")
async def upsert_line(
    count_id: str,
    payload: CountLineUpsert,
    user: dict = Depends(require_permission("inventory:adjust")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await count_service.upsert_count_line(db, count_id, payload.product_id, payload.counted_qty)


@router.post("/{count_id}/complete")
async def complete_count(
    count_id: str,
    user: dict = Depends(require_permission("inventory:adjust")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Clôture : génère les mouvements d'écart via le service atomique."""
    return await count_service.complete_count(db, count_id, user)


@router.post("/{count_id}/cancel", response_model=MessageOut)
async def cancel_count(
    count_id: str,
    user: dict = Depends(require_permission("inventory:adjust")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    await count_service.cancel_count(db, count_id)
    return {"message": "Inventaire annulé."}
