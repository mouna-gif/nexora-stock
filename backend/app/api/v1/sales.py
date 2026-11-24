"""Cycle de VENTES — /api/v1/sales/*.

Devis → commande client → bons de livraison → factures → règlements.
Chaque action sensible est protégée par une permission serveur.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import (
    DeliveryNoteCreate,
    InvoiceGenerate,
    PaymentCreate,
    SalesOrderCreate,
    SalesQuotationCreate,
    SalesQuotationUpdate,
    TransitionRequest,
)
from app.services import payments, sales_service

router = APIRouter(prefix="/sales", tags=["sales"])


# ── Devis clients ────────────────────────────────────────────


@router.get("/quotations")
async def list_quotations(
    status: str | None = None,
    customer_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.list_sales_quotations(
        db, status=status, customer_id=customer_id, search=search, skip=skip, limit=limit)


@router.get("/quotations/{quotation_id}")
async def get_quotation(
    quotation_id: str,
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.get_sales_quotation(db, quotation_id)


@router.post("/quotations")
async def create_quotation(
    payload: SalesQuotationCreate,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.create_sales_quotation(db, payload.model_dump(), user)


@router.patch("/quotations/{quotation_id}")
async def update_quotation(
    quotation_id: str,
    payload: SalesQuotationUpdate,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.update_sales_quotation(
        db, quotation_id, payload.model_dump(exclude_unset=True), user)


@router.post("/quotations/{quotation_id}/transition")
async def transition_quotation(
    quotation_id: str,
    payload: TransitionRequest,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.transition_quotation(db, quotation_id, payload.to, user)


@router.post("/quotations/{quotation_id}/convert")
async def convert_quotation(
    quotation_id: str,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Conversion devis accepté → commande client (lignes préservées)."""
    return await sales_service.convert_quotation_to_order(db, quotation_id, user)


# ── Commandes clients ────────────────────────────────────────


@router.get("/orders")
async def list_orders(
    status: str | None = None,
    customer_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.list_sales_orders(
        db, status=status, customer_id=customer_id, search=search, skip=skip, limit=limit)


@router.get("/orders/{order_id}")
async def get_order(
    order_id: str,
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.get_sales_order(db, order_id)


@router.post("/orders")
async def create_order(
    payload: SalesOrderCreate,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Commande directe (sans devis) ou manuelle."""
    return await sales_service.create_sales_order(db, payload.model_dump(), user)


@router.patch("/orders/{order_id}")
async def update_order(
    order_id: str,
    payload: SalesOrderCreate,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.update_sales_order(
        db, order_id, payload.model_dump(exclude_unset=True), user)


@router.post("/orders/{order_id}/transition")
async def transition_order(
    order_id: str,
    payload: TransitionRequest,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.transition_sales_order(db, order_id, payload.to, user)


# ── Bons de livraison ────────────────────────────────────────


@router.get("/delivery-notes")
async def list_delivery_notes(
    status: str | None = None,
    sales_order_id: str | None = None,
    customer_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.list_delivery_notes(
        db, status=status, sales_order_id=sales_order_id, customer_id=customer_id,
        search=search, skip=skip, limit=limit)


@router.get("/delivery-notes/{note_id}")
async def get_delivery_note(
    note_id: str,
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.get_delivery_note(db, note_id)


@router.post("/delivery-notes")
async def create_delivery_note(
    payload: DeliveryNoteCreate,
    user: dict = Depends(require_permission("sales:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Brouillon de livraison : AUCUN mouvement de stock à ce stade."""
    return await sales_service.create_delivery_note(db, payload.model_dump(), user)


@router.post("/delivery-notes/{note_id}/validate")
async def validate_delivery_note(
    note_id: str,
    user: dict = Depends(require_permission("sales:deliver")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """VALIDATION = sortie de stock réelle (opération contrôlée)."""
    return await sales_service.validate_delivery_note(db, note_id, user)


@router.post("/delivery-notes/{note_id}/transition")
async def transition_delivery_note(
    note_id: str,
    payload: TransitionRequest,
    user: dict = Depends(require_permission("sales:deliver")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.transition_delivery_note(db, note_id, payload.to, user)


# ── Factures clients ─────────────────────────────────────────


@router.get("/invoices")
async def list_invoices(
    status: str | None = None,
    customer_id: str | None = None,
    sales_order_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.list_customer_invoices(
        db, status=status, customer_id=customer_id, sales_order_id=sales_order_id,
        search=search, skip=skip, limit=limit)


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.get_customer_invoice(db, invoice_id)


@router.post("/invoices/generate")
async def generate_invoice(
    payload: InvoiceGenerate,
    user: dict = Depends(require_permission("sales:invoice")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Facture (brouillon) générée depuis les quantités LIVRÉES non facturées."""
    return await sales_service.generate_invoice_from_order(db, payload.model_dump(), user)


@router.patch("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    payload: SalesQuotationUpdate,
    user: dict = Depends(require_permission("sales:invoice")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    data = payload.model_dump(exclude_unset=True)
    return await sales_service.update_invoice_draft(
        db, invoice_id, data.get("lines") or [], data.get("notes"), user)


@router.post("/invoices/{invoice_id}/validate")
async def validate_invoice(
    invoice_id: str,
    user: dict = Depends(require_permission("sales:invoice")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.validate_invoice(db, invoice_id, user)


@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    payload: TransitionRequest | None = None,
    user: dict = Depends(require_permission("sales:invoice")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await sales_service.cancel_customer_invoice(
        db, invoice_id, user, notes=(payload.notes if payload else None))


# ── Règlements clients ───────────────────────────────────────


@router.get("/payments")
async def list_payments(
    invoice_id: str | None = None,
    customer_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await payments.list_payments(
        db, direction="customer", invoice_id=invoice_id, party_id=customer_id, skip=skip, limit=limit)


@router.get("/payments/{payment_id}")
async def get_payment(
    payment_id: str,
    user: dict = Depends(require_permission("sales:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await payments.get_payment(db, direction="customer", payment_id=payment_id)


@router.post("/payments")
async def register_payment(
    payload: PaymentCreate,
    user: dict = Depends(require_permission("payments:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await payments.register_payment(db, direction="customer", payload=payload.model_dump(), user=user)
