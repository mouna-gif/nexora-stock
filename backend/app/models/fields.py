"""Conventions de documents MongoDB (noms de collections, IDs, horodatage).

Les identifiants sont des chaînes lisibles (ex. `prd-001`, `mov-9f2c…`)
compatibles avec le frontend ; `_id` = identifiant métier.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

# ── Noms des collections ─────────────────────────────────────
COL_USERS = "users"
COL_REFRESH_TOKENS = "refresh_tokens"
COL_PRODUCTS = "products"
COL_CATEGORIES = "categories"
COL_BRANDS = "brands"
COL_SUPPLIERS = "suppliers"
COL_WAREHOUSES = "warehouses"
COL_STOCK_ITEMS = "stock_items"
COL_MOVEMENTS = "movements"  # journal immuable des mouvements
COL_TRANSFERS = "transfers"
COL_COUNTS = "counts"
COL_PURCHASE_ORDERS = "purchase_orders"
COL_RECEIPTS = "receipts"
COL_ALERTS = "alerts"
COL_ANOMALIES = "anomalies"
COL_FORECASTS = "forecasts"
COL_RECOMMENDATIONS = "recommendations"
COL_AI_JOBS = "ai_jobs"
COL_EVENTS = "events"
COL_ANALYTICS_SNAPSHOTS = "analytics_snapshots"
# ── Gestion commerciale ──────────────────────────────────────
COL_CUSTOMERS = "customers"
COL_SALES_QUOTATIONS = "sales_quotations"
COL_SALES_ORDERS = "sales_orders"
COL_DELIVERY_NOTES = "delivery_notes"
COL_CUSTOMER_INVOICES = "customer_invoices"
COL_CUSTOMER_PAYMENTS = "customer_payments"
COL_SUPPLIER_QUOTATIONS = "supplier_quotations"
COL_GOODS_RECEIPTS = "goods_receipts"
COL_SUPPLIER_INVOICES = "supplier_invoices"
COL_SUPPLIER_PAYMENTS = "supplier_payments"
COL_MEDIA = "media"
COL_COMPANY_SETTINGS = "company_settings"
COL_AUDIT_LOGS = "audit_logs"
COL_SEQUENCES = "document_sequences"


def now() -> datetime:
    """Horodatage UTC naive (stocké en BSON datetime)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def new_id(prefix: str) -> str:
    """Identifiant métier lisible, ex. `prd-3f9a2c41b7`."""
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def initials(first_name: str, last_name: str) -> str:
    return f"{(first_name or ' ')[:1]}{(last_name or ' ')[:1]}".upper()


def public_user_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """Projection utilisateur « publique » (jamais de hash de mot de passe)."""
    return {
        "id": doc["_id"],
        "first_name": doc.get("first_name", ""),
        "last_name": doc.get("last_name", ""),
        "email": doc.get("email", ""),
        "phone": doc.get("phone"),
        "role": doc.get("role", "commercial_user"),
        "company": doc.get("company", ""),
        "avatar": doc.get("avatar") or initials(doc.get("first_name", ""), doc.get("last_name", "")),
        "created_at": doc.get("created_at"),
        "last_login": doc.get("last_login"),
        "is_active": doc.get("is_active", True),
    }
