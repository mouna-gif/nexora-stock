"""Emplacements — /api/v1/locations."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.services import warehouse_service

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("")
async def list_locations(
    warehouse_id: str | None = None,
    zone_id: str | None = None,
    user: dict = Depends(require_permission("warehouses:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await warehouse_service.list_locations(db, warehouse_id=warehouse_id, zone_id=zone_id)
