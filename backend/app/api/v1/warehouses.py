"""Entrepôts, zones, emplacements — /api/v1/warehouses, /api/v1/locations."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import LocationCreate, WarehouseCreate, WarehouseOut, ZoneCreate
from app.services import warehouse_service

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


@router.get("")
async def list_warehouses(
    user: dict = Depends(require_permission("warehouses:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await warehouse_service.list_warehouses(db)


@router.get("/{warehouse_id}")
async def get_warehouse(
    warehouse_id: str,
    user: dict = Depends(require_permission("warehouses:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await warehouse_service.get_warehouse(db, warehouse_id)


@router.post("", response_model=WarehouseOut)
async def create_warehouse(
    payload: WarehouseCreate,
    user: dict = Depends(require_permission("warehouses:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await warehouse_service.create_warehouse(db, payload.model_dump())


@router.post("/{warehouse_id}/zones")
async def create_zone(
    warehouse_id: str,
    payload: ZoneCreate,
    user: dict = Depends(require_permission("warehouses:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await warehouse_service.create_zone(db, warehouse_id, payload.model_dump())


@router.post("/{warehouse_id}/zones/{zone_id}/locations")
async def create_location(
    warehouse_id: str,
    zone_id: str,
    payload: LocationCreate,
    user: dict = Depends(require_permission("warehouses:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await warehouse_service.create_location(db, warehouse_id, zone_id, payload.model_dump())
