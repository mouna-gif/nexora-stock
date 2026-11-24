"""Modules IA : prévisions, anomalies, stock mort, approvisionnement
intelligent, copilote, simulation what-if + file de jobs pour les calculs
longs (exécutés par le worker séparé).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import (
    COL_AI_JOBS,
    COL_ANOMALIES,
    COL_FORECASTS,
    COL_MOVEMENTS,
    COL_PRODUCTS,
    COL_RECOMMENDATIONS,
    COL_SUPPLIERS,
    new_id,
    now,
)

# ── Helpers de calcul ────────────────────────────────────────


async def _daily_out_history(
    db: AsyncDatabase[dict[str, Any]], product_id: str, days: int = 90
) -> dict[str, float]:
    since = now() - timedelta(days=days)
    pipeline = [
        {
            "$match": {
                "product_id": product_id,
                "type": "out",
                "status": "applied",
                "created_at": {"$gte": since},
            }
        },
        {"$addFields": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}}},
        {"$group": {"_id": "$day", "qty": {"$sum": "$quantity"}}},
    ]
    rows = await db[COL_MOVEMENTS].aggregate(pipeline).to_list(200)
    return {r["_id"]: float(r["qty"]) for r in rows}


def _demand_stats(history: dict[str, float], days: int = 90) -> tuple[float, float, float]:
    """Retourne (moyenne journalière, écart-type, tendance hebdo %)."""
    values = [0.0] * days
    today = now().date()
    for iso, qty in history.items():
        d = datetime.fromisoformat(iso).date()
        offset = (today - d).days
        if 0 <= offset < days:
            values[days - 1 - offset] = qty
    mean = sum(values) / days
    variance = sum((v - mean) ** 2 for v in values) / days
    std = math.sqrt(variance)
    first_half = sum(values[: days // 2]) / (days // 2)
    second_half = sum(values[days // 2 :]) / (days - days // 2)
    trend = 0.0 if first_half == 0 else round((second_half - first_half) / first_half * 100, 1)
    return mean, std, trend


async def forecast(
    db: AsyncDatabase[dict[str, Any]], product_id: str, horizon_days: int = 90
) -> dict[str, Any]:
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)

    history = await _daily_out_history(db, product_id)
    mean, std, trend = _demand_stats(history)
    confidence = max(0.4, min(0.95, 1 - (std / (mean + 1)) * 0.3))

    # Historique mensuel (4 derniers mois) + prévision mensuelle.
    data_points: list[dict[str, Any]] = []
    today = now().date()
    for i in range(4, 0, -1):
        month_start = (today.replace(day=1) - timedelta(days=30 * i))
        key = month_start.strftime("%Y-%m")
        qty = sum(v for iso, v in history.items() if iso.startswith(key))
        data_points.append({"date": f"{key}-01", "historical": round(qty, 1)})

    monthly_mean = mean * 30
    for i in range(1, max(1, horizon_days // 30) + 1):
        month_start = today.replace(day=1) + timedelta(days=30 * i)
        base = monthly_mean * (1 + (trend / 100) ** i if abs(trend) < 50 else 1)
        base = max(0.0, base)
        spread = max(2.0, std * math.sqrt(30))
        data_points.append(
            {
                "date": month_start.strftime("%Y-%m-01"),
                "forecast": round(base, 1),
                "lower": round(max(0, base - spread), 1),
                "upper": round(base + spread, 1),
            }
        )

    lead = int(product.get("lead_time_days", 14))
    days_cover = (product.get("stock", 0) / mean) if mean > 0 else 999
    if days_cover < lead:
        recommendation = (
            f"Commander {max(0, round(monthly_mean * 1.5 - product.get('stock', 0)))} unités "
            f"sous {max(1, days_cover - lead // 2):.0f} jours pour éviter la rupture."
        )
    else:
        recommendation = "Approvisionnement équilibré — pas d'action urgente."

    factors = [
        f"Moyenne journalière : {mean:.1f} unités",
        f"Tendance : {trend:+.1f}% sur 90 jours",
        f"Volatilité (σ) : {std:.1f}",
    ]

    doc = {
        "_id": new_id("fcst"),
        "product_id": product_id,
        "product_name": product.get("name", ""),
        "horizon": horizon_days,
        "confidence": round(confidence, 2),
        "model": "Moyenne mobile + tendance (heuristique locale)",
        "data": data_points,
        "recommendation": recommendation,
        "factors": factors,
        "created_at": now(),
    }
    await db[COL_FORECASTS].insert_one(doc)
    return doc


async def detect_anomalies(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    """Détection d'anomalies (surstock, mouvements inhabituels, retards fournisseur)."""
    created = 0
    products = await db[COL_PRODUCTS].find({}).to_list(length=2000)
    for product in products:
        pid = product["_id"]
        name = product.get("name", "")
        wh = product.get("warehouse_id", "")
        stock = int(product.get("stock", 0))
        max_stock = int(product.get("max_stock", 0))

        # Surstock
        if max_stock and stock > max_stock * 1.5:
            over = stock - max_stock
            if not await _has_unresolved_anomaly(db, pid, "overstock"):
                await _insert_anomaly(
                    db,
                    type="overstock",
                    product=product,
                    warehouse_id=wh,
                    score=min(0.99, over / max(1, max_stock)),
                    description=f"Stock {round(100 * over / max(1, max_stock))}% supérieur au maximum optimal. Risque de stock mort.",
                    recommendation="Envisager une promotion ou un transfert vers un entrepôt à plus forte rotation.",
                )
                created += 1

        # Mouvement inhabituel (sortie > moyenne + 3σ sur 30 jours)
        history30 = await _daily_out_history(db, pid, days=30)
        if history30:
            mean, std, _ = _demand_stats(history30, days=30)
            threshold = mean + 3 * std
            last_day_qty = max(history30.values())
            if std > 0 and last_day_qty > threshold and last_day_qty > mean:
                if not await _has_unresolved_anomaly(db, pid, "unusual_movement"):
                    await _insert_anomaly(
                        db,
                        type="unusual_movement",
                        product=product,
                        warehouse_id=wh,
                        score=min(0.99, (last_day_qty - mean) / (mean + 3 * std + 1e-9)),
                        description=f"Sortie inhabituelle de {last_day_qty:.0f} unités (moyenne {mean:.1f}/jour).",
                        recommendation="Vérifier les bons de sortie et les autorisations associées.",
                    )
                    created += 1

        # Retard fournisseur : POs dépassés non reçus
        late_pos = await db["purchase_orders"].count_documents(
            {
                "supplier_id": product.get("supplier_id"),
                "status": {"$in": ["approved", "ordered"]},
                "expected_delivery": {"$lt": now().isoformat()},
            }
        )
        if late_pos and not await _has_unresolved_anomaly(db, pid, "supplier_delay"):
            await _insert_anomaly(
                db,
                type="supplier_delay",
                product=product,
                warehouse_id=wh,
                score=0.65,
                description=f"{late_pos} commande(s) en retard chez le fournisseur.",
                recommendation="Évaluer des fournisseurs alternatifs pour cette catégorie.",
            )
            created += 1

    return {"anomalies_created": created}


