"""Utilisateurs — /api/v1/users (permission users:manage)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_db, require_permission
from app.schemas import MessageOut, UserCreate, UserOut, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=None)
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    user: dict = Depends(require_permission("users:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await user_service.list_users(db, skip=skip, limit=limit, search=search)


@router.post("", response_model=UserOut)
async def create_user(
    payload: UserCreate,
    user: dict = Depends(require_permission("users:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await user_service.create_user(
        db,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
        company=payload.company,
        phone=payload.phone,
    )


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    user: dict = Depends(require_permission("users:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    return await user_service.update_user(db, user_id, payload.model_dump(exclude_unset=True))


@router.delete("/{user_id}", response_model=MessageOut)
async def deactivate_user(
    user_id: str,
    user: dict = Depends(require_permission("users:manage")),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    """Désactivation réversible — le backend ne supprime jamais d'utilisateur."""
    await user_service.deactivate_user(db, user_id)
    return {"message": "Utilisateur désactivé."}
