"""Analytique : KPIs, santé du stock, tendances — calculs dérivés non stockés
(or snapshot hebdo du worker). Aucune donnée n'est détruite."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.models.fields import (
    COL_ALERTS,
    COL_ANALYTICS_SNAPSHOTS,
    COL_MOVEMENTS,
    COL_PRODUCTS,
    COL_PURCHASE_ORDERS,
    COL_SUPPLIERS,
    now,
)

COLORS = {"Carrelage": "#c4714a", "Sanitaire": "#0f1a2e", "Meubles": "#c9a96e",
          "Portes": "#2dd4bf", "Revêtements": "#243c64"}


async def compute_kpis(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    products = await db[COL_PRODUCTS].find({}).to_list(length=2000)
    stock_value = sum(p.get("stock", 0) * p.get("cost_price", 0) for p in products)
    critical_products = sum(
        1 for p in products if p.get("status") == "out_of_stock" or p.get("ai_risk") == "critical"
    )

    since = now() - timedelta(days=30)
    pipeline = [
        {"$match": {"type": "out", "status": "applied", "created_at": {"$gte": since}}},
        {"$group": {"_id": "$product_id", "qty": {"$sum": "$quantity"}}},
    ]
    outs = {r["_id"]: r["qty"] for r in await db[COL_MOVEMENTS].aggregate(pipeline).to_list(2000)}
    revenue = sum(
        outs.get(p["_id"], 0) * p.get("selling_price", 0) for p in products
    )
    cost_out = sum(
        outs.get(p["_id"], 0) * p.get("cost_price", 0) for p in products
    )
    margin = round((revenue - cost_out) / revenue * 100, 1) if revenue else 0.0

    since90 = now() - timedelta(days=90)
    pipeline90 = [
        {"$match": {"type": "out", "status": "applied", "created_at": {"$gte": since90}}},
        {"$group": {"_id": None, "qty": {"$sum": "$quantity"}}},
    ]
    rows = await db[COL_MOVEMENTS].aggregate(pipeline90).to_list(1)
    rotation = (
        round(rows[0]["qty"] / stock_value * (365 / 90), 2) if rows and stock_value else 0.0
    )

    pending_orders = await db[COL_PURCHASE_ORDERS].count_documents(
        {"status": {"$in": ["pending", "approved", "ordered", "partial"]}}
    )
    active_alerts = await db[COL_ALERTS].count_documents({"is_resolved": False})

    # Tendances : comparaison au snapshot le plus récent (si le worker a tourné).
    trend = {"stock_value_trend": 0.0, "revenue_trend": 0.0, "margin_trend": 0.0, "rotation_trend": 0.0}
    snapshot = await db[COL_ANALYTICS_SNAPSHOTS].find_one(
        {"type": "kpis"}, sort=[("created_at", -1)]
    )
    if snapshot and isinstance(snapshot.get("kpis"), dict):
        prev = snapshot["kpis"]
        trend["stock_value_trend"] = _pct(stock_value, prev.get("stock_value"))
        trend["revenue_trend"] = _pct(revenue, prev.get("revenue"))
        trend["margin_trend"] = _pct(margin, prev.get("margin"))
        trend["rotation_trend"] = _pct(rotation, prev.get("rotation"))

    return {
        "stock_value": round(stock_value, 2),
        "stock_value_trend": trend["stock_value_trend"],
        "revenue": round(revenue, 2),
        "revenue_trend": trend["revenue_trend"],
        "margin": margin,
        "margin_trend": trend["margin_trend"],
        "rotation": rotation,
        "rotation_trend": trend["rotation_trend"],
        "critical_products": critical_products,
        "forecasted_risks": critical_products,
        "pending_orders": pending_orders,
        "active_alerts": active_alerts,
    }


async def stock_health(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    products = await db[COL_PRODUCTS].find({}).to_list(length=2000)
    if not products:
        return {
            "overall": 0, "availability": 0, "rotation": 0, "overstock": 0,
            "demand": 0, "risk": 0, "supplier_performance": 0, "trend": "stable",
            "previous_score": 0,
        }
    n = len(products)
    availability = round(
        100 * sum(1 for p in products if p.get("stock", 0) > p.get("min_stock", 0)) / n
    )
    overstock_count = sum(
        1 for p in products if p.get("max_stock", 0) and p.get("stock", 0) > p.get("max_stock", 0)
    )
    overstock = max(0, 100 - round(100 * overstock_count / n))
    risk_count = sum(1 for p in products if p.get("ai_risk") in ("critical", "high"))
    risk = max(0, 100 - round(100 * risk_count / n * 1.5))

    pipeline = [
        {"$match": {"type": "out", "status": "applied", "created_at": {"$gte": now() - timedelta(days=30)}}},
        {"$group": {"_id": None, "qty": {"$sum": "$quantity"}}},
    ]
    rows = await db[COL_MOVEMENTS].aggregate(pipeline).to_list(1)
    rotation = min(100, round((rows[0]["qty"] / max(1, sum(p.get("stock", 0) for p in products))) * 100)) if rows else 0

    demand = min(100, availability)
    suppliers = await db[COL_SUPPLIERS].find({"is_active": True}).to_list(length=500)
    supplier_performance = (
        round(sum(s.get("performance_score", 0) for s in suppliers) / len(suppliers))
        if suppliers
        else 50
    )

    overall = round(
        0.3 * availability + 0.2 * rotation + 0.15 * overstock
        + 0.15 * demand + 0.2 * risk
    )

    trend = "stable"
    previous = 0
    snapshot = await db[COL_ANALYTICS_SNAPSHOTS].find_one(
        {"type": "stock_health"}, sort=[("created_at", -1)]
    )
    if snapshot:
        previous = int(snapshot.get("overall", 0))
        if overall > previous + 2:
            trend = "up"
        elif overall < previous - 2:
            trend = "down"

    return {
        "overall": overall,
        "availability": availability,
        "rotation": rotation,
        "overstock": overstock,
        "demand": demand,
        "risk": risk,
        "supplier_performance": supplier_performance,
        "trend": trend,
        "previous_score": previous,
    }


async def revenue_trend(db: AsyncDatabase[dict[str, Any]]) -> list[dict[str, Any]]:
    """CA mensuel = Σ (qty sortie × prix de vente) sur 6 mois ($lookup produits)."""
    since = now() - timedelta(days=183)
    pipeline = [
        {"$match": {"type": "out", "status": "applied", "created_at": {"$gte": since}}},
        {
            "$lookup": {
                "from": COL_PRODUCTS,
                "localField": "product_id",
                "foreignField": "_id",
                "as": "product",
            }
        },
        {"$unwind": {"path": "$product", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": {"y": {"$year": "$created_at"}, "m": {"$month": "$created_at"}},
                "revenue": {
                    "$sum": {
                        "$multiply": ["$quantity", {"$ifNull": ["$product.selling_price", 0]}]
                    }
                },
                "cost": {
                    "$sum": {"$multiply": ["$quantity", {"$ifNull": ["$product.cost_price", 0]}]}
                },
            }
        },
        {"$sort": {"_id.y": 1, "_id.m": 1}},
    ]
    rows = await db[COL_MOVEMENTS].aggregate(pipeline).to_list(50)
    months_fr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    return [
        {
            "month": months_fr[r["_id"]["m"] - 1],
            "revenue": round(r.get("revenue", 0)),
            "cost": round(r.get("cost", 0)),
        }
        for r in rows
    ]


async def category_stock(db: AsyncDatabase[dict[str, Any]]) -> list[dict[str, Any]]:
    pipeline = [
        {"$group": {"_id": "$category", "value": {"$sum": "$stock"}}},
        {"$sort": {"value": -1}},
    ]
    rows = await db[COL_PRODUCTS].aggregate(pipeline).to_list(length=50)
    total = sum(r["value"] for r in rows) or 1
    return [
        {
            "name": r["_id"] or "Divers",
            "value": round(100 * r["value"] / total, 1),
            "color": COLORS.get(r["_id"] or "", "#8aadd8"),
        }
        for r in rows
    ]


def _pct(current: float, previous: Any) -> float:
    try:
        previous = float(previous)
    except (TypeError, ValueError):
        return 0.0
    if previous == 0:
        return 0.0
    return round((current - previous) / abs(previous) * 100, 1)
