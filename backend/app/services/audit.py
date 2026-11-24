"""Journal d'audit — chaque action sensible est tracée (immuable)."""

from __future__ import annotations

from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.models.fields import COL_AUDIT_LOGS, new_id, now
from app.schemas.base import serialize, serialize_many
from app.schemas.commercial import AuditLogOut


async def log_action(
    db: AsyncDatabase[dict[str, Any]],
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    user: dict[str, Any],
    details: dict[str, Any] | None = None,
) -> None:
    doc = {
        "_id": new_id("aud"),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "user_id": user.get("id", ""),
        "username": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get("email", ""),
        "details": details or {},
        "created_at": now(),
    }
    await db[COL_AUDIT_LOGS].insert_one(doc)


async def list_audit(
    db: AsyncDatabase[dict[str, Any]],
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if entity_type:
        filters["entity_type"] = entity_type
    if entity_id:
        filters["entity_id"] = entity_id
    cursor = db[COL_AUDIT_LOGS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_AUDIT_LOGS].count_documents(filters)
    return {"items": serialize_many(AuditLogOut, items), "total": total, "skip": skip, "limit": limit}
