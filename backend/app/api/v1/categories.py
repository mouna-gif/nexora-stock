"""Catégories — /api/v1/categories."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.services import catalog_service

router = APIRouter(prefix="/categories", tags=["catalog"])


@router.get("")
async def list_categories(
    user: dict = Depends(require_permission("products:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.list_categories(db)
