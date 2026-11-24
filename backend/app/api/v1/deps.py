"""Dépendances FastAPI : base de données, utilisateur courant, RBAC."""

from __future__ import annotations

from typing import Any, AsyncIterator, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError
from app.models.fields import COL_USERS
from app.models.fields import public_user_doc
from app.security.jwt_tokens import ACCESS_TOKEN_TYPE, decode_token
from app.security.rbac import require_role_permission

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db(request: Request) -> AsyncIterator[AsyncDatabase[dict[str, Any]]]:
    """Base MongoDB partagée (lifecycle de l'application)."""
    yield request.app.state.db


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if credentials is None:
        raise DomainError(401, "not_authenticated", "Authentification requise.")
    payload = decode_token(credentials.credentials, ACCESS_TOKEN_TYPE)
    db: AsyncDatabase[dict[str, Any]] = request.app.state.db
    user = await db[COL_USERS].find_one({"_id": payload.get("sub")})
    if not user:
        raise DomainError(401, "user_not_found", "Utilisateur introuvable.")
    if not user.get("is_active", True):
        raise DomainError(403, "user_disabled", "Compte désactivé.")
    user.setdefault("avatar", f"{user.get('first_name', ' ')[:1]}{user.get('last_name', ' ')[:1]}".upper())
    return public_user_doc(user)


def require_permission(permission: str) -> Callable[[dict[str, Any]], Any]:
    """Fabrique de dépendance : vérifie la permission du rôle serveur-side."""

    async def _checker(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        require_role_permission(user["role"], permission)
        return user

    return _checker
