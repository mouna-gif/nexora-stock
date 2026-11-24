"""Paramètres société (documents imprimables) + journal d'audit."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, get_current_user, require_permission
from app.schemas import CompanySettingsUpdate
from app.services import audit, company_service

router = APIRouter(tags=["settings"])


@router.get("/settings/company")
async def get_company_settings(
    user: dict = Depends(require_permission("settings:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await company_service.get_company_settings(db)


@router.put("/settings/company")
async def update_company_settings(
    payload: CompanySettingsUpdate,
    user: dict = Depends(require_permission("settings:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Seul un super administrateur configure les informations légales,
    la devise, la TVA par défaut et la numérotation des documents."""
    result = await company_service.update_company_settings(db, payload.model_dump(exclude_unset=True), user)
    await audit.log_action(
        db, action="settings.updated", entity_type="company_settings", entity_id="main",
        user=user, details={"fields": sorted(payload.model_dump(exclude_unset=True))},
    )
    return result


@router.get("/audit")
async def list_audit_logs(
    entity_type: str | None = None,
    entity_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_permission("audit:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await audit.list_audit(db, entity_type=entity_type, entity_id=entity_id, skip=skip, limit=limit)
