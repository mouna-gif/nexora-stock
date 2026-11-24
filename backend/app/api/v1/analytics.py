"""Analytique — /api/v1/analytics."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import CategoryStockPointOut, DashboardKPIsOut, RevenuePointOut, StockHealthOut
from app.services import analytics_service, ai_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/kpis", response_model=DashboardKPIsOut)
async def kpis(
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await analytics_service.compute_kpis(db)


@router.get("/stock-health", response_model=StockHealthOut)
async def stock_health(
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await analytics_service.stock_health(db)


@router.get("/revenue-trend", response_model=list[RevenuePointOut])
async def revenue_trend(
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await analytics_service.revenue_trend(db)


@router.get("/category-stock", response_model=list[CategoryStockPointOut])
async def category_stock(
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await analytics_service.category_stock(db)


@router.get("/dead-stock")
async def dead_stock(
    user: dict = Depends(require_permission("analytics:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await ai_service.dead_stock_scan(db)
