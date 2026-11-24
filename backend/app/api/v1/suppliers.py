"""Fournisseurs — /api/v1/suppliers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import SupplierCreate, SupplierOut, SupplierUpdate
from app.services import catalog_service

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("")
async def list_suppliers(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    user: dict = Depends(require_permission("suppliers:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.list_suppliers(db, skip=skip, limit=limit)


@router.get("/{supplier_id}")
async def get_supplier(
    supplier_id: str,
    user: dict = Depends(require_permission("suppliers:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.get_supplier(db, supplier_id)


@router.post("", response_model=SupplierOut)
async def create_supplier(
    payload: SupplierCreate,
    user: dict = Depends(require_permission("suppliers:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.create_supplier(db, payload.model_dump())


@router.patch("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    user: dict = Depends(require_permission("suppliers:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.update_supplier(db, supplier_id, payload.model_dump(exclude_unset=True))
