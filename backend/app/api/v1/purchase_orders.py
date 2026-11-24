"""Commandes d'achat — /api/v1/purchase-orders."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_current_user, get_db, require_permission
from app.schemas import PurchaseOrderCreate, PurchaseStatusUpdate
from app.security.rbac import require_role_permission
from app.services import po_service

router = APIRouter(prefix="/purchase-orders", tags=["purchasing"])


@router.get("")
async def list_purchase_orders(
    status: str | None = None,
    supplier_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await po_service.list_purchase_orders(db, status=status, supplier_id=supplier_id, skip=skip, limit=limit)


@router.get("/{po_id}")
async def get_purchase_order(
    po_id: str,
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await po_service.get_purchase_order(db, po_id)


@router.post("")
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await po_service.create_purchase_order(
        db,
        supplier_id=payload.supplier_id,
        lines=[l.model_dump() for l in payload.lines],
        expected_delivery=payload.expected_delivery,
        notes=payload.notes,
        ai_recommended=payload.ai_recommended,
        user=user,
        supplier_quotation_id=payload.supplier_quotation_id,
    )


@router.post("/{po_id}/transition")
async def transition(
    po_id: str,
    payload: PurchaseStatusUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Transitions de statut. `approved` exige purchasing:approve ;
    `pending` / `ordered` / `cancelled` exigent purchasing:write."""
    if payload.to == "approved":
        require_role_permission(user["role"], "purchasing:approve")
    else:
        require_role_permission(user["role"], "purchasing:write")
    return await po_service.transition(db, po_id, payload.to, user)
