"""Média — upload et service des images produits (stockage persistant)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.services import media_service

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/upload")
async def upload_media(
    file: UploadFile,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Upload d'une image → stockée sur disque par le backend + référencée
    en base (ID stable) — jamais d'URL blob navigateur."""
    return await media_service.save_media(db, file, user)


@router.get("/{media_id}/file")
async def get_media_file(media_id: str, db: AsyncDatabase = Depends(get_db)) -> Any:
    """Sert le fichier image (public en lecture, indispensable aux <img>)."""
    path, doc = await media_service.get_media_file(db, media_id)
    return FileResponse(path, media_type=doc.get("content_type") or "application/octet-stream")


@router.delete("/{media_id}")
async def delete_media(
    media_id: str,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Suppression autorisée uniquement si le média n'est référencé par aucun produit."""
    return await media_service.delete_media(db, media_id)
