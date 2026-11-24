"""Gestion des utilisateurs (RBAC appliqué côté serveur)."""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import COL_USERS, initials, new_id, now, public_user_doc
from app.schemas.base import serialize_many
from app.schemas.domain import UserOut
from app.security.passwords import hash_password
from app.security.rbac import ALL_ROLES


async def list_users(
    db: AsyncDatabase[dict[str, Any]], *, skip: int = 0, limit: int = 100, search: str | None = None
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if search:
        filters["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
        ]
    cursor = db[COL_USERS].find(filters, {"password_hash": 0}).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    total = await db[COL_USERS].count_documents(filters)
    return {"items": serialize_many(UserOut, [public_user_doc(d) for d in docs]), "total": total, "skip": skip, "limit": limit}


async def create_user(
    db: AsyncDatabase[dict[str, Any]],
    *,
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    role: str,
    company: str = "",
    phone: str | None = None,
) -> dict[str, Any]:
    email = email.strip().lower()
    if role not in ALL_ROLES:
        raise DomainError(422, "invalid_role", f"Rôle inconnu : {role}")
    if await db[COL_USERS].find_one({"email": email}):
        raise DomainError(409, "email_exists", "Un compte existe déjà avec cet email.")
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
    return public_user_doc(doc)


async def update_user(
    db: AsyncDatabase[dict[str, Any]], user_id: str, fields: dict[str, Any]
) -> dict[str, Any]:
    if "role" in fields and fields["role"] is not None and fields["role"] not in ALL_ROLES:
        raise DomainError(422, "invalid_role", f"Rôle inconnu : {fields['role']}")
    doc = await db[COL_USERS].find_one_and_update(
        {"_id": user_id},
        {"$set": {k: v for k, v in fields.items() if v is not None or k == "is_active"}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Utilisateur", user_id)
    return public_user_doc(doc)


async def deactivate_user(db: AsyncDatabase[dict[str, Any]], user_id: str) -> dict[str, Any]:
    """Désactivation réversible — jamais de suppression physique."""
    doc = await db[COL_USERS].find_one_and_update(
        {"_id": user_id},
        {"$set": {"is_active": False, "updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Utilisateur", user_id)
    return public_user_doc(doc)
