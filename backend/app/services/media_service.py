"""Média — stockage persistant des images produits (côté backend).

Les fichiers sont écrits sur disque dans un dossier géré par le backend
(`MEDIA_DIR`, défaut : `<backend>/media`) et référencés dans MongoDB
(collection `media`). Les produits stockent des références stables
(`media_id` + URL backend) — jamais de blob URL navigateur.
"""

from __future__ import annotations

import mimetypes
import os
import re
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.core.config import get_settings
from app.models.fields import COL_COMPANY_SETTINGS, COL_MEDIA, COL_PRODUCTS, new_id, now
from app.schemas.base import serialize
from app.schemas.commercial import MediaOut

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 Mo


def media_root() -> Path:
    settings = get_settings()
    if settings.media_dir:
        root = Path(settings.media_dir)
    else:
        root = Path(__file__).resolve().parents[2] / "media"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_extension(filename: str, content_type: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        guessed = mimetypes.guess_extension(content_type or "") or ""
        ext = guessed.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise DomainError(
            422,
            "unsupported_media_type",
            "Format d'image non supporté (autorisés : JPG, PNG, WebP, GIF).",
        )
    return ext


async def save_media(
    db: AsyncDatabase[dict[str, Any]], file: UploadFile, user: dict[str, Any]
) -> dict[str, Any]:
    ext = _safe_extension(file.filename or "", file.content_type or "")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise DomainError(422, "file_too_large", "Image trop volumineuse (maximum 5 Mo).")
    if not content:
        raise DomainError(422, "empty_file", "Fichier vide.")

    media_id = new_id("med")
    path = media_root() / f"{media_id}{ext}"
    path.write_bytes(content)

    doc = {
        "_id": media_id,
        "filename": re.sub(r"[^\w.\- ]", "_", file.filename or f"image{ext}")[:120],
        "content_type": file.content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        "size": len(content),
        "extension": ext,
        "url": f"/api/v1/media/{media_id}/file",
        "uploaded_by": user["id"],
        "uploaded_by_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "created_at": now(),
    }
    await db[COL_MEDIA].insert_one(doc)
    return serialize(MediaOut, doc)


async def get_media(db: AsyncDatabase[dict[str, Any]], media_id: str) -> dict[str, Any]:
    doc = await db[COL_MEDIA].find_one({"_id": media_id})
    if not doc:
        raise not_found("Média", media_id)
    return doc


def media_file_path(doc: dict[str, Any]) -> Path:
    return media_root() / f"{doc['_id']}{doc.get('extension', '')}"


async def get_media_file(db: AsyncDatabase[dict[str, Any]], media_id: str) -> tuple[Path, dict[str, Any]]:
    doc = await get_media(db, media_id)
    path = media_file_path(doc)
    if not path.exists():
        raise not_found("Fichier média", media_id)
    return path, doc


async def delete_media(db: AsyncDatabase[dict[str, Any]], media_id: str) -> dict[str, str]:
    doc = await get_media(db, media_id)
    # Recherche de références en Python (sûre avec les tableaux d'images).
    products = await db[COL_PRODUCTS].find({}).to_list(length=None)
    referenced = sum(
        1 for p in products
        if any(img.get("media_id") == media_id for img in (p.get("images") or []))
    )
    if referenced:
        raise DomainError(
            409,
            "media_in_use",
            "Média utilisé par au moins un produit — retirez-le du produit d'abord.",
        )
    await db[COL_COMPANY_SETTINGS].update_one(
        {"logo_media_id": media_id}, {"$set": {"logo_media_id": None}}
    )
    path = media_file_path(doc)
    if path.exists():
        path.unlink()
    await db[COL_MEDIA].delete_one({"_id": media_id})
    return {"message": "Média supprimé."}


async def attach_product_image(
    db: AsyncDatabase[dict[str, Any]],
    product_id: str,
    media_id: str,
    *,
    is_primary: bool = False,
) -> dict[str, Any]:
    """Associe un média existant à un produit (référence stable en base)."""
    doc = await get_media(db, media_id)
    image = {
        "media_id": doc["_id"],
        "url": doc["url"],
        "filename": doc["filename"],
        "is_primary": bool(is_primary),
    }
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)
    images = [img for img in (product.get("images") or []) if img.get("media_id") != media_id]
    if is_primary:
        for img in images:
            img["is_primary"] = False
    images.append(image)
    set_update: dict[str, Any] = {"images": images, "updated_at": now()}
    if is_primary:
        set_update["image"] = image["url"]
    updated = await db[COL_PRODUCTS].find_one_and_update(
        {"_id": product_id},
        {"$set": set_update},
        return_document=ReturnDocument.AFTER,
    )
    return updated or product


async def set_primary_image(
    db: AsyncDatabase[dict[str, Any]], product_id: str, media_id: str
) -> dict[str, Any]:
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)
    images = product.get("images") or []
    if not any(img.get("media_id") == media_id for img in images):
        raise not_found("Image produit", media_id)
    for img in images:
        img["is_primary"] = img.get("media_id") == media_id
    primary_url = next((img["url"] for img in images if img["is_primary"]), None)
    updated = await db[COL_PRODUCTS].find_one_and_update(
        {"_id": product_id},
        {"$set": {"images": images, "image": primary_url, "updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    return updated or product


async def remove_product_image(
    db: AsyncDatabase[dict[str, Any]], product_id: str, media_id: str
) -> dict[str, Any]:
    product = await db[COL_PRODUCTS].find_one({"_id": product_id})
    if not product:
        raise not_found("Produit", product_id)
    images = [img for img in (product.get("images") or []) if img.get("media_id") != media_id]
    if len(images) == len(product.get("images") or []):
        raise not_found("Image produit", media_id)
    if not any(img.get("is_primary") for img in images) and images:
        images[0]["is_primary"] = True
    primary_url = next((img["url"] for img in images if img.get("is_primary")), None)
    updated = await db[COL_PRODUCTS].find_one_and_update(
        {"_id": product_id},
        {"$set": {"images": images, "image": primary_url, "updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    return updated or product
