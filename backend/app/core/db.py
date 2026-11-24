"""Accès MongoDB (PyMongo — API asynchrone native).

Règles de sécurité absolues :
  • AUCUN drop_database, drop_collection, delete_many sans filtre, ni
    migration destructive implicite dans tout le backend.
  • Le démarrage ne crée que des index (opération idempotente et non
    destructive) et ne touche QUE la base configurée (MONGODB_DATABASE).
  • Un MongoDB standalone n'offre pas de transactions multi-documents :
    la cohérence des opérations critiques de stock repose sur des mises à
    jour atomiques ($inc + conditions de version) et un journal immuable
    des mouvements — jamais sur des transactions.
"""

from __future__ import annotations

import logging
from typing import Any

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncMongoClient[dict[str, Any]] | None = None


def get_client() -> AsyncMongoClient[dict[str, Any]]:
    """Client MongoDB asynchrone partagé (singleton)."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncMongoClient[dict[str, Any]](
            settings.mongodb_uri,
            serverSelectionTimeoutMS=5000,
            appname="sss-smart-stock-ai",
        )
    return _client


def get_database() -> AsyncDatabase[dict[str, Any]]:
    """Base applicative dédiée (jamais admin/local/config)."""
    settings = get_settings()
    return get_client()[settings.mongodb_database]


async def ping() -> bool:
    """Vérifie la connexion (utilisé par /api/v1/health)."""
    try:
        await get_client().admin.command("ping")
        return True
    except Exception:  # noqa: BLE001 — santé volontairement tolérante
        return False


async def ensure_indexes(db: AsyncDatabase[dict[str, Any]]) -> None:
    """Crée les index nécessaires — idempotent, non destructif.

    `create_index` ne modifie jamais de données : il est donc sûr de
    l'exécuter à chaque démarrage.
    """
    await db.users.create_index("email", unique=True)
    await db.refresh_tokens.create_index("jti", unique=True)
    await db.refresh_tokens.create_index("user_id")
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)

    await db.products.create_index("sku", unique=True)
    await db.products.create_index("category")
    await db.products.create_index("brand")
    await db.products.create_index("status")

    await db.stock_items.create_index(
        [("product_id", 1), ("warehouse_id", 1), ("location_id", 1)],
        unique=True,
    )
    await db.movements.create_index([("product_id", 1), ("created_at", -1)])
    await db.movements.create_index([("warehouse_id", 1), ("created_at", -1)])
    await db.movements.create_index("type")
    await db.movements.create_index("created_at")

    await db.transfers.create_index("created_at")
    await db.transfers.create_index("product_id")
    await db.counts.create_index([("warehouse_id", 1), ("created_at", -1)])
    await db.counts.create_index("status")

    await db.purchase_orders.create_index("reference", unique=True)
    await db.purchase_orders.create_index("status")
    await db.purchase_orders.create_index("supplier_id")
    await db.receipts.create_index("po_id")
    await db.receipts.create_index("created_at")

    await db.alerts.create_index([("is_resolved", 1), ("created_at", -1)])
    await db.alerts.create_index("product_id")
    await db.alerts.create_index("type")

    await db.anomalies.create_index([("is_resolved", 1), ("detected_at", -1)])
    await db.forecasts.create_index([("product_id", 1), ("created_at", -1)])
    await db.recommendations.create_index([("product_id", 1), ("status", 1)])
    await db.ai_jobs.create_index([("status", 1), ("created_at", 1)])

    await db.categories.create_index("name", unique=True)
    await db.brands.create_index("name", unique=True)
    await db.suppliers.create_index("code", unique=True)
    await db.warehouses.create_index("code", unique=True)
    await db.warehouses.create_index("zones.id", unique=True, sparse=True)
    await db.warehouses.create_index("zones.locations.id", unique=True, sparse=True)
    await db.analytics_snapshots.create_index("created_at")
    await db.events.create_index("created_at")

    # ── Gestion commerciale ──────────────────────────────────
    await db.products.create_index("barcode", unique=True, sparse=True)
    await db.customers.create_index("code", unique=True)
    await db.customers.create_index("name")
    await db.sales_quotations.create_index("number", unique=True)
    await db.sales_quotations.create_index([("customer_id", 1), ("created_at", -1)])
    await db.sales_orders.create_index("number", unique=True)
    await db.sales_orders.create_index("customer_id")
    await db.delivery_notes.create_index("number", unique=True)
    await db.delivery_notes.create_index("sales_order_id")
    await db.customer_invoices.create_index("number", unique=True)
    await db.customer_invoices.create_index("sales_order_id")
    await db.customer_payments.create_index("number", unique=True)
    await db.customer_payments.create_index("invoice_id")
    await db.supplier_quotations.create_index("number", unique=True)
    await db.supplier_quotations.create_index("supplier_id")
    await db.goods_receipts.create_index("number", unique=True)
    await db.goods_receipts.create_index("po_id")
    await db.supplier_invoices.create_index("number", unique=True)
    await db.supplier_invoices.create_index("purchase_order_id")
    await db.supplier_payments.create_index("number", unique=True)
    await db.supplier_payments.create_index("invoice_id")
    await db.media.create_index("uploaded_by")
    await db.audit_logs.create_index([("entity_type", 1), ("entity_id", 1)])
    await db.audit_logs.create_index("created_at")
    await db.document_sequences.create_index("updated_at")

    logger.info("Index MongoDB vérifiés/créés sur la base %r.", db.name)


async def shutdown() -> None:
    global _client
    if _client is not None:
        _client = None