async def _has_unresolved_anomaly(
    db: AsyncDatabase[dict[str, Any]], product_id: str, anomaly_type: str
) -> bool:
    return bool(
        await db[COL_ANOMALIES].find_one({"product_id": product_id, "type": anomaly_type, "is_resolved": False})
    )


async def _insert_anomaly(
    db: AsyncDatabase[dict[str, Any]],
    *,
    type: str,
    product: dict[str, Any],
    warehouse_id: str,
    score: float,
    description: str,
    recommendation: str,
) -> dict[str, Any]:
    from app.services.alert_service import create_alert

    doc = {
        "_id": new_id("ano"),
        "type": type,
        "product_id": product["_id"],
        "product_name": product.get("name", ""),
        "warehouse_id": warehouse_id,
        "score": round(max(0.0, min(1.0, score)), 2),
        "severity": "critical" if score > 0.8 else "warning",
        "description": description,
        "detected_at": now(),
        "is_resolved": False,
        "recommendation": recommendation,
    }
    await db[COL_ANOMALIES].insert_one(doc)
    await create_alert(
        db,
        type="anomaly",
        severity=doc["severity"],
        title=f"Anomalie détectée — {product.get('name', '')}",
        message=description,
        product_id=product["_id"],
        warehouse_id=warehouse_id,
        action_url="/app/anomalies",
        dedup=True,
    )
    return doc


