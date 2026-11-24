"""Handlers de jobs IA — exécutés par le worker, jamais dans la requête HTTP."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Awaitable, Callable

from pymongo.asynchronous.database import AsyncDatabase

from app.models.fields import now
from app.services import ai_service, analytics_service

logger = logging.getLogger(__name__)

JobHandler = Callable[[AsyncDatabase[dict[str, Any]]], Awaitable[dict[str, Any] | list[dict[str, Any]] | None]]


async def _compute_kpis(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    kpis = await analytics_service.compute_kpis(db)
    health = await analytics_service.stock_health(db)
    # Snapshot pour les tendances futures (insertion, jamais de remplacement).
    await db["analytics_snapshots"].insert_one(
        {"type": "kpis", "kpis": kpis, "created_at": now()}
    )
    await db["analytics_snapshots"].insert_one(
        {"type": "stock_health", "overall": health["overall"], "created_at": now()}
    )
    return {"kpis": kpis, "health": health}


async def _detect_anomalies(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    result = await ai_service.detect_anomalies(db)
    await ai_service.rescan_ai_flags(db)
    return result


async def _forecast_all(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    products = await db["products"].find({"status": {"$in": ["low_stock", "out_of_stock"]}}).to_list(50)
    count = 0
    for product in products:
        await ai_service.forecast(db, product["_id"], horizon_days=90)
        count += 1
    return {"forecasts_created": count}


async def _dead_stock_scan(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    items = await ai_service.dead_stock_scan(db)
    return {"dead_stock_count": len(items), "items": items[:20]}


async def _procurement_scan(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    return await ai_service.procurement_scan(db)


JOB_HANDLERS: dict[str, JobHandler] = {
    "compute_kpis": _compute_kpis,
    "detect_anomalies": _detect_anomalies,
    "forecast_all": _forecast_all,
    "dead_stock_scan": _dead_stock_scan,
    "procurement_scan": _procurement_scan,
}


async def run_job(db: AsyncDatabase[dict[str, Any]], job: dict[str, Any]) -> bool:
    """Exécute un job marqué `running` et publie le résultat. Retourne le succès."""
    from app.services.events import event_bus

    handler = JOB_HANDLERS.get(job["type"])
    try:
        if handler is None:
            raise ValueError(f"Type de job inconnu : {job['type']}")
        result = await handler(db)
        await db["ai_jobs"].update_one(
            {"_id": job["_id"], "status": "running"},
            {"$set": {"status": "done", "result": _plain(result), "finished_at": now()}},
        )
        await event_bus.publish("job.completed", {"job_id": job["_id"], "type": job["type"]})
        return True
    except Exception as exc:  # noqa: BLE001 — un job ne doit jamais tuer le worker
        logger.exception("Job %s (%s) échoué.", job["_id"], job["type"])
        await db["ai_jobs"].update_one(
            {"_id": job["_id"], "status": "running"},
            {"$set": {"status": "failed", "error": str(exc), "finished_at": now()}},
        )
        return False


def _plain(value: Any) -> Any:
    """Rend un résultat sérialisable (BSON friendly)."""
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, datetime):
        return value.isoformat()
    return value
