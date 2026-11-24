"""Schémas du domaine (tous en camelCase côté API)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from .base import BaseSchema

# ── Rôles (identiques au frontend) ───────────────────────────
UserRole = Literal[
    "super_admin",
    "owner_ceo",
    "stock_manager",
    "warehouse_employee",
    "purchasing_manager",
    "sales_manager",
    "commercial_user",
    "accounting_admin",
]

# ── Utilisateurs ─────────────────────────────────────────────


class UserOut(BaseSchema):
    id: str
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    role: UserRole
    company: str
    avatar: str | None = None
    created_at: datetime | None = None
    last_login: datetime | None = None
    is_active: bool = True


class UserCreate(BaseSchema):
    first_name: str
    last_name: str
    email: str
    password: str
    role: UserRole = "commercial_user"
    company: str = ""
    phone: str | None = None


class UserUpdate(BaseSchema):
    role: UserRole | None = None
    company: str | None = None
    phone: str | None = None
    is_active: bool | None = None


# ── Authentification ─────────────────────────────────────────


class LoginRequest(BaseSchema):
    email: str
    password: str


class RegisterRequest(BaseSchema):
    first_name: str
    last_name: str
    email: str
    company: str
    password: str
    phone: str | None = None


class RefreshRequest(BaseSchema):
    refresh_token: str


class LogoutRequest(BaseSchema):
    refresh_token: str | None = None


class AuthResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


# ── Produits / catalogue ─────────────────────────────────────
ProductStatus = Literal["in_stock", "low_stock", "out_of_stock", "discontinued"]
AIRiskLevel = Literal["critical", "high", "medium", "low", "none"]


class ProductOut(BaseSchema):
    id: str
    sku: str
    name: str
    name_ar: str | None = None
    category: str
    subcategory: str | None = None
    product_type: str | None = None
    brand: str
    image: str | None = None
    images: list[dict[str, Any]] = []
    barcode: str | None = None
    description: str | None = None
    description_short: str | None = None
    unit: str
    unit_conversions: list[dict[str, Any]] = []
    cost_price: float
    selling_price: float
    wholesale_price: float | None = None
    tax_rate: float | None = None
    discount_eligible: bool = True
    stock: int
    min_stock: int
    max_stock: int
    reorder_point: int
    status: ProductStatus
    is_active: bool = True
    ai_risk: AIRiskLevel = "none"
    ai_risk_score: int = 0
    warehouse_id: str
    supplier_id: str
    lead_time_days: int = 0
    tags: list[str] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProductCreate(BaseSchema):
    sku: str
    name: str
    category: str
    brand: str
    unit: str
    cost_price: float
    selling_price: float
    min_stock: int
    max_stock: int
    reorder_point: int
    warehouse_id: str
    supplier_id: str
    lead_time_days: int = 0
    name_ar: str | None = None
    image: str | None = None
    images: list[dict[str, Any]] = []
    barcode: str | None = None
    description: str | None = None
    description_short: str | None = None
    subcategory: str | None = None
    product_type: str | None = None
    wholesale_price: float | None = None
    tax_rate: float | None = None
    discount_eligible: bool = True
    unit_conversions: list[dict[str, Any]] = []
    initial_stock: dict[str, Any] | None = None
    is_active: bool = True
    tags: list[str] = []


class ProductUpdate(BaseSchema):
    name: str | None = None
    name_ar: str | None = None
    category: str | None = None
    subcategory: str | None = None
    product_type: str | None = None
    brand: str | None = None
    unit: str | None = None
    unit_conversions: list[dict[str, Any]] | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    wholesale_price: float | None = None
    tax_rate: float | None = None
    discount_eligible: bool | None = None
    min_stock: int | None = None
    max_stock: int | None = None
    reorder_point: int | None = None
    warehouse_id: str | None = None
    supplier_id: str | None = None
    lead_time_days: int | None = None
    status: ProductStatus | None = None
    is_active: bool | None = None
    image: str | None = None
    barcode: str | None = None
    description: str | None = None
    description_short: str | None = None
    tags: list[str] | None = None


class CategoryOut(BaseSchema):
    id: str
    name: str
    product_count: int = 0


class BrandOut(BaseSchema):
    id: str
    name: str
    product_count: int = 0


# ── Fournisseurs ─────────────────────────────────────────────


class SupplierOut(BaseSchema):
    id: str
    name: str
    code: str
    country: str
    city: str
    contact: str
    email: str
    phone: str
    performance_score: int = 0
    reliability_score: int = 0
    avg_lead_time_days: int = 0
    total_orders: int = 0
    on_time_delivery_rate: int = 0
    categories: list[str] = []
    is_active: bool = True
    created_at: datetime | None = None


class SupplierCreate(BaseSchema):
    name: str
    code: str
    country: str = ""
    city: str = ""
    contact: str = ""
    email: str = ""
    phone: str = ""
    categories: list[str] = []


class SupplierUpdate(BaseSchema):
    name: str | None = None
    country: str | None = None
    city: str | None = None
    contact: str | None = None
    email: str | None = None
    phone: str | None = None
    categories: list[str] | None = None
    is_active: bool | None = None


# ── Entrepôts / zones / emplacements ─────────────────────────
ZoneType = Literal["storage", "receiving", "dispatch", "quarantine"]


class LocationOut(BaseSchema):
    id: str
    zone_id: str
    code: str
    row: str = ""
    column: str = ""
    level: str = ""
    product_id: str | None = None
    quantity: int = 0
    max_quantity: int = 0


class ZoneOut(BaseSchema):
    id: str
    warehouse_id: str
    name: str
    code: str
    type: ZoneType = "storage"
    capacity: int = 0
    used_capacity: int = 0
    locations: list[LocationOut] = []


class WarehouseOut(BaseSchema):
    id: str
    name: str
    code: str
    address: str
    city: str
    capacity: int
    used_capacity: int = 0
    zones: list[ZoneOut] = []
    manager: str = ""
    is_active: bool = True


class WarehouseCreate(BaseSchema):
    name: str
    code: str
    address: str = ""
    city: str = ""
    capacity: int = 0
    manager: str = ""


class ZoneCreate(BaseSchema):
    name: str
    code: str
    type: ZoneType = "storage"
    capacity: int = 0


class LocationCreate(BaseSchema):
    code: str
    row: str = ""
    column: str = ""
    level: str = ""
    max_quantity: int = 0


# ── Stock / mouvements ───────────────────────────────────────
MovementType = Literal["in", "out", "transfer", "adjustment", "inventory"]


class StockItemOut(BaseSchema):
    id: str
    product_id: str
    warehouse_id: str
    location_id: str | None = None
    quantity: int
    version: int
    min_stock: int = 0
    max_stock: int = 0
    reorder_point: int = 0
    updated_at: datetime | None = None


class MovementOut(BaseSchema):
    id: str
    product_id: str
    warehouse_id: str
    to_warehouse_id: str | None = None
    location_id: str | None = None
    type: MovementType
    quantity: int
    delta: int = 0
    previous_stock: int
    new_stock: int
    reason: str
    reference: str | None = None
    user_id: str
    username: str = ""
    status: Literal["pending", "applied", "aborted"] = "applied"
    created_at: datetime | None = None
    sync_status: Literal["synced", "pending", "failed"] = "synced"


class MovementCreate(BaseSchema):
    product_id: str
    warehouse_id: str
    type: Literal["in", "out", "adjustment"]
    quantity: int
    reason: str = ""
    location_id: str | None = None
    to_warehouse_id: str | None = None


class InventoryAdjustCount(BaseSchema):
    """Ajustement de type inventaire : mise à niveau vers la quantité comptée."""

    product_id: str
    warehouse_id: str
    counted_quantity: int
    reason: str = "Inventaire"
    location_id: str | None = None


class TransferOut(BaseSchema):
    id: str
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: int
    reason: str = ""
    status: Literal["completed", "failed"] = "completed"
    user_id: str
    movement_out_id: str
    movement_in_id: str | None = None
    created_at: datetime | None = None


class TransferCreate(BaseSchema):
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: int
    reason: str = ""


class CountLineOut(BaseSchema):
    product_id: str
    product_name: str = ""
    product_sku: str = ""
    expected_qty: int
    counted_qty: int | None = None
    variance: int | None = None


class CountOut(BaseSchema):
    id: str
    reference: str
    warehouse_id: str
    status: Literal["open", "completed", "cancelled"] = "open"
    lines: list[CountLineOut] = []
    created_by: str
    created_at: datetime | None = None
    completed_at: datetime | None = None


class CountCreate(BaseSchema):
    warehouse_id: str
    product_ids: list[str] = []


class CountLineUpsert(BaseSchema):
    product_id: str
    counted_qty: int


# ── Achats ───────────────────────────────────────────────────
OrderStatus = Literal[
    "draft", "pending", "approved", "ordered", "partial", "received", "cancelled"
]


class PurchaseLineOut(BaseSchema):
    id: str
    order_id: str | None = None
    product_id: str
    product_name: str
    product_sku: str
    unit: str = ""
    quantity: int
    received_quantity: int = 0
    invoiced_quantity: int = 0
    unit_price: float
    discount_pct: float = 0
    tax_rate: float = 0
    gross_amount: float = 0
    discount_amount: float = 0
    net_amount: float = 0
    tax_amount: float = 0
    total_price: float
    total_ttc: float = 0


class PurchaseOrderOut(BaseSchema):
    id: str
    reference: str
    supplier_id: str
    supplier_name: str
    status: OrderStatus
    lines: list[PurchaseLineOut] = []
    totals: dict[str, Any] | None = None
    total_amount: float
    expected_delivery: datetime | str | None = None
    ai_recommended: bool = False
    supplier_quotation_id: str | None = None
    supplier_quotation_number: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    approved_by: str | None = None


class PurchaseLineCreate(BaseSchema):
    product_id: str
    quantity: int
    unit_price: float | None = None
    discount_pct: float = 0
    tax_rate: float | None = None


class PurchaseOrderCreate(BaseSchema):
    supplier_id: str
    lines: list[PurchaseLineCreate]
    expected_delivery: datetime | str | None = None
    notes: str | None = None
    ai_recommended: bool = False
    supplier_quotation_id: str | None = None


class PurchaseStatusUpdate(BaseSchema):
    to: Literal["pending", "approved", "ordered", "cancelled"]
    notes: str | None = None


class ReceiptLineCreate(BaseSchema):
    line_id: str
    quantity: int


class ReceiptCreate(BaseSchema):
    po_id: str
    warehouse_id: str | None = None
    location_id: str | None = None
    lines: list[ReceiptLineCreate]


class ReceiptOut(BaseSchema):
    id: str
    reference: str
    po_id: str
    po_reference: str = ""
    lines: list[ReceiptLineCreate]
    user_id: str
    created_at: datetime | None = None


# ── Alertes ──────────────────────────────────────────────────
AlertSeverity = Literal["critical", "warning", "info"]
AlertType = Literal[
    "stock", "ai", "inventory", "purchasing", "warehouse", "system", "anomaly"
]


class AlertOut(BaseSchema):
    id: str
    type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    product_id: str | None = None
    warehouse_id: str | None = None
    is_read: bool = False
    is_resolved: bool = False
    created_at: datetime | None = None
    action_url: str | None = None


# ── Analytique ───────────────────────────────────────────────


class DashboardKPIsOut(BaseSchema):
    stock_value: float
    stock_value_trend: float
    revenue: float
    revenue_trend: float
    margin: float
    margin_trend: float
    rotation: float
    rotation_trend: float
    critical_products: int
    forecasted_risks: int
    pending_orders: int
    active_alerts: int


class StockHealthOut(BaseSchema):
    overall: int
    availability: int
    rotation: int
    overstock: int
    demand: int
    risk: int
    supplier_performance: int
    trend: Literal["up", "down", "stable"]
    previous_score: int


class RevenuePointOut(BaseSchema):
    month: str
    revenue: float
    cost: float


class CategoryStockPointOut(BaseSchema):
    name: str
    value: float
    color: str | None = None