async def list_anomalies(
    db: AsyncDatabase[dict[str, Any]], *, unresolved_only: bool = False, limit: int = 100
) -> list[dict[str, Any]]:
    filters = {"is_resolved": False} if unresolved_only else {}
    cursor = db[COL_ANOMALIES].find(filters).sort("detected_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def dead_stock_scan(db: AsyncDatabase[dict[str, Any]]) -> list[dict[str, Any]]:
    """Produits avec stock > 0 et aucune sortie depuis 45 jours."""
    threshold = now() - timedelta(days=45)
    products = await db[COL_PRODUCTS].find({}).to_list(length=2000)
    result = []
    for product in products:
        last_out = await db[COL_MOVEMENTS].find_one(
            {"product_id": product["_id"], "type": "out", "status": "applied", "created_at": {"$gte": threshold}},
            sort=[("created_at", -1)],
        )
        if not last_out and product.get("stock", 0) > 0:
            result.append(
                {
                    "product_id": product["_id"],
                    "product_name": product.get("name", ""),
                    "sku": product.get("sku", ""),
                    "stock": product.get("stock", 0),
                    "stock_value": round(product.get("stock", 0) * product.get("cost_price", 0), 2),
                    "last_movement": None,
                }
            )
    return result


async def procurement_scan(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    """Recommandations d'approvisionnement (démarche déterministe et explicable)."""
    created = 0
    products = await db[COL_PRODUCTS].find({}).to_list(length=2000)
    for product in products:
        pid = product["_id"]
        stock = int(product.get("stock", 0))
        reorder = int(product.get("reorder_point", 0))
        lead = int(product.get("lead_time_days", 14))
        history = await _daily_out_history(db, pid, days=90)
        mean, _, trend = _demand_stats(history)
        forecast_demand = int(max(0.0, mean * (30 + lead) * (1 + trend / 100)))
        safety = max(int(product.get("min_stock", 0)), int(mean * lead * 0.3))

        projected = stock + 0 - forecast_demand
        if stock <= reorder or projected + safety < 0:
            recommended_qty = max(
                10, forecast_demand + safety - stock
            )
            supplier = await db[COL_SUPPLIERS].find_one({"_id": product.get("supplier_id")})
            estimated_cost = round(recommended_qty * product.get("cost_price", 0), 2)
            days_cover = stock / mean if mean > 0 else 999
            urgency = "critical" if days_cover < lead * 0.5 else ("high" if days_cover < lead else "medium")
            reasons = []
            if stock <= reorder:
                reasons.append(f"Stock ({stock}) au-dessous du point de réapprovisionnement ({reorder})")
            if trend > 10:
                reasons.append(f"Demande en hausse de {trend:+.1f}%")
            if lead >= 21:
                reasons.append(f"Délai fournisseur long ({lead} jours) — anticiper")
            reasons.append(f"Couverture : {days_cover:.0f} jours au rythme actuel")

            existing = await db[COL_RECOMMENDATIONS].find_one(
                {"product_id": pid, "status": "pending"}
            )
            if existing:
                continue
            await db[COL_RECOMMENDATIONS].insert_one(
                {
                    "_id": new_id("rec"),
                    "product_id": pid,
                    "product_name": product.get("name", ""),
                    "product_sku": product.get("sku", ""),
                    "current_stock": stock,
                    "forecast_demand": forecast_demand,
                    "recommended_quantity": recommended_qty,
                    "lead_time_days": lead,
                    "safety_stock": safety,
                    "confidence": round(min(0.95, 0.5 + len(reasons) * 0.1), 2),
                    "reasons": reasons,
                    "estimated_cost": estimated_cost,
                    "urgency": urgency,
                    "supplier_id": product.get("supplier_id", ""),
                    "supplier_name": (supplier or {}).get("name", ""),
                    "status": "pending",
                    "created_at": now(),
                }
            )
            created += 1
    return {"recommendations_created": created}


async def list_recommendations(
    db: AsyncDatabase[dict[str, Any]], *, status: str | None = None, limit: int = 100
) -> list[dict[str, Any]]:
    filters = {"status": status} if status else {}
    cursor = db[COL_RECOMMENDATIONS].find(filters).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def approve_recommendation(
    db: AsyncDatabase[dict[str, Any]], recommendation_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    """Approuve une recommandation → crée la commande d'achat."""
    from app.services.po_service import create_purchase_order

    rec = await db[COL_RECOMMENDATIONS].find_one({"_id": recommendation_id})
    if not rec:
        raise not_found("Recommandation", recommendation_id)
    if rec["status"] != "pending":
        raise DomainError(409, "rec_already_processed", "Recommandation déjà traitée.")

    po = await create_purchase_order(
        db,
        supplier_id=rec["supplier_id"],
        lines=[{"product_id": rec["product_id"], "quantity": rec["recommended_quantity"]}],
        notes=f"Générée par Approvisionnement IA ({rec['_id']})",
        ai_recommended=True,
        user=user,
    )
    await db[COL_RECOMMENDATIONS].update_one(
        {"_id": recommendation_id}, {"$set": {"status": "approved", "po_id": po["_id"]}}
    )
    return po


async def what_if(
    db: AsyncDatabase[dict[str, Any]],
    *,
    product_id: str,
    demand_change_percent: float,
    extra_order_qty: int,
    lead_time_days_override: int | None,
) -> dict[str, Any]:
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)
    stock = int(product.get("stock", 0))
    mean, _, _ = _demand_stats(await _daily_out_history(db, product_id), days=90)
    lead = int(lead_time_days_override if lead_time_days_override is not None else product.get("lead_time_days", 14))

    adjusted_demand = max(0.0, mean * (1 + demand_change_percent / 100))
    current_cover = stock / mean if mean > 0 else 999
    adjusted_cover = stock / adjusted_demand if adjusted_demand > 0 else 999

    def stockout_date(days_cover: float) -> str | None:
        if days_cover > 3650:
            return None
        return (now().date() + timedelta(days=days_cover)).isoformat()

    effective_cover = adjusted_cover + (
        extra_order_qty / adjusted_demand if adjusted_demand > 0 and extra_order_qty else 0
    )
    if adjusted_demand == 0:
        recommendation = "Demande projetée nulle — stock suffisant."
    elif effective_cover < lead:
        recommendation = (
            f"Rupture avant délai fournisseur ({lead} j). Commander "
            f"{math.ceil((lead + 15) * adjusted_demand - stock)} unités immédiatement."
        )
    elif effective_cover < lead * 1.5:
        recommendation = "Marge étroite — lancer une commande préventive."
    else:
        recommendation = "Couverture suffisante dans ce scénario."

    return {
        "product_id": product_id,
        "product_name": product.get("name", ""),
        "current_stock": stock,
        "avg_daily_demand": round(mean, 2),
        "days_of_cover": round(current_cover, 1),
        "stockout_date": stockout_date(current_cover),
        "demand_change_percent": demand_change_percent,
        "adjusted_daily_demand": round(adjusted_demand, 2),
        "adjusted_days_of_cover": round(adjusted_cover, 1),
        "adjusted_stockout_date": stockout_date(adjusted_cover),
        "recommendation": recommendation,
    }


# ── Copilote (réponses déterministes sur données réelles) ────


async def copilot(db: AsyncDatabase[dict[str, Any]], query: str) -> dict[str, Any]:
    q = query.lower()
    from app.services.analytics_service import compute_kpis

    kpis = await compute_kpis(db)
    components: list[dict[str, Any]] = []

    if any(w in q for w in ("rupture", "stock bas", "critique", "risque")):
        at_risk = await db[COL_PRODUCTS].find(
            {"status": {"$in": ["out_of_stock", "low_stock"]}}
        ).to_list(20)
        content = (
            f"{len(at_risk)} produit(s) sont en alerte (rupture ou stock bas). "
            "Voir la liste ci-dessous — les plus critiques d'abord."
        )
        if at_risk:
            components.append({"type": "product_list", "data": at_risk[:5]})
    elif any(w in q for w in ("commander", "achat", "approvisionn", "commande")):
        recs = await db[COL_RECOMMENDATIONS].find({"status": "pending"}).sort("urgency", 1).to_list(5)
        content = (
            f"{len(recs)} recommandation(s) d'achat en attente. "
            "Le montant estimé total est de "
            f"{sum(r.get('estimated_cost', 0) for r in recs):.0f}."
        )
        for rec in recs[:1]:
            components.append({"type": "recommendation", "data": rec})
    elif any(w in q for w in ("valeur", "kpi", "marge", "chiffre", "performance")):
        content = (
            f"Valeur du stock : {kpis['stock_value']:.0f} · Revenus 30 j : {kpis['revenue']:.0f} · "
            f"Marge : {kpis['margin']}% · Rotation : {kpis['rotation']}."
        )
        components.append(
            {
                "type": "kpi",
                "data": {
                    "label": "Valeur du stock",
                    "value": kpis["stock_value"],
                    "trend": kpis["stock_value_trend"],
                },
            }
        )
    elif any(w in q for w in ("prévision", "forecast", "demande")):
        worst = await db[COL_PRODUCTS].find({"status": "out_of_stock"}).to_list(1)
        if worst:
            f = await forecast(db, worst[0]["_id"], horizon_days=90)
            content = f"Prévision pour {f['product_name']} : {f['recommendation']}"
            components.append(
                {
                    "type": "chart",
                    "data": {
                        "title": "Sorties historiques vs prévision",
                        "points": [
                            {"label": p["date"][:7], "value": p.get("historical") or p.get("forecast") or 0}
                            for p in f["data"]
                        ],
                    },
                }
            )
        else:
            content = "Aucun produit en rupture actuellement — les prévisions restent favorables."
    else:
        content = (
            f"Voici la synthèse : {kpis['active_alerts']} alertes actives, "
            f"{kpis['critical_products']} produits critiques, {kpis['pending_orders']} commandes en cours. "
            "Posez-moi une question sur les ruptures, les achats, les prévisions ou les KPIs."
        )

    return {"id": new_id("msg"), "role": "assistant", "content": content, "components": components}


# ── File de jobs (calculs longs exécutés par le worker) ──────


async def enqueue_job(db: AsyncDatabase[dict[str, Any]], job_type: str) -> dict[str, Any]:
    doc = {
        "_id": new_id("job"),
        "type": job_type,
        "status": "queued",
        "payload": {},
        "attempts": 0,
        "result": None,
        "error": None,
        "created_at": now(),
        "claimed_at": None,
        "finished_at": None,
    }
    await db[COL_AI_JOBS].insert_one(doc)
    return doc


async def get_job(db: AsyncDatabase[dict[str, Any]], job_id: str) -> dict[str, Any]:
    doc = await db[COL_AI_JOBS].find_one({"_id": job_id})
    if not doc:
        raise not_found("Job", job_id)
    return doc


async def rescan_ai_flags(db: AsyncDatabase[dict[str, Any]]) -> None:
    """Recalcule les scores de risque IA des produits (simple, explicable)."""
    products = await db[COL_PRODUCTS].find({}).to_list(length=2000)
    for product in products:
        stock = int(product.get("stock", 0))
        min_stock = int(product.get("min_stock", 0))
        mean, _, _ = _demand_stats(await _daily_out_history(db, product["_id"], days=30), days=30)
        lead = int(product.get("lead_time_days", 14))
        days_cover = (stock / mean) if mean > 0 else 999
        if stock <= 0:
            score, risk = 98, "critical"
        elif days_cover < lead * 0.5:
            score, risk = 90, "critical"
        elif days_cover < lead:
            score, risk = 74, "high"
        elif days_cover < lead * 2 or stock < min_stock:
            score, risk = 44, "medium"
        elif max(0, int(product.get("max_stock", 0)) - stock) < min_stock:
            score, risk = 20, "low"
        else:
            score, risk = 5, "none"
        await db[COL_PRODUCTS].update_one(
            {"_id": product["_id"]},
            {"$set": {"ai_risk": risk, "ai_risk_score": score, "updated_at": now()}},
        )
