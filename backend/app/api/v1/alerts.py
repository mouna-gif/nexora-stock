"""Alertes — /api/v1/alerts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.services import alert_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    unread_only: bool = False,
    severity: str | None = None,
    type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("alerts:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await alert_service.list_alerts(
        db, unread_only=unread_only, severity=severity, type=type, skip=skip, limit=limit
    )


@router.patch("/{alert_id}/read")
async def mark_read(
    alert_id: str,
    user: dict = Depends(require_permission("alerts:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await alert_service.mark_read(db, alert_id)


@router.patch("/{alert_id}/resolve")
async def resolve(
    alert_id: str,
    user: dict = Depends(require_permission("alerts:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await alert_service.resolve(db, alert_id)
