"""Schémas du domaine commercial (ventes, achats, facturation, média).

Tous en camelCase côté API (voir schemas/base.py).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from .base import BaseSchema

# ── Statuts ──────────────────────────────────────────────────
SalesQuotationStatus = Literal["draft", "sent", "accepted", "rejected", "cancelled"]
SalesOrderStatus = Literal["draft", "confirmed", "partial", "delivered", "cancelled"]
DeliveryNoteStatus = Literal["draft", "validated", "delivered", "cancelled"]
CustomerInvoiceStatus = Literal["draft", "validated", "partial", "paid", "cancelled"]
SupplierQuotationStatus = Literal["draft", "received", "accepted", "rejected"]
GoodsReceiptStatus = Literal["draft", "validated"]
SupplierInvoiceStatus = Literal["draft", "validated", "partial", "paid"]
PaymentMethod = Literal["cash", "cheque", "bank_transfer", "card", "other"]

PAYMENT_METHOD_LABELS = {
    "cash": "Espèces",
    "cheque": "Chèque",
    "bank_transfer": "Virement bancaire",
    "card": "Carte bancaire",
    "other": "Autre",
}


class TotalsOut(BaseSchema):
    total_ht: float = 0
    total_tax: float = 0
    total_ttc: float = 0
    tax_breakdown: dict[str, float] = {}


class DocLineInput(BaseSchema):
    product_id: str
    quantity: int
    unit_price: float | None = None
    discount_pct: float = 0
    tax_rate: float | None = None


class DocLineOut(BaseSchema):
    id: str
    product_id: str
    sku: str = ""
    name: str = ""
    unit: str = ""
    quantity: int
    unit_price: float = 0
    discount_pct: float = 0
    tax_rate: float = 0
    gross_amount: float = 0
    discount_amount: float = 0
    net_amount: float = 0
    tax_amount: float = 0
    total_ttc: float = 0


# ── Clients ──────────────────────────────────────────────────


class CustomerOut(BaseSchema):
    id: str
    code: str
    name: str
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    country: str = "Tunisie"
    tax_id: str = ""
    payment_terms_days: int = 30
    notes: str = ""
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CustomerCreate(BaseSchema):
    name: str
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    country: str = "Tunisie"
    tax_id: str = ""
    payment_terms_days: int = 30
    notes: str = ""


class CustomerUpdate(BaseSchema):
    name: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    tax_id: str | None = None
    payment_terms_days: int | None = None
    notes: str | None = None
    is_active: bool | None = None


# ── Devis clients ────────────────────────────────────────────


class SalesQuotationOut(BaseSchema):
    id: str
    number: str
    status: SalesQuotationStatus = "draft"
    customer_id: str
    customer_name: str = ""
    customer_snapshot: dict[str, Any] = {}
    date: datetime | str | None = None
    valid_until: datetime | str | None = None
    lines: list[DocLineOut] = []
    totals: TotalsOut = TotalsOut()
    currency: str = "TND"
    notes: str = ""
    terms: str = ""
    sales_order_id: str | None = None
    sales_order_number: str | None = None
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None
    history: list[dict[str, Any]] = []


class SalesQuotationCreate(BaseSchema):
    customer_id: str
    lines: list[DocLineInput]
    date: datetime | str | None = None
    valid_until: datetime | str | None = None
    notes: str = ""
    terms: str = ""


class SalesQuotationUpdate(BaseSchema):
    lines: list[DocLineInput] | None = None
    valid_until: datetime | str | None = None
    notes: str | None = None
    terms: str | None = None


class TransitionRequest(BaseSchema):
    to: str
    notes: str | None = None


# ── Commandes clients ────────────────────────────────────────


class SalesOrderLineOut(DocLineOut):
    delivered_quantity: int = 0
    invoiced_quantity: int = 0


class SalesOrderOut(BaseSchema):
    id: str
    number: str
    status: SalesOrderStatus = "draft"
    customer_id: str
    customer_name: str = ""
    customer_snapshot: dict[str, Any] = {}
    quotation_id: str | None = None
    quotation_number: str | None = None
    lines: list[SalesOrderLineOut] = []
    totals: TotalsOut = TotalsOut()
    currency: str = "TND"
    delivery_address: str = ""
    delivery_city: str = ""
    expected_delivery_date: datetime | str | None = None
    payment_terms_days: int = 30
    notes: str = ""
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None
    history: list[dict[str, Any]] = []


class SalesOrderCreate(BaseSchema):
    customer_id: str
    lines: list[DocLineInput]
    quotation_id: str | None = None
    delivery_address: str = ""
    delivery_city: str = ""
    expected_delivery_date: datetime | str | None = None
    payment_terms_days: int | None = None
    notes: str = ""


# ── Bons de livraison ────────────────────────────────────────


class DeliveryNoteLineCreate(BaseSchema):
    line_id: str
    quantity: int


class DeliveryNoteLineOut(BaseSchema):
    id: str
    order_line_id: str
    product_id: str
    sku: str = ""
    name: str = ""
    unit: str = ""
    quantity: int
    ordered_quantity: int = 0
    delivered_on_order: int = 0
    warehouse_id: str = ""
    warehouse_name: str = ""
    location_id: str | None = None


class DeliveryNoteOut(BaseSchema):
    id: str
    number: str
    status: DeliveryNoteStatus = "draft"
    sales_order_id: str
    sales_order_number: str = ""
    customer_id: str
    customer_name: str = ""
    customer_snapshot: dict[str, Any] = {}
    lines: list[DeliveryNoteLineOut] = []
    delivery_address: str = ""
    delivery_city: str = ""
    delivery_date: datetime | str | None = None
    driver: str = ""
    signature_name: str = ""
    notes: str = ""
    movement_ids: list[str] = []
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    validated_at: datetime | None = None
    history: list[dict[str, Any]] = []


class DeliveryNoteCreate(BaseSchema):
    sales_order_id: str
    lines: list[DeliveryNoteLineCreate]
    warehouse_id: str
    location_id: str | None = None
    delivery_address: str = ""
    delivery_city: str = ""
    delivery_date: datetime | str | None = None
    driver: str = ""
    signature_name: str = ""
    notes: str = ""


# ── Factures clients ─────────────────────────────────────────


class InvoiceGenerate(BaseSchema):
    sales_order_id: str
    lines: list[DeliveryNoteLineCreate] = []  # vide → toutes les quantités facturables
    notes: str = ""


class CustomerInvoiceOut(BaseSchema):
    id: str
    number: str
    status: CustomerInvoiceStatus = "draft"
    customer_id: str
    customer_name: str = ""
    customer_snapshot: dict[str, Any] = {}
    quotation_id: str | None = None
    quotation_number: str | None = None
    sales_order_id: str | None = None
    sales_order_number: str | None = None
    delivery_note_ids: list[str] = []
    delivery_note_numbers: list[str] = []
    lines: list[DocLineOut] = []
    totals: TotalsOut = TotalsOut()
    currency: str = "TND"
    amount_paid: float = 0
    balance_due: float = 0
    payment_terms_days: int = 30
    due_date: datetime | str | None = None
    overdue: bool = False
    notes: str = ""
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    validated_at: datetime | None = None
    history: list[dict[str, Any]] = []


# ── Règlements (clients & fournisseurs) ──────────────────────


class PaymentOut(BaseSchema):
    id: str
    number: str
    direction: Literal["customer", "supplier"]
    invoice_id: str
    invoice_number: str = ""
    party_id: str
    party_name: str = ""
    amount: float
    method: PaymentMethod = "bank_transfer"
    reference: str = ""
    paid_at: datetime | str | None = None
    notes: str = ""
    currency: str = "TND"
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None


class PaymentCreate(BaseSchema):
    invoice_id: str
    amount: float
    method: PaymentMethod = "bank_transfer"
    reference: str = ""
    paid_at: datetime | str | None = None
    notes: str = ""


# ── Devis fournisseurs ───────────────────────────────────────


class SupplierQuotationOut(BaseSchema):
    id: str
    number: str
    status: SupplierQuotationStatus = "draft"
    supplier_id: str
    supplier_name: str = ""
    lines: list[DocLineOut] = []
    totals: TotalsOut = TotalsOut()
    delivery_cost: float = 0
    lead_time_days: int = 0
    valid_until: datetime | str | None = None
    currency: str = "TND"
    notes: str = ""
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None
    history: list[dict[str, Any]] = []


class SupplierQuotationCreate(BaseSchema):
    supplier_id: str
    lines: list[DocLineInput]
    delivery_cost: float = 0
    lead_time_days: int = 0
    valid_until: datetime | str | None = None
    notes: str = ""


class SupplierQuotationUpdate(BaseSchema):
    lines: list[DocLineInput] | None = None
    delivery_cost: float | None = None
    lead_time_days: int | None = None
    valid_until: datetime | str | None = None
    notes: str | None = None


# ── Réceptions (bon de réception) ────────────────────────────


class GoodsReceiptLineCreate(BaseSchema):
    line_id: str
    quantity: int
    quantity_damaged: int = 0
    quantity_missing: int = 0
    notes: str = ""


class GoodsReceiptLineOut(BaseSchema):
    line_id: str
    product_id: str
    sku: str = ""
    name: str = ""
    unit: str = ""
    quantity: int = 0
    quantity_damaged: int = 0
    quantity_missing: int = 0
    notes: str = ""


class GoodsReceiptCreate(BaseSchema):
    po_id: str
    warehouse_id: str
    location_id: str | None = None
    lines: list[GoodsReceiptLineCreate]
    notes: str = ""


class GoodsReceiptOut(BaseSchema):
    id: str
    number: str
    status: GoodsReceiptStatus = "draft"
    po_id: str
    po_reference: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    lines: list[GoodsReceiptLineOut] = []
    warehouse_id: str = ""
    warehouse_name: str = ""
    location_id: str | None = None
    movement_ids: list[str] = []
    notes: str = ""
    user_id: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    validated_at: datetime | None = None
    history: list[dict[str, Any]] = []


# ── Factures fournisseurs ────────────────────────────────────


class SupplierInvoiceLineInput(BaseSchema):
    product_id: str
    quantity: int
    unit_price: float | None = None
    discount_pct: float = 0
    tax_rate: float | None = None


class SupplierInvoiceCreate(BaseSchema):
    purchase_order_id: str | None = None
    supplier_id: str | None = None
    lines: list[SupplierInvoiceLineInput] = []
    notes: str = ""


class SupplierInvoiceOut(BaseSchema):
    id: str
    number: str
    status: SupplierInvoiceStatus = "draft"
    supplier_id: str
    supplier_name: str = ""
    purchase_order_id: str | None = None
    purchase_order_number: str | None = None
    goods_receipt_ids: list[str] = []
    goods_receipt_numbers: list[str] = []
    lines: list[DocLineOut] = []
    totals: TotalsOut = TotalsOut()
    currency: str = "TND"
    amount_paid: float = 0
    balance_due: float = 0
    due_date: datetime | str | None = None
    overdue: bool = False
    discrepancies: list[dict[str, Any]] = []
    notes: str = ""
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime | None = None
    validated_at: datetime | None = None
    history: list[dict[str, Any]] = []


# ── Paramètres société / média / audit ───────────────────────


class CompanySettings(BaseSchema):
    company_name: str = ""
    legal_form: str = ""
    address: str = ""
    city: str = ""
    country: str = "Tunisie"
    phone: str = ""
    email: str = ""
    website: str = ""
    tax_id: str = ""
    customs_code: str = ""
    currency: str = "TND"
    default_tax_rate: float = 19.0
    payment_terms_days: int = 30
    bank_name: str = ""
    bank_rib: str = ""
    bank_iban: str = ""
    footer_legal: str = ""
    logo_media_id: str | None = None
    numbering: dict[str, dict[str, Any]] = {}
    updated_at: datetime | None = None
    updated_by: str | None = None


class CompanySettingsUpdate(BaseSchema):
    company_name: str | None = None
    legal_form: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    tax_id: str | None = None
    customs_code: str | None = None
    currency: str | None = None
    default_tax_rate: float | None = None
    payment_terms_days: int | None = None
    bank_name: str | None = None
    bank_rib: str | None = None
    bank_iban: str | None = None
    footer_legal: str | None = None
    logo_media_id: str | None = None
    numbering: dict[str, dict[str, Any]] | None = None


class MediaOut(BaseSchema):
    id: str
    filename: str
    content_type: str = ""
    size: int = 0
    url: str = ""
    uploaded_by: str = ""
    uploaded_by_name: str = ""
    created_at: datetime | None = None


class ProductImageOut(BaseSchema):
    media_id: str
    url: str
    filename: str = ""
    is_primary: bool = False


class ProductImageAttach(BaseSchema):
    media_id: str
    is_primary: bool = False


class UnitConversionOut(BaseSchema):
    from_unit: str
    to_unit: str
    factor: float


class AuditLogOut(BaseSchema):
    id: str
    action: str
    entity_type: str
    entity_id: str
    user_id: str = ""
    username: str = ""
    details: dict[str, Any] = {}
    created_at: datetime | None = None
