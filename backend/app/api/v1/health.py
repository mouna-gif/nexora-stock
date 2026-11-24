"""Santé du service — /api/v1/health (sans authentification)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pymongo.asynchronous.database import AsyncDatabase

from app import __version__
from app.api.v1.deps import get_db
from app.core import db as core_db
from fastapi import Depends

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncDatabase = Depends(get_db)) -> Any:
    database_ok = await core_db.ping()
    # La base ne doit PAS être une base système.
    return {
        "status": "ok" if database_ok else "degraded",
        "version": __version__,
        "database": db.name,
        "database_connected": database_ok,
        # Plateforme 100 % autonome : zéro intégration externe, zéro CMS tiers,
        # zéro connecteur — tout tourne en local (API + MongoDB uniquement).
        "autonomous": True,
        "mode": "Plateforme 100 % autonome — aucune intégration externe",
        "external_integrations": [],
    }
