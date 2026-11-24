"""Commandes d'achat — cycle draft → pending → approved → ordered →
partial/received, annulation possible avant réception complète.

Les quantités reçues / facturées sont bornées ATOMIQUEMENT (version +
condition sur la quantité restante) par les services de réception et de
facturation fournisseur. Numérotation via compteur atomique (sans doublon).
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import COL_PURCHASE_ORDERS, COL_SUPPLIERS, new_id, now
from app.schemas.base import serialize, serialize_many
from app.schemas.domain import PurchaseOrderOut
from app.services.audit import log_action
from app.services.commercial import build_lines, check_transition, history_entry, push_history, r2
from app.services.company_service import get_commercial_defaults
from app.services.sequences import next_number

MAX_ATTEMPTS = 8

VALID_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"pending", "cancelled"},
    "pending": {"approved", "cancelled"},
    "approved": {"ordered", "cancelled"},
    "ordered": {"cancelled"},
    "partial": set(),  # piloté par les réceptions
    "received": set(),
    "cancelled": set(),
}


async def list_purchase_orders(
    db: AsyncDatabase[dict[str, Any]],
    *,
    status: str | None = None,
    supplier_id: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if supplier_id:
        filters["supplier_id"] = supplier_id
    if search:
        filters["$or"] = [{"reference": {"$regex": search, "$options": "i"}},
                          {"supplier_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_PURCHASE_ORDERS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_PURCHASE_ORDERS].count_documents(filters)
    return {"items": serialize_many(PurchaseOrderOut, items), "total": total, "skip": skip, "limit": limit}


async def get_purchase_order(db: AsyncDatabase[dict[str, Any]], po_id: str) -> dict[str, Any]:
    doc = await db[COL_PURCHASE_ORDERS].find_one({"_id": po_id})
    if not doc:
        raise not_found("Commande d'achat", po_id)
    return serialize(PurchaseOrderOut, doc)


async def create_purchase_order(
    db: AsyncDatabase[dict[str, Any]],
    *,
    supplier_id: str,
    lines: list[dict[str, Any]],
    expected_delivery: Any = None,
    notes: str | None = None,
    ai_recommended: bool = False,
    user: dict[str, Any],
    supplier_quotation_id: str | None = None,
    supplier_quotation_number: str | None = None,
) -> dict[str, Any]:
    supplier = await db[COL_SUPPLIERS].find_one({"_id": supplier_id})
    if not supplier:
        raise not_found("Fournisseur", supplier_id)
    if not lines:
        raise DomainError(422, "empty_order", "La commande doit contenir au moins une ligne.")

    defaults = await get_commercial_defaults(db)
    built_lines, totals = await build_lines(
        db, lines, default_tax_rate=defaults["default_tax_rate"], price_field="cost_price"
    )
    po_lines = []
    for line in built_lines:
        po_lines.append({
            **line,
            "product_name": line["name"],
            "product_sku": line["sku"],
            "total_price": line["net_amount"],
            "received_quantity": 0,
            "invoiced_quantity": 0,
        })

    reference = await next_number(db, "purchase_order")
    doc = {
        "_id": new_id("po"),
        "reference": reference,
        "supplier_id": supplier_id,
        "supplier_name": supplier.get("name", ""),
        "status": "draft",
        "lines": po_lines,
        "totals": totals,
        "total_amount": totals["total_ht"],
        "expected_delivery": expected_delivery,
        "ai_recommended": ai_recommended,
        "supplier_quotation_id": supplier_quotation_id,
        "supplier_quotation_number": supplier_quotation_number,
        "notes": notes,
        "created_by": user["id"],
        "approved_by": None,
        "created_at": now(),
        "updated_at": now(),
        "version": 0,
    }
    await db[COL_PURCHASE_ORDERS].insert_one(doc)
    await log_action(db, action="purchase_order.created", entity_type="purchase_order",
                     entity_id=doc["_id"], user=user, details={"reference": reference})
    return serialize(PurchaseOrderOut, doc)


async def transition(
    db: AsyncDatabase[dict[str, Any]], po_id: str, target: str, user: dict[str, Any]
) -> dict[str, Any]:
    po = await get_purchase_order(db, po_id)
    current = po["status"]
    allowed = VALID_TRANSITIONS.get(current, set())
    check_transition(current, target, VALID_TRANSITIONS, "commande d'achat")
    update: dict[str, Any] = {"status": target, "updated_at": now()}
    if target in ("approved", "ordered"):
        update["approved_by"] = user["id"]
    doc = await db[COL_PURCHASE_ORDERS].find_one_and_update(
        {"_id": po_id, "status": current},
        {"$set": update, "$inc": {"version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise DomainError(409, "po_modified", "Commande modifiée concurrentement, réessayez.")
    await push_history(db, COL_PURCHASE_ORDERS, po_id, history_entry(user, f"status:{target}"))
    await log_action(db, action=f"purchase_order.{target}", entity_type="purchase_order",
                     entity_id=po_id, user=user, details={"reference": po.get("reference")})
    return serialize(PurchaseOrderOut, doc)


async def bump_po_lines(
    db: AsyncDatabase[dict[str, Any]],
    po_id: str,
    updates: list[tuple[str, str, int]],  # (line_id, field, qty)
    *,
    bound_field: str,
    rollback: bool = False,
) -> None:
    """Incrémente/décrémente des compteurs de lignes de commande d'achat
    avec condition de version (concurrence optimiste) et borne métier."""
    applied: list[tuple[str, str, int]] = []
    try:
        for line_id, field, qty in updates:
            for _ in range(MAX_ATTEMPTS):
                po = await db[COL_PURCHASE_ORDERS].find_one({"_id": po_id})
                if not po:
                    raise not_found("Commande d'achat", po_id)
                idx = next((i for i, l in enumerate(po["lines"]) if l["id"] == line_id), None)
                if idx is None:
                    raise not_found("Ligne de commande", line_id)
                line = po["lines"][idx]
                if rollback:
                    new_value = int(line.get(field, 0)) - qty
                    if new_value < 0:
                        return
                else:
                    bound = int(line.get(bound_field, 0))
                    if int(line.get(field, 0)) + qty > bound:
                        raise DomainError(
                            409, "over_limit",
                            f"Quantité dépassée pour {line['product_sku']} ({bound_field}).")
                    new_value = int(line.get(field, 0)) + qty
                lines = [dict(l) for l in po["lines"]]
                lines[idx][field] = new_value
                updated = await db[COL_PURCHASE_ORDERS].find_one_and_update(
                    {"_id": po_id, "version": int(po.get("version", 0))},
                    {"$set": {"lines": lines, "updated_at": now()}, "$inc": {"version": 1}},
                    return_document=ReturnDocument.AFTER,
                )
                if updated:
                    applied.append((line_id, field, qty))
                    break
            else:
                raise DomainError(503, "concurrency_exceeded",
                                  "Trop de modifications simultanées sur la commande.")
    except Exception:
        if not rollback and applied:
            await bump_po_lines(db, po_id, applied, bound_field=bound_field, rollback=True)
        raise


async def recompute_status_after_receipt(db: AsyncDatabase[dict[str, Any]], po_id: str) -> str:
    """partial si tout n'est pas reçu, received si toutes lignes complètes."""
    po = await db[COL_PURCHASE_ORDERS].find_one({"_id": po_id})
    if not po or po["status"] in ("draft", "pending", "cancelled"):
        return po.get("status", "unknown") if po else "unknown"
    all_lines = po.get("lines", [])
    fully_received = all(l["received_quantity"] >= l["quantity"] for l in all_lines)
    any_received = any(l["received_quantity"] > 0 for l in all_lines)
    new_status = "received" if fully_received else ("partial" if any_received else po["status"])
    if new_status != po["status"]:
        await db[COL_PURCHASE_ORDERS].update_one(
            {"_id": po_id}, {"$set": {"status": new_status, "updated_at": now()}}
        )
    return new_status


def line_net_unit_price(line: dict[str, Any]) -> float:
    return r2(line.get("unit_price", 0) * (1 - line.get("discount_pct", 0) / 100))
