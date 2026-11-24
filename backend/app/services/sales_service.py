"""Cycle de VENTES complet : devis → commande → bon de livraison →
facture client → règlement.

Règles clés :
  • Toutes les transitions passent par des machines à états explicites ;
  • Le stock n'est décrémenté QUE lors de la VALIDATION d'un bon de
    livraison (jamais à la création d'un brouillon), via le service de
    mouvements atomiques (survente impossible) ;
  • La facturation est bornée par les quantités LIVRÉES — impossible de
    facturer deux fois les mêmes quantités (bornes atomiques + version) ;
  • Les documents validés sont immuables (correction = annulation explicite,
    tracée dans le journal d'audit).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import (
    COL_CUSTOMERS,
    COL_CUSTOMER_INVOICES,
    COL_DELIVERY_NOTES,
    COL_SALES_ORDERS,
    COL_SALES_QUOTATIONS,
    COL_STOCK_ITEMS,
    COL_WAREHOUSES,
    new_id,
    now,
)
from app.schemas.base import serialize, serialize_many
from app.schemas.commercial import (
    CustomerCreate,
    CustomerInvoiceOut,
    CustomerOut,
    CustomerUpdate,
    DeliveryNoteCreate,
    DeliveryNoteOut,
    SalesOrderCreate,
    SalesOrderOut,
    SalesQuotationCreate,
    SalesQuotationOut,
    SalesQuotationUpdate,
)
from app.services.audit import log_action
from app.services.commercial import (
    build_lines,
    check_transition,
    compute_overdue,
    compute_totals,
    history_entry,
    push_history,
    r2,
    transition_doc,
)
from app.services.company_service import get_commercial_defaults
from app.services.sequences import next_number
from app.services.stock_service import apply_movement

MAX_ATTEMPTS = 8

QUOTE_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent", "cancelled"},
    "sent": {"accepted", "rejected"},
    "accepted": set(),
    "rejected": set(),
    "cancelled": set(),
}
ORDER_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"confirmed", "cancelled"},
    "confirmed": {"cancelled"},
    "partial": set(),   # piloté par les bons de livraison
    "delivered": set(),
    "cancelled": set(),
}
DELIVERY_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"validated", "cancelled"},
    "validated": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}
INVOICE_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"validated", "cancelled"},
    "validated": set(),   # → partial / paid piloté par les règlements
    "partial": set(),
    "paid": set(),
    "cancelled": set(),
}

_DELIVERABLE_ORDER_STATUSES = ("confirmed", "partial", "delivered")
_PAYABLE_STATUSES = ("validated", "partial")


def _user_name(user: dict[str, Any]) -> str:
    return f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get("email", "")


# ── Clients ──────────────────────────────────────────────────


async def list_customers(
    db: AsyncDatabase[dict[str, Any]],
    *,
    search: str | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if not include_inactive:
        filters["is_active"] = True
    if search:
        filters["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"code": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    cursor = db[COL_CUSTOMERS].find(filters).sort("name", 1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_CUSTOMERS].count_documents(filters)
    return {"items": serialize_many(CustomerOut, items), "total": total, "skip": skip, "limit": limit}


async def get_customer(db: AsyncDatabase[dict[str, Any]], customer_id: str) -> dict[str, Any]:
    doc = await db[COL_CUSTOMERS].find_one({"_id": customer_id})
    if not doc:
        raise not_found("Client", customer_id)
    return serialize(CustomerOut, doc)


async def create_customer(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    data = CustomerCreate(**payload).model_dump()
    code = await next_number(db, "customer", with_year=False)
    doc = {
        "_id": new_id("cus"),
        **data,
        "code": code,
        "is_active": True,
        "created_at": now(),
        "updated_at": now(),
    }
    await db[COL_CUSTOMERS].insert_one(doc)
    await log_action(db, action="customer.created", entity_type="customer", entity_id=doc["_id"], user=user)
    return serialize(CustomerOut, doc)


async def update_customer(
    db: AsyncDatabase[dict[str, Any]], customer_id: str, fields: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    data = CustomerUpdate(**fields).model_dump(exclude_unset=True, exclude_none=True)
    if not data:
        return await get_customer(db, customer_id)
    doc = await db[COL_CUSTOMERS].find_one_and_update(
        {"_id": customer_id}, {"$set": {**data, "updated_at": now()}}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise not_found("Client", customer_id)
    await log_action(db, action="customer.updated", entity_type="customer", entity_id=customer_id,
                     user=user, details={"fields": sorted(data)})
    return serialize(CustomerOut, doc)


async def _customer_snapshot(db: AsyncDatabase[dict[str, Any]], customer_id: str) -> dict[str, Any]:
    customer = await db[COL_CUSTOMERS].find_one({"_id": customer_id})
    if not customer:
        raise not_found("Client", customer_id)
    return {
        "name": customer.get("name", ""),
        "code": customer.get("code", ""),
        "address": customer.get("address", ""),
        "city": customer.get("city", ""),
        "country": customer.get("country", ""),
        "tax_id": customer.get("tax_id", ""),
        "phone": customer.get("phone", ""),
        "email": customer.get("email", ""),
    }


async def _customer_name(db: AsyncDatabase[dict[str, Any]], customer_id: str) -> str:
    customer = await db[COL_CUSTOMERS].find_one({"_id": customer_id}, projection=None)
    if not customer:
        raise not_found("Client", customer_id)
    return customer.get("name", "")


# ── Devis clients ────────────────────────────────────────────


async def list_sales_quotations(
    db: AsyncDatabase[dict[str, Any]],
    *,
    status: str | None = None,
    customer_id: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if customer_id:
        filters["customer_id"] = customer_id
    if search:
        filters["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                          {"customer_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_SALES_QUOTATIONS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_SALES_QUOTATIONS].count_documents(filters)
    return {"items": serialize_many(SalesQuotationOut, items), "total": total, "skip": skip, "limit": limit}


async def get_sales_quotation(db: AsyncDatabase[dict[str, Any]], quotation_id: str) -> dict[str, Any]:
    doc = await db[COL_SALES_QUOTATIONS].find_one({"_id": quotation_id})
    if not doc:
        raise not_found("Devis", quotation_id)
    return serialize(SalesQuotationOut, doc)


async def create_sales_quotation(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    data = SalesQuotationCreate(**payload).model_dump()
    defaults = await get_commercial_defaults(db)
    customer_name = await _customer_name(db, data["customer_id"])
    snapshot = await _customer_snapshot(db, data["customer_id"])
    lines, totals = await build_lines(db, data["lines"], default_tax_rate=defaults["default_tax_rate"])
    number = await next_number(db, "sales_quotation")
    doc = {
        "_id": new_id("sq"),
        "number": number,
        "status": "draft",
        "customer_id": data["customer_id"],
        "customer_name": customer_name,
        "customer_snapshot": snapshot,
        "date": data.get("date") or now(),
        "valid_until": data.get("valid_until"),
        "lines": lines,
        "totals": totals,
        "currency": defaults["currency"],
        "notes": data.get("notes") or "",
        "terms": data.get("terms") or "",
        "sales_order_id": None,
        "sales_order_number": None,
        "created_by": user["id"],
        "created_by_name": _user_name(user),
        "created_at": now(),
        "updated_at": now(),
        "history": [history_entry(user, "created", f"Devis {number}")],
    }
    await db[COL_SALES_QUOTATIONS].insert_one(doc)
    await log_action(db, action="quotation.created", entity_type="sales_quotation", entity_id=doc["_id"], user=user)
    return serialize(SalesQuotationOut, doc)


async def update_sales_quotation(
    db: AsyncDatabase[dict[str, Any]], quotation_id: str, fields: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SALES_QUOTATIONS].find_one({"_id": quotation_id})
    if not doc:
        raise not_found("Devis", quotation_id)
    if doc["status"] != "draft":
        raise DomainError(409, "not_editable", "Seul un devis en brouillon peut être modifié.")
    data = SalesQuotationUpdate(**fields).model_dump(exclude_unset=True)
    update: dict[str, Any] = {"updated_at": now()}
    if data.get("lines") is not None:
        defaults = await get_commercial_defaults(db)
        lines, totals = await build_lines(db, data["lines"], default_tax_rate=defaults["default_tax_rate"])
        update["lines"] = lines
        update["totals"] = totals
    for key in ("valid_until", "notes", "terms"):
        if key in data:
            update[key] = data[key]
    updated = await db[COL_SALES_QUOTATIONS].find_one_and_update(
        {"_id": quotation_id, "status": "draft"}, {"$set": update}, return_document=ReturnDocument.AFTER
    )
    if not updated:
        raise DomainError(409, "doc_modified", "Devis modifié concurrentement — rechargez.")
    await push_history(db, COL_SALES_QUOTATIONS, quotation_id, history_entry(user, "updated", "Brouillon modifié"))
    return serialize(SalesQuotationOut, updated)


async def transition_quotation(
    db: AsyncDatabase[dict[str, Any]], quotation_id: str, target: str, user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SALES_QUOTATIONS].find_one({"_id": quotation_id})
    if not doc:
        raise not_found("Devis", quotation_id)
    check_transition(doc["status"], target, QUOTE_TRANSITIONS, "devis")
    updated = await transition_doc(db, COL_SALES_QUOTATIONS, quotation_id,
                                   current_status=doc["status"], target=target)
    await push_history(db, COL_SALES_QUOTATIONS, quotation_id, history_entry(user, f"status:{target}"))
    await log_action(db, action=f"quotation.{target}", entity_type="sales_quotation",
                     entity_id=quotation_id, user=user, details={"number": doc.get("number")})
    return serialize(SalesQuotationOut, updated)


async def convert_quotation_to_order(
    db: AsyncDatabase[dict[str, Any]], quotation_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    """Convertit un devis ACCEPTÉ en commande client — lignes préservées,
    référence du devis conservée (aucune ressaisie)."""
    quote = await db[COL_SALES_QUOTATIONS].find_one({"_id": quotation_id})
    if not quote:
        raise not_found("Devis", quotation_id)
    if quote["status"] != "accepted":
        raise DomainError(409, "quotation_not_accepted",
                          "Seul un devis accepté peut être converti en commande.")
    if quote.get("sales_order_id"):
        raise DomainError(409, "already_converted",
                          f"Devis déjà converti (commande {quote['sales_order_number']}).")

    raw_lines = [
        {"product_id": l["product_id"], "quantity": l["quantity"], "unit_price": l["unit_price"],
         "discount_pct": l["discount_pct"], "tax_rate": l["tax_rate"]}
        for l in quote["lines"]
    ]
    order = await create_sales_order(
        db,
        SalesOrderCreate(
            customer_id=quote["customer_id"],
            lines=[],
            quotation_id=quote["_id"],
            delivery_address=quote.get("customer_snapshot", {}).get("address", ""),
            delivery_city=quote.get("customer_snapshot", {}).get("city", ""),
            notes=f"Commande issue du devis {quote['number']}.",
        ).model_dump(),
        user,
        raw_lines_override=raw_lines,
        quotation_number=quote["number"],
    )
    await db[COL_SALES_QUOTATIONS].update_one(
        {"_id": quotation_id},
        {"$set": {"sales_order_id": order["id"], "sales_order_number": order["number"], "updated_at": now()}},
    )
    await push_history(db, COL_SALES_QUOTATIONS, quotation_id,
                       history_entry(user, "converted", f"Commande {order['number']}"))
    await log_action(db, action="quotation.converted", entity_type="sales_quotation",
                     entity_id=quotation_id, user=user, details={"order": order["number"]})
    return order


# ── Commandes clients ────────────────────────────────────────


async def list_sales_orders(
    db: AsyncDatabase[dict[str, Any]],
    *,
    status: str | None = None,
    customer_id: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if customer_id:
        filters["customer_id"] = customer_id
    if search:
        filters["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                          {"customer_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_SALES_ORDERS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_SALES_ORDERS].count_documents(filters)
    return {"items": serialize_many(SalesOrderOut, items), "total": total, "skip": skip, "limit": limit}


async def get_sales_order(db: AsyncDatabase[dict[str, Any]], order_id: str) -> dict[str, Any]:
    doc = await db[COL_SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise not_found("Commande client", order_id)
    return serialize(SalesOrderOut, doc)


async def create_sales_order(
    db: AsyncDatabase[dict[str, Any]],
    payload: dict[str, Any],
    user: dict[str, Any],
    *,
    raw_lines_override: list[dict[str, Any]] | None = None,
    quotation_number: str | None = None,
) -> dict[str, Any]:
    data = SalesOrderCreate(**payload).model_dump()
    defaults = await get_commercial_defaults(db)
    customer_name = await _customer_name(db, data["customer_id"])
    snapshot = await _customer_snapshot(db, data["customer_id"])
    raw_lines = raw_lines_override if raw_lines_override is not None else data["lines"]
    lines, totals = await build_lines(db, raw_lines, default_tax_rate=defaults["default_tax_rate"])
    for line in lines:
        line["delivered_quantity"] = 0
        line["invoiced_quantity"] = 0
    number = await next_number(db, "sales_order")
    doc = {
        "_id": new_id("so"),
        "number": number,
        "status": "draft",
        "customer_id": data["customer_id"],
        "customer_name": customer_name,
        "customer_snapshot": snapshot,
        "quotation_id": data.get("quotation_id"),
        "quotation_number": quotation_number,
        "lines": lines,
        "totals": totals,
        "currency": defaults["currency"],
        "delivery_address": data.get("delivery_address") or "",
        "delivery_city": data.get("delivery_city") or "",
        "expected_delivery_date": data.get("expected_delivery_date"),
        "payment_terms_days": data.get("payment_terms_days") or defaults["payment_terms_days"],
        "notes": data.get("notes") or "",
        "created_by": user["id"],
        "created_by_name": _user_name(user),
        "created_at": now(),
        "updated_at": now(),
        "version": 0,
        "history": [history_entry(user, "created", f"Commande {number}")],
    }
    await db[COL_SALES_ORDERS].insert_one(doc)
    await log_action(db, action="sales_order.created", entity_type="sales_order", entity_id=doc["_id"], user=user)
    return serialize(SalesOrderOut, doc)


async def update_sales_order(
    db: AsyncDatabase[dict[str, Any]], order_id: str, fields: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise not_found("Commande client", order_id)
    if doc["status"] != "draft":
        raise DomainError(409, "not_editable", "Seule une commande en brouillon peut être modifiée.")
    data = SalesOrderCreate(**fields).model_dump(exclude_unset=True)
    update: dict[str, Any] = {"updated_at": now()}
    if data.get("lines"):
        defaults = await get_commercial_defaults(db)
        lines, totals = await build_lines(db, data["lines"], default_tax_rate=defaults["default_tax_rate"])
        for line in lines:
            line["delivered_quantity"] = 0
            line["invoiced_quantity"] = 0
        update["lines"] = lines
        update["totals"] = totals
    for key in ("delivery_address", "delivery_city", "expected_delivery_date", "payment_terms_days", "notes"):
        if key in data:
            update[key] = data[key]
    updated = await db[COL_SALES_ORDERS].find_one_and_update(
        {"_id": order_id, "status": "draft", "version": doc.get("version", 0)},
        {"$set": update, "$inc": {"version": 1}}, return_document=ReturnDocument.AFTER
    )
    if not updated:
        raise DomainError(409, "doc_modified", "Commande modifiée concurrentement — rechargez.")
    await push_history(db, COL_SALES_ORDERS, order_id, history_entry(user, "updated", "Brouillon modifié"))
    return serialize(SalesOrderOut, updated)


async def transition_sales_order(
    db: AsyncDatabase[dict[str, Any]], order_id: str, target: str, user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise not_found("Commande client", order_id)
    if target == "cancelled" and any(l.get("delivered_quantity", 0) > 0 for l in doc["lines"]):
        raise DomainError(409, "cancellation_blocked",
                          "Impossible d'annuler : des quantités ont déjà été livrées.")
    check_transition(doc["status"], target, ORDER_TRANSITIONS, "commande client")
    updated = await transition_doc(db, COL_SALES_ORDERS, order_id,
                                   current_status=doc["status"], target=target)
    await push_history(db, COL_SALES_ORDERS, order_id, history_entry(user, f"status:{target}"))
    await log_action(db, action=f"sales_order.{target}", entity_type="sales_order",
                     entity_id=order_id, user=user, details={"number": doc.get("number")})
    return serialize(SalesOrderOut, updated)


async def recompute_order_status(db: AsyncDatabase[dict[str, Any]], order_id: str) -> str:
    order = await db[COL_SALES_ORDERS].find_one({"_id": order_id})
    if not order or order["status"] in ("draft", "cancelled"):
        return order.get("status", "unknown") if order else "unknown"
    fully = all(l.get("delivered_quantity", 0) >= l["quantity"] for l in order["lines"])
    partly = any(l.get("delivered_quantity", 0) > 0 for l in order["lines"])
    status = "delivered" if fully else ("partial" if partly else order["status"])
    if status != order["status"]:
        await db[COL_SALES_ORDERS].update_one(
            {"_id": order_id}, {"$set": {"status": status, "updated_at": now()}}
        )
    return status


# ── Bons de livraison ────────────────────────────────────────


async def list_delivery_notes(
    db: AsyncDatabase[dict[str, Any]],
    *,
    status: str | None = None,
    sales_order_id: str | None = None,
    customer_id: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if sales_order_id:
        filters["sales_order_id"] = sales_order_id
    if customer_id:
        filters["customer_id"] = customer_id
    if search:
        filters["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                          {"customer_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_DELIVERY_NOTES].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_DELIVERY_NOTES].count_documents(filters)
    return {"items": serialize_many(DeliveryNoteOut, items), "total": total, "skip": skip, "limit": limit}


async def get_delivery_note(db: AsyncDatabase[dict[str, Any]], note_id: str) -> dict[str, Any]:
    doc = await db[COL_DELIVERY_NOTES].find_one({"_id": note_id})
    if not doc:
        raise not_found("Bon de livraison", note_id)
    return serialize(DeliveryNoteOut, doc)


async def _available_qty(
    db: AsyncDatabase[dict[str, Any]], product_id: str, warehouse_id: str
) -> int:
    items = await db[COL_STOCK_ITEMS].find(
        {"product_id": product_id, "warehouse_id": warehouse_id}
    ).to_list(length=None)
    return sum(int(i.get("qty", 0)) for i in items)


async def create_delivery_note(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    """BROUILLON : aucun mouvement de stock (le stock part à la VALIDATION)."""
    data = DeliveryNoteCreate(**payload).model_dump()
    order = await db[COL_SALES_ORDERS].find_one({"_id": data["sales_order_id"]})
    if not order:
        raise not_found("Commande client", data["sales_order_id"])
    if order["status"] not in _DELIVERABLE_ORDER_STATUSES:
        raise DomainError(409, "order_not_deliverable",
                          f"Livraison impossible : la commande est au statut {order['status']}.")
    if not data["lines"]:
        raise DomainError(422, "empty_lines", "Aucune ligne à livrer.")

    warehouse = await db[COL_WAREHOUSES].find_one({"_id": data["warehouse_id"]})
    if not warehouse:
        raise not_found("Entrepôt", data["warehouse_id"])

    dn_lines: list[dict[str, Any]] = []
    for raw in data["lines"]:
        order_line = next((l for l in order["lines"] if l["id"] == raw["line_id"]), None)
        if not order_line:
            raise not_found("Ligne de commande", raw["line_id"])
        qty = int(raw["quantity"])
        if qty <= 0:
            raise DomainError(422, "invalid_quantity", "Quantité livrée doit être positive.")
        remaining = order_line["quantity"] - order_line.get("delivered_quantity", 0)
        if qty > remaining:
            raise DomainError(409, "over_delivery",
                              f"Livraison excédentaire : {remaining} unité(s) restante(s) sur {order_line['sku']}.")
        dn_lines.append({
            "id": new_id("dnl"),
            "order_line_id": order_line["id"],
            "product_id": order_line["product_id"],
            "sku": order_line["sku"],
            "name": order_line["name"],
            "unit": order_line["unit"],
            "quantity": qty,
            "ordered_quantity": order_line["quantity"],
            "delivered_on_order": order_line.get("delivered_quantity", 0),
            "warehouse_id": data["warehouse_id"],
            "warehouse_name": warehouse.get("name", ""),
            "location_id": data.get("location_id"),
        })

    number = await next_number(db, "delivery_note")
    doc = {
        "_id": new_id("dn"),
        "number": number,
        "status": "draft",
        "sales_order_id": order["_id"],
        "sales_order_number": order["number"],
        "customer_id": order["customer_id"],
        "customer_name": order["customer_name"],
        "customer_snapshot": order.get("customer_snapshot", {}),
        "lines": dn_lines,
        "delivery_address": data.get("delivery_address") or order.get("delivery_address", ""),
        "delivery_city": data.get("delivery_city") or order.get("delivery_city", ""),
        "delivery_date": data.get("delivery_date") or now(),
        "driver": data.get("driver") or "",
        "signature_name": data.get("signature_name") or "",
        "notes": data.get("notes") or "",
        "movement_ids": [],
        "created_by": user["id"],
        "created_by_name": _user_name(user),
        "created_at": now(),
        "validated_at": None,
        "history": [history_entry(user, "created", f"BL {number} (brouillon)")],
    }
    await db[COL_DELIVERY_NOTES].insert_one(doc)
    await log_action(db, action="delivery_note.created", entity_type="delivery_note",
                     entity_id=doc["_id"], user=user, details={"number": number})
    return serialize(DeliveryNoteOut, doc)


async def _bump_order_lines(
    db: AsyncDatabase[dict[str, Any]],
    order_id: str,
    updates: list[tuple[str, str, int]],  # (line_id, field, qty signée)
    *,
    bound_field: str,
    rollback: bool = False,
) -> None:
    """Incrémente/décrémente des compteurs de lignes de commande avec
    condition de version (concurrence optimiste) et bornes métier.
    Quantités signées : négatif = libération de réservation."""
    applied: list[tuple[str, str, int]] = []
    try:
        for line_id, field, qty in updates:
            if qty == 0:
                continue
            for _ in range(MAX_ATTEMPTS):
                order = await db[COL_SALES_ORDERS].find_one({"_id": order_id})
                if not order:
                    raise not_found("Commande client", order_id)
                idx = next((i for i, l in enumerate(order["lines"]) if l["id"] == line_id), None)
                if idx is None:
                    raise not_found("Ligne de commande", line_id)
                line = order["lines"][idx]
                current = int(line.get(field, 0))
                if rollback:
                    new_value = current - qty  # annule exactement l'effet appliqué
                    if new_value < 0:
                        new_value = 0
                elif qty > 0:
                    bound = int(line.get(bound_field, 0))
                    if current + qty > bound:
                        raise DomainError(
                            409, "over_limit",
                            f"Quantité dépassée pour {line['sku']} ({bound_field}).")
                    new_value = current + qty
                else:
                    new_value = current + qty
                    if new_value < 0:
                        raise DomainError(
                            409, "under_limit",
                            f"Libération impossible pour {line['sku']} (compteur à {current}).")
                lines = [dict(l) for l in order["lines"]]
                lines[idx][field] = new_value
                updated = await db[COL_SALES_ORDERS].find_one_and_update(
                    {"_id": order_id, "version": int(order.get("version", 0))},
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
            await _bump_order_lines(db, order_id, applied, bound_field=bound_field, rollback=True)
        raise


async def validate_delivery_note(
    db: AsyncDatabase[dict[str, Any]], note_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    """VALIDATION = sortie de stock réelle + mise à jour de la commande."""
    doc = await db[COL_DELIVERY_NOTES].find_one({"_id": note_id})
    if not doc:
        raise not_found("Bon de livraison", note_id)
    if doc["status"] != "draft":
        raise DomainError(409, "invalid_transition",
                          f"Transition bon de livraison {doc['status']} → validated interdite.")

    order = await db[COL_SALES_ORDERS].find_one({"_id": doc["sales_order_id"]})
    if not order:
        raise not_found("Commande client", doc["sales_order_id"])

    # 1) Pré-vérifications (bornes commande + disponibilité stock).
    for line in doc["lines"]:
        order_line = next((l for l in order["lines"] if l["id"] == line["order_line_id"]), None)
        if not order_line:
            raise not_found("Ligne de commande", line["order_line_id"])
        remaining = order_line["quantity"] - order_line.get("delivered_quantity", 0)
        if line["quantity"] > remaining:
            raise DomainError(409, "over_delivery",
                              f"Reste {remaining} unité(s) à livrer sur {line['sku']}.")
        available = await _available_qty(db, line["product_id"], line["warehouse_id"])
        if available < line["quantity"]:
            raise DomainError(
                409, "insufficient_stock",
                f"Stock insuffisant pour {line['sku']} ({available} disponible(s), "
                f"{line['quantity']} demandé(s)) — validation refusée.")

    # 2) Sorties de stock (journal immuable + update atomique).
    movement_ids: list[str] = []
    try:
        for line in doc["lines"]:
            movement = await apply_movement(
                db,
                product_id=line["product_id"],
                warehouse_id=line["warehouse_id"],
                mtype="out",
                quantity=line["quantity"],
                reason=f"Livraison {doc['number']} ({doc['sales_order_number']})",
                user=user,
                location_id=line.get("location_id"),
                reference=doc["sales_order_id"],
            )
            movement_ids.append(movement["id"])
    except Exception:
        # Compensation : ré-entrée des quantités déjà sorties (mouvements tracés).
        for line, mid in zip(doc["lines"], movement_ids):
            await apply_movement(
                db,
                product_id=line["product_id"],
                warehouse_id=line["warehouse_id"],
                mtype="in",
                quantity=line["quantity"],
                reason=f"Compensation BL {doc['number']} (échec validation)",
                user=user,
                location_id=line.get("location_id"),
                reference=doc["_id"],
            )
        raise

    # 3) Mise à jour bornée des quantités livrées de la commande.
    await _bump_order_lines(
        db, doc["sales_order_id"],
        [(l["order_line_id"], "delivered_quantity", l["quantity"]) for l in doc["lines"]],
        bound_field="quantity",
    )
    await recompute_order_status(db, doc["sales_order_id"])

    updated = await transition_doc(
        db, COL_DELIVERY_NOTES, note_id,
        current_status="draft", target="validated",
        extra_set={"movement_ids": movement_ids, "validated_at": now()},
    )
    await push_history(db, COL_DELIVERY_NOTES, note_id,
                       history_entry(user, "validated", f"{len(movement_ids)} mouvement(s) de stock"))
    await log_action(db, action="delivery_note.validated", entity_type="delivery_note",
                     entity_id=note_id, user=user,
                     details={"number": doc["number"], "movements": len(movement_ids)})
    return serialize(DeliveryNoteOut, updated)


async def transition_delivery_note(
    db: AsyncDatabase[dict[str, Any]], note_id: str, target: str, user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_DELIVERY_NOTES].find_one({"_id": note_id})
    if not doc:
        raise not_found("Bon de livraison", note_id)
    check_transition(doc["status"], target, DELIVERY_TRANSITIONS, "bon de livraison")
    updated = await transition_doc(db, COL_DELIVERY_NOTES, note_id,
                                   current_status=doc["status"], target=target)
    await push_history(db, COL_DELIVERY_NOTES, note_id, history_entry(user, f"status:{target}"))
    await log_action(db, action=f"delivery_note.{target}", entity_type="delivery_note",
                     entity_id=note_id, user=user, details={"number": doc.get("number")})
    return serialize(DeliveryNoteOut, updated)


# ── Factures clients ─────────────────────────────────────────


async def list_customer_invoices(
    db: AsyncDatabase[dict[str, Any]],
    *,
    status: str | None = None,
    customer_id: str | None = None,
    sales_order_id: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if customer_id:
        filters["customer_id"] = customer_id
    if sales_order_id:
        filters["sales_order_id"] = sales_order_id
    if search:
        filters["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                          {"customer_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_CUSTOMER_INVOICES].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    result = []
    for doc in items:
        doc["overdue"] = compute_overdue(doc)
        result.append(doc)
    total = await db[COL_CUSTOMER_INVOICES].count_documents(filters)
    return {"items": serialize_many(CustomerInvoiceOut, result), "total": total, "skip": skip, "limit": limit}


async def get_customer_invoice(db: AsyncDatabase[dict[str, Any]], invoice_id: str) -> dict[str, Any]:
    doc = await db[COL_CUSTOMER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture client", invoice_id)
    doc["overdue"] = compute_overdue(doc)
    return serialize(CustomerInvoiceOut, doc)


async def generate_invoice_from_order(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    """Génère une facture BROUILLON à partir des quantités LIVRÉES non
    encore facturées. Les bornes sont verrouillées à la VALIDATION."""
    order_id = payload.get("sales_order_id")
    order = await db[COL_SALES_ORDERS].find_one({"_id": order_id})
    if not order:
        raise not_found("Commande client", order_id)
    if order["status"] not in _DELIVERABLE_ORDER_STATUSES:
        raise DomainError(409, "order_not_invoiceable",
                          f"Facturation impossible : la commande est au statut {order['status']}.")
    defaults = await get_commercial_defaults(db)

    requested = {l["line_id"]: int(l["quantity"]) for l in (payload.get("lines") or [])}
    raw_lines: list[dict[str, Any]] = []
    order_line_ids: list[str] = []
    for order_line in order["lines"]:
        invoiceable = order_line.get("delivered_quantity", 0) - order_line.get("invoiced_quantity", 0)
        qty = requested.get(order_line["id"], invoiceable)
        if qty <= 0:
            continue
        if qty > invoiceable:
            raise DomainError(
                409, "over_invoicing",
                f"Facturation excédentaire sur {order_line['sku']} : "
                f"{invoiceable} unité(s) livrée(s) non facturée(s).")
        raw_lines.append({
            "product_id": order_line["product_id"], "quantity": qty,
            "unit_price": order_line["unit_price"],
            "discount_pct": order_line["discount_pct"], "tax_rate": order_line["tax_rate"],
        })
        order_line_ids.append(order_line["id"])
    if not raw_lines:
        raise DomainError(409, "nothing_to_invoice",
                          "Aucune quantité livrée à facturer sur cette commande.")

    lines, totals = await build_lines(db, raw_lines, default_tax_rate=defaults["default_tax_rate"])
    for line, order_line_id in zip(lines, order_line_ids):
        line["order_line_id"] = order_line_id
    # RÉSERVATION atomique des quantités (anti-doublon dès le brouillon) —
    # libérée automatiquement si l'écriture échoue ou à l'annulation.
    await _bump_order_lines(
        db, order["_id"],
        [(oid, "invoiced_quantity", l["quantity"]) for oid, l in zip(order_line_ids, lines)],
        bound_field="delivered_quantity",
    )
    notes_docs = await db[COL_DELIVERY_NOTES].find(
        {"sales_order_id": order["_id"], "status": {"$in": ["validated", "delivered"]}}
    ).to_list(length=None)

    quotation = None
    if order.get("quotation_id"):
        quotation = await db[COL_SALES_QUOTATIONS].find_one({"_id": order["quotation_id"]})
    number = await next_number(db, "customer_invoice")
    doc = {
        "_id": new_id("inv"),
        "number": number,
        "status": "draft",
        "customer_id": order["customer_id"],
        "customer_name": order["customer_name"],
        "customer_snapshot": order.get("customer_snapshot", {}),
        "quotation_id": order.get("quotation_id"),
        "quotation_number": (quotation or {}).get("number"),
        "sales_order_id": order["_id"],
        "sales_order_number": order["number"],
        "delivery_note_ids": [d["_id"] for d in notes_docs],
        "delivery_note_numbers": [d["number"] for d in notes_docs],
        "lines": lines,
        "totals": totals,
        "currency": order.get("currency", defaults["currency"]),
        "amount_paid": 0,
        "balance_due": totals["total_ttc"],
        "payment_terms_days": order.get("payment_terms_days", defaults["payment_terms_days"]),
        "due_date": None,
        "overdue": False,
        "notes": payload.get("notes") or "",
        "created_by": user["id"],
        "created_by_name": _user_name(user),
        "created_at": now(),
        "validated_at": None,
        "history": [history_entry(user, "created", f"Facture {number} (brouillon)")],
    }
    await db[COL_CUSTOMER_INVOICES].insert_one(doc)
    await log_action(db, action="invoice.generated", entity_type="customer_invoice",
                     entity_id=doc["_id"], user=user,
                     details={"number": number, "order": order["number"]})
    return serialize(CustomerInvoiceOut, doc)


async def update_invoice_draft(
    db: AsyncDatabase[dict[str, Any]], invoice_id: str, lines: list[dict[str, Any]],
    notes: str | None, user: dict[str, Any],
) -> dict[str, Any]:
    doc = await db[COL_CUSTOMER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture client", invoice_id)
    if doc["status"] != "draft":
        raise DomainError(409, "not_editable", "Seule une facture en brouillon peut être modifiée.")
    if not doc.get("sales_order_id"):
        raise DomainError(409, "not_editable", "Facture sans commande d'origine non modifiable.")
    defaults = await get_commercial_defaults(db)
    built_lines, totals = await build_lines(db, lines, default_tax_rate=defaults["default_tax_rate"])

    # Ajustement des réservations (deltas par ligne de commande) :
    old_by_line: dict[str, int] = {}
    for line in doc["lines"]:
        olid = line.get("order_line_id")
        if olid:
            old_by_line[olid] = old_by_line.get(olid, 0) + int(line["quantity"])
    new_by_line: dict[str, int] = {}
    order = await db[COL_SALES_ORDERS].find_one({"_id": doc["sales_order_id"]})
    if not order:
        raise not_found("Commande client", doc["sales_order_id"])
    line_by_product = {l["product_id"]: l for l in built_lines}
    for order_line in order["lines"]:
        inv_line = line_by_product.get(order_line["product_id"])
        new_qty = int(inv_line["quantity"]) if inv_line else 0
        old_qty = old_by_line.pop(order_line["id"], 0)
        delta = new_qty - old_qty
        if delta:
            await _bump_order_lines(
                db, order["_id"], [(order_line["id"], "invoiced_quantity", delta)],
                bound_field="delivered_quantity")
    for olid, old_qty in old_by_line.items():  # lignes supprimées du brouillon
        if old_qty:
            await _bump_order_lines(
                db, order["_id"], [(olid, "invoiced_quantity", -old_qty)],
                bound_field="delivered_quantity")
    for line in built_lines:
        olid = next((ol["id"] for ol in order["lines"] if ol["product_id"] == line["product_id"]), None)
        line["order_line_id"] = olid

    update: dict[str, Any] = {"lines": built_lines, "totals": totals,
                              "balance_due": totals["total_ttc"], "updated_at": now()}
    if notes is not None:
        update["notes"] = notes
    updated = await db[COL_CUSTOMER_INVOICES].find_one_and_update(
        {"_id": invoice_id, "status": "draft"}, {"$set": update}, return_document=ReturnDocument.AFTER
    )
    if not updated:
        raise DomainError(409, "doc_modified", "Facture modifiée concurrentement — rechargez.")
    await push_history(db, COL_CUSTOMER_INVOICES, invoice_id, history_entry(user, "updated", "Brouillon modifié"))
    return serialize(CustomerInvoiceOut, updated)


async def validate_invoice(
    db: AsyncDatabase[dict[str, Any]], invoice_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    """Validation : verrouille le contenu (les quantités étaient déjà
    réservées à la génération — anti-doublon) et fixe l'échéance."""
    doc = await db[COL_CUSTOMER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture client", invoice_id)
    if doc["status"] != "draft":
        raise DomainError(409, "invalid_transition",
                          f"Transition facture {doc['status']} → validated interdite.")

    due_date = now() + timedelta(days=int(doc.get("payment_terms_days", 30)))
    updated = await transition_doc(
        db, COL_CUSTOMER_INVOICES, invoice_id,
        current_status="draft", target="validated",
        extra_set={"validated_at": now(), "due_date": due_date},
    )
    await push_history(db, COL_CUSTOMER_INVOICES, invoice_id, history_entry(user, "validated",
                       f"Échéance {due_date.date().isoformat()}"))
    await log_action(db, action="invoice.validated", entity_type="customer_invoice",
                     entity_id=invoice_id, user=user, details={"number": doc["number"]})
    return serialize(CustomerInvoiceOut, updated)


async def cancel_customer_invoice(
    db: AsyncDatabase[dict[str, Any]], invoice_id: str, user: dict[str, Any], notes: str | None = None
) -> dict[str, Any]:
    doc = await db[COL_CUSTOMER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture client", invoice_id)
    if doc["status"] != "draft":
        raise DomainError(409, "cancellation_blocked",
                          "Seule une facture en brouillon peut être annulée. "
                          "Pour une facture validée, suivez le workflow de correction (avoir).")
    check_transition(doc["status"], "cancelled", INVOICE_TRANSITIONS, "facture client")
    # Libération des réservations de quantités (brouillon annulé).
    if doc.get("sales_order_id"):
        releases = [(l.get("order_line_id"), "invoiced_quantity", int(l["quantity"]))
                    for l in doc["lines"] if l.get("order_line_id")]
        if releases:
            await _bump_order_lines(db, doc["sales_order_id"], releases,
                                    bound_field="delivered_quantity", rollback=True)
    updated = await transition_doc(db, COL_CUSTOMER_INVOICES, invoice_id,
                                   current_status="draft", target="cancelled")
    await push_history(db, COL_CUSTOMER_INVOICES, invoice_id,
                       history_entry(user, "cancelled", notes or ""))
    await log_action(db, action="invoice.cancelled", entity_type="customer_invoice",
                     entity_id=invoice_id, user=user, details={"number": doc["number"]})
    return serialize(CustomerInvoiceOut, updated)
