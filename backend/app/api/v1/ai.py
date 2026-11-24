"""Modules IA — /api/v1/ai (prévisions, anomalies, recommandations,
copilote, what-if, jobs de calcul long)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import AIJobCreate, CopilotRequest, WhatIfRequest
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/forecast/{product_id}")
async def forecast(
    product_id: str,
    horizon: int = Query(90, ge=7, le=365),
    user: dict = Depends(require_permission("ai:use")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.forecast(db, product_id, horizon_days=horizon)


@router.get("/anomalies")
async def anomalies(
    unresolved_only: bool = False,
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("alerts:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.list_anomalies(db, unresolved_only=unresolved_only, limit=limit)


@router.get("/recommendations")
async def recommendations(
    status: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("purchasing:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.list_recommendations(db, status=status, limit=limit)


@router.post("/recommendations/{recommendation_id}/approve")
async def approve_recommendation(
    recommendation_id: str,
    user: dict = Depends(require_permission("purchasing:approve")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Approuve une recommandation IA → crée la commande d'achat (brouillon)."""
    return await ai_service.approve_recommendation(db, recommendation_id, user)


@router.post("/copilot")
async def copilot(
    payload: CopilotRequest,
    user: dict = Depends(require_permission("ai:use")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.copilot(db, payload.query)


@router.post("/what-if")
async def what_if(
    payload: WhatIfRequest,
    user: dict = Depends(require_permission("ai:use")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.what_if(
        db,
        product_id=payload.product_id,
        demand_change_percent=payload.demand_change_percent,
        extra_order_qty=payload.extra_order_qty,
        lead_time_days_override=payload.lead_time_days_override,
    )


@router.post("/jobs")
async def enqueue_job(
    payload: AIJobCreate,
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Met un calcul long en file — exécuté par le worker séparé."""
    return await ai_service.enqueue_job(db, payload.type)


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.get_job(db, job_id)
