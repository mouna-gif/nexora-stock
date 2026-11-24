"""Cycle d'ACHATS — devis fournisseurs, comparaison, factures et
règlements fournisseurs. (Commandes : /purchase-orders, Réceptions : /receipts.)"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import (
    PaymentCreate,
    SupplierInvoiceCreate,
    SupplierQuotationCreate,
    SupplierQuotationUpdate,
    TransitionRequest,
)
from app.services import payments, purchase_service

router = APIRouter(prefix="/purchasing", tags=["purchasing"])


# ── Devis fournisseurs ───────────────────────────────────────


@router.get("/supplier-quotations")
async def list_supplier_quotations(
    status: str | None = None,
    supplier_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.list_supplier_quotations(
        db, status=status, supplier_id=supplier_id, search=search, skip=skip, limit=limit)


@router.get("/supplier-quotations/{quotation_id}")
async def get_supplier_quotation(
    quotation_id: str,
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.get_supplier_quotation(db, quotation_id)


@router.post("/supplier-quotations")
async def create_supplier_quotation(
    payload: SupplierQuotationCreate,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.create_supplier_quotation(db, payload.model_dump(), user)


@router.patch("/supplier-quotations/{quotation_id}")
async def update_supplier_quotation(
    quotation_id: str,
    payload: SupplierQuotationUpdate,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.update_supplier_quotation(
        db, quotation_id, payload.model_dump(exclude_unset=True), user)


@router.post("/supplier-quotations/{quotation_id}/transition")
async def transition_supplier_quotation(
    quotation_id: str,
    payload: TransitionRequest,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.transition_supplier_quotation(db, quotation_id, payload.to, user)


@router.post("/supplier-quotations/{quotation_id}/convert")
async def convert_supplier_quotation(
    quotation_id: str,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Devis fournisseur accepté → commande d'achat (conditions préservées)."""
    return await purchase_service.convert_supplier_quotation(db, quotation_id, user)


@router.get("/compare")
async def compare_offers(
    product_id: str,
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Compare les devis fournisseurs pour un produit (prix net croissant)."""
    return await purchase_service.compare_supplier_quotations(db, product_id)


# ── Factures fournisseurs ────────────────────────────────────


@router.get("/supplier-invoices")
async def list_supplier_invoices(
    status: str | None = None,
    supplier_id: str | None = None,
    purchase_order_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.list_supplier_invoices(
        db, status=status, supplier_id=supplier_id, purchase_order_id=purchase_order_id,
        search=search, skip=skip, limit=limit)


@router.get("/supplier-invoices/{invoice_id}")
async def get_supplier_invoice(
    invoice_id: str,
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.get_supplier_invoice(db, invoice_id)


@router.post("/supplier-invoices")
async def create_supplier_invoice(
    payload: SupplierInvoiceCreate,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.create_supplier_invoice(db, payload.model_dump(), user)


@router.post("/supplier-invoices/{invoice_id}/validate")
async def validate_supplier_invoice(
    invoice_id: str,
    user: dict = Depends(require_permission("purchasing:invoice")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Validation comptable : bornes anti sur-facturation + écarts consignés."""
    return await purchase_service.validate_supplier_invoice(db, invoice_id, user)


@router.post("/supplier-invoices/{invoice_id}/cancel")
async def cancel_supplier_invoice(
    invoice_id: str,
    payload: TransitionRequest | None = None,
    user: dict = Depends(require_permission("purchasing:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await purchase_service.cancel_supplier_invoice(
        db, invoice_id, user, notes=(payload.notes if payload else None))


# ── Règlements fournisseurs ──────────────────────────────────


@router.get("/supplier-payments")
async def list_supplier_payments(
    invoice_id: str | None = None,
    supplier_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await payments.list_payments(
        db, direction="supplier", invoice_id=invoice_id, party_id=supplier_id, skip=skip, limit=limit)


@router.get("/supplier-payments/{payment_id}")
async def get_supplier_payment(
    payment_id: str,
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await payments.get_payment(db, direction="supplier", payment_id=payment_id)


@router.post("/supplier-payments")
async def register_supplier_payment(
    payload: PaymentCreate,
    user: dict = Depends(require_permission("payments:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await payments.register_payment(db, direction="supplier", payload=payload.model_dump(), user=user)
