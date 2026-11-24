"""Clients — /api/v1/customers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import CustomerCreate, CustomerOut, CustomerUpdate
from app.services import sales_service

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("")
async def list_customers(
    search: str | None = None,
    include_inactive: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("customers:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.list_customers(
        db, search=search, include_inactive=include_inactive, skip=skip, limit=limit
    )


@router.get("/{customer_id}")
async def get_customer(
    customer_id: str,
    user: dict = Depends(require_permission("customers:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.get_customer(db, customer_id)


@router.post("", response_model=CustomerOut)
async def create_customer(
    payload: CustomerCreate,
    user: dict = Depends(require_permission("customers:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.create_customer(db, payload.model_dump(), user)


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    user: dict = Depends(require_permission("customers:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.update_customer(db, customer_id, payload.model_dump(exclude_unset=True), user)
