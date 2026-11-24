"""Authentification — /api/v1/auth"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.api.v1.deps import get_current_user, get_db
from app.schemas import AuthResponse, LoginRequest, LogoutRequest, MessageOut, RefreshRequest, RegisterRequest, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, db: AsyncDatabase = Depends(get_db)) -> Any:
    """Crée un compte. Le premier utilisateur devient automatiquement super_admin."""
    return await auth_service.register(
        db,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        company=payload.company,
        password=payload.password,
        phone=payload.phone,
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncDatabase = Depends(get_db)) -> Any:
    return await auth_service.login(db, email=payload.email, password=payload.password)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(payload: RefreshRequest, db: AsyncDatabase = Depends(get_db)) -> Any:
    """Rotation des jetons : l'ancien refresh est révoqué."""
    return await auth_service.refresh(db, refresh_token=payload.refresh_token)


@router.post("/logout", response_model=MessageOut)
async def logout(
    payload: LogoutRequest,
    user: dict = Depends(get_current_user),
    db: AsyncDatabase = Depends(get_db),
) -> Any:
    await auth_service.logout(db, user_id=user["id"], refresh_token=payload.refresh_token)
    return {"message": "Déconnexion effectuée."}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)) -> Any:
    return user
