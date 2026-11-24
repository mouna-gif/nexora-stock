"""Service d'authentification : inscription, connexion, refresh, déconnexion."""

from __future__ import annotations

from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, invalid_credentials
from app.models.fields import (
    COL_PRODUCTS,
    COL_REFRESH_TOKENS,
    COL_USERS,
    initials,
    new_id,
    now,
    public_user_doc,
)
from app.security.jwt_tokens import (
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_refresh_token,
)
from app.security.passwords import hash_password, verify_password


def _public(doc: dict[str, Any]) -> dict[str, Any]:
    doc.setdefault("avatar", initials(doc.get("first_name", ""), doc.get("last_name", "")))
    return public_user_doc(doc)


async def register(
    db: AsyncDatabase[dict[str, Any]],
    *,
    first_name: str,
    last_name: str,
    email: str,
    company: str,
    password: str,
    phone: str | None = None,
) -> dict[str, Any]:
    """Crée un compte. Le tout premier utilisateur devient super_admin."""
    email = email.strip().lower()
    existing = await db[COL_USERS].find_one({"email": email})
    if existing:
        raise DomainError(409, "email_exists", "Un compte existe déjà avec cet email.")

    users_count = await db[COL_USERS].count_documents({})
    role = "super_admin" if users_count == 0 else "commercial_user"

    doc = {
        "_id": new_id("usr"),
        "first_name": first_name.strip(),
        "last_name": last_name.strip(),
        "email": email,
        "phone": phone,
        "role": role,
        "company": company.strip(),
        "password_hash": hash_password(password),
        "avatar": initials(first_name, last_name),
        "created_at": now(),
        "last_login": None,
        "is_active": True,
    }
    await db[COL_USERS].insert_one(doc)
    return await issue_token_pair(db, doc)


async def login(db: AsyncDatabase[dict[str, Any]], *, email: str, password: str) -> dict[str, Any]:
    email = email.strip().lower()
    doc = await db[COL_USERS].find_one({"email": email})
    if not doc or not doc.get("is_active", True):
        raise invalid_credentials()
    if not verify_password(password, doc.get("password_hash", "")):
        raise invalid_credentials()
    await db[COL_USERS].update_one({"_id": doc["_id"]}, {"$set": {"last_login": now()}})
    return await issue_token_pair(db, doc)


async def refresh(db: AsyncDatabase[dict[str, Any]], *, refresh_token: str) -> dict[str, Any]:
    """Rotation : l'ancien refresh est révoqué, une nouvelle paire est émise."""
    payload = decode_token(refresh_token, REFRESH_TOKEN_TYPE)
    jti = payload["jti"]
    stored = await db[COL_REFRESH_TOKENS].find_one({"jti": jti})
    if not stored or stored.get("revoked"):
        raise DomainError(401, "invalid_refresh", "Session expirée ou révoquée.")
    if stored.get("token_hash") != hash_refresh_token(refresh_token):
        # Réutilisation d'un jeton volé → révoque toute la famille utilisateur.
        await db[COL_REFRESH_TOKENS].update_many(
            {"user_id": stored["user_id"]}, {"$set": {"revoked": True}}
        )
        raise DomainError(401, "refresh_reuse_detected", "Jeton de rafraîchissement invalide.")

    user = await db[COL_USERS].find_one({"_id": payload["sub"]})
    if not user or not user.get("is_active", True):
        raise DomainError(401, "invalid_refresh", "Compte introuvable ou désactivé.")

    await db[COL_REFRESH_TOKENS].update_one({"jti": jti}, {"$set": {"revoked": True}})
    return await issue_token_pair(db, user)


async def logout(
    db: AsyncDatabase[dict[str, Any]], *, user_id: str, refresh_token: str | None = None
) -> None:
    """Révoque le refresh fourni, ou tous les refresh de l'utilisateur."""
    if refresh_token:
        try:
            payload = decode_token(refresh_token, REFRESH_TOKEN_TYPE)
            await db[COL_REFRESH_TOKENS].update_one(
                {"jti": payload["jti"], "user_id": user_id}, {"$set": {"revoked": True}}
            )
            return
        except DomainError:
            pass  # jeton déjà invalide → rien à révoquer
    await db[COL_REFRESH_TOKENS].update_many(
        {"user_id": user_id}, {"$set": {"revoked": True}}
    )


async def get_user(db: AsyncDatabase[dict[str, Any]], user_id: str) -> dict[str, Any] | None:
    doc = await db[COL_USERS].find_one({"_id": user_id})
    return _public(doc) if doc else None


async def issue_token_pair(
    db: AsyncDatabase[dict[str, Any]], user_doc: dict[str, Any]
) -> dict[str, Any]:
    access = create_access_token(user_doc["_id"], user_doc["role"])
    refresh_token, jti, expires_at = create_refresh_token(user_doc["_id"])
    await db[COL_REFRESH_TOKENS].insert_one(
        {
            "_id": jti,
            "jti": jti,
            "user_id": user_doc["_id"],
            "token_hash": hash_refresh_token(refresh_token),
            "expires_at": expires_at,
            "revoked": False,
            "created_at": now(),
        }
    )
    return {
        "access_token": access,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _public(user_doc),
    }
