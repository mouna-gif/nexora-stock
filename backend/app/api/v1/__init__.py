"""Agrégation des routeurs API v1.

Ordre d'implémentation suivi (cf. README) :
auth → users/rôles → produits/catégories/marques/fournisseurs →
entrepôts/emplacements/stock/mouvements → transferts/inventaires →
achats/réceptions → alertes/analytique/IA → WebSocket.
"""

from fastapi import APIRouter

from app.api.v1 import (
    ai,
    alerts,
    analytics,
    auth,
    brands,
    categories,
    counts,
    customers,
    health,
    inventory,
    locations,
    media,
    movements,
    products,
    purchase_orders,
    purchasing,
    receipts,
    sales,
    settings,
    suppliers,
    transfers,
    users,
    warehouses,
    ws,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(products.router)
api_router.include_router(categories.router)
api_router.include_router(brands.router)
api_router.include_router(suppliers.router)
api_router.include_router(customers.router)
api_router.include_router(media.router)
api_router.include_router(settings.router)
api_router.include_router(warehouses.router)
api_router.include_router(locations.router)
api_router.include_router(inventory.router)
api_router.include_router(movements.router)
api_router.include_router(transfers.router)
api_router.include_router(counts.router)
api_router.include_router(purchase_orders.router)
api_router.include_router(purchasing.router)
api_router.include_router(receipts.router)
api_router.include_router(sales.router)
api_router.include_router(alerts.router)
api_router.include_router(analytics.router)
api_router.include_router(ai.router)
api_router.include_router(ws.router)
