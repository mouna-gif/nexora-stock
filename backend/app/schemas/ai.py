"""Schémas IA (prévisions, anomalies, recommandations, copilote, what-if)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from .base import BaseSchema
from .domain import AlertSeverity


class ForecastPointOut(BaseSchema):
    date: str
    historical: float | None = None
    forecast: float | None = None
    lower: float | None = None
    upper: float | None = None


class ForecastOut(BaseSchema):
    product_id: str
    product_name: str
    horizon: int
    confidence: float
    model: str
    data: list[ForecastPointOut]
    recommendation: str
    factors: list[str] = []


class AnomalyOut(BaseSchema):
    id: str
    type: Literal[
        "stockout_spike", "overstock", "unusual_movement", "price_anomaly", "supplier_delay"
    ]
    product_id: str
    product_name: str
    warehouse_id: str
    score: float
    severity: AlertSeverity
    description: str
    detected_at: datetime | None = None
    is_resolved: bool = False
    recommendation: str = ""


class RecommendationOut(BaseSchema):
    id: str
    product_id: str
    product_name: str
    product_sku: str
    current_stock: int
    forecast_demand: int
    recommended_quantity: int
    lead_time_days: int
    safety_stock: int
    confidence: float
    reasons: list[str] = []
    estimated_cost: float
    urgency: Literal["critical", "high", "medium", "low"]
    supplier_id: str
    supplier_name: str
    status: Literal["pending", "approved", "ignored", "ordered"] = "pending"


class CopilotRequest(BaseSchema):
    query: str


class CopilotResponse(BaseSchema):
    id: str
    role: Literal["user", "assistant"] = "assistant"
    content: str
    timestamp: datetime | None = None
    components: list[dict[str, Any]] = []


class WhatIfRequest(BaseSchema):
    product_id: str
    demand_change_percent: float = 0.0
    extra_order_qty: int = 0
    lead_time_days_override: int | None = None


class WhatIfResponse(BaseSchema):
    product_id: str
    product_name: str
    current_stock: int
    avg_daily_demand: float
    days_of_cover: float
    stockout_date: str | None
    demand_change_percent: float
    adjusted_daily_demand: float
    adjusted_days_of_cover: float
    adjusted_stockout_date: str | None
    recommendation: str


class AIJobCreate(BaseSchema):
    type: Literal["compute_kpis", "detect_anomalies", "forecast_all", "dead_stock_scan", "procurement_scan"]


class AIJobOut(BaseSchema):
    id: str
    type: str
    status: Literal["queued", "running", "done", "failed"]
    attempts: int = 0
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime | None = None
    finished_at: datetime | None = None
