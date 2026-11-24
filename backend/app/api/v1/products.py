"""Produits — /api/v1/products"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import ProductCreate, ProductImageAttach, ProductOut, ProductUpdate
from app.services import catalog_service, media_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def list_products(
    search: str | None = None,
    category: str | None = None,
    brand: str | None = None,
    status: str | None = None,
    warehouse_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("products:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.list_products(
        db, search=search, category=category, brand=brand, status=status,
        warehouse_id=warehouse_id, skip=skip, limit=limit,
    )


@router.get("/{product_id}")
async def get_product(
    product_id: str,
    user: dict = Depends(require_permission("products:read")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.get_product(db, product_id)


@router.post("", response_model=ProductOut)
async def create_product(
    payload: ProductCreate,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Création produit — le stock initial éventuel passe par un vrai
    mouvement de stock tracé (jamais d'écriture directe)."""
    return await catalog_service.create_product(db, payload.model_dump(), user)


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await catalog_service.update_product(db, product_id, payload.model_dump(exclude_unset=True))


# ── Images produit (stockage persistant côté backend) ────────


@router.post("/{product_id}/images", response_model=ProductOut)
async def attach_product_image(
    product_id: str,
    payload: ProductImageAttach,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Associe un média déjà uploadé (ID stable en base) au produit."""
    await media_service.attach_product_image(
        db, product_id, payload.media_id, is_primary=payload.is_primary)
    return await catalog_service.get_product(db, product_id)


@router.patch("/{product_id}/images/{media_id}/primary", response_model=ProductOut)
async def set_primary_image(
    product_id: str,
    media_id: str,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    await media_service.set_primary_image(db, product_id, media_id)
    return await catalog_service.get_product(db, product_id)


@router.delete("/{product_id}/images/{media_id}", response_model=ProductOut)
async def remove_product_image(
    product_id: str,
    media_id: str,
    user: dict = Depends(require_permission("products:write")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Retire l'association image↔produit (le média reste supprimable séparément)."""
    await media_service.remove_product_image(db, product_id, media_id)
    return await catalog_service.get_product(db, product_id)
