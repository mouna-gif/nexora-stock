"""Cycle d'ACHATS complet : devis fournisseur → commande d'achat →
bon de réception → facture fournisseur → règlement.

Règles clés :
  • Le stock n'est incrémenté QUE lors de la VALIDATION d'un bon de
    réception (jamais au brouillon), via mouvements atomiques ;
  • Quantités reçues / facturées bornées ATOMIQUEMENT (condition de
    version sur la commande) — sur-réception et sur-facturation
    impossibles, aucun traitement dupliqué ;
  • Écarts commandé / reçu / facturé détectés et consignés.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import (
    COL_GOODS_RECEIPTS,
    COL_PURCHASE_ORDERS,
    COL_SUPPLIERS,
    COL_SUPPLIER_INVOICES,
    COL_SUPPLIER_QUOTATIONS,
    new_id,
    now,
)
from app.schemas.base import serialize, serialize_many
from app.schemas.commercial import (
    SupplierInvoiceOut,
    SupplierQuotationCreate,
    SupplierQuotationOut,
    SupplierQuotationUpdate,
)
from app.services.audit import log_action
from app.services.commercial import (
    build_lines,
    check_transition,
    compute_overdue,
    history_entry,
    push_history,
    r2,
    transition_doc,
)
from app.services.company_service import get_commercial_defaults
from app.services.payments import register_payment, _recompute_invoice_status  # noqa: F401
from app.services.po_service import bump_po_lines, create_purchase_order
from app.services.sequences import next_number

SQ_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"received", "cancelled"},
    "received": {"accepted", "rejected"},
    "accepted": set(),
    "rejected": set(),
    "cancelled": set(),
}
SINVOICE_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"validated", "cancelled"},
    "validated": set(),
    "partial": set(),
    "paid": set(),
    "cancelled": set(),
}

_RECEIVABLE_PO_STATUSES = ("approved", "ordered", "partial")
_INVOICEABLE_PO_STATUSES = ("ordered", "partial", "received")


def _user_name(user: dict[str, Any]) -> str:
    return f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get("email", "")


# ── Devis fournisseurs ───────────────────────────────────────


async def list_supplier_quotations(
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
        filters["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                          {"supplier_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_SUPPLIER_QUOTATIONS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_SUPPLIER_QUOTATIONS].count_documents(filters)
    return {"items": serialize_many(SupplierQuotationOut, items), "total": total, "skip": skip, "limit": limit}


async def get_supplier_quotation(db: AsyncDatabase[dict[str, Any]], quotation_id: str) -> dict[str, Any]:
    doc = await db[COL_SUPPLIER_QUOTATIONS].find_one({"_id": quotation_id})
    if not doc:
        raise not_found("Devis fournisseur", quotation_id)
    return serialize(SupplierQuotationOut, doc)


async def create_supplier_quotation(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    data = SupplierQuotationCreate(**payload).model_dump()
    supplier = await db[COL_SUPPLIERS].find_one({"_id": data["supplier_id"]})
    if not supplier:
        raise not_found("Fournisseur", data["supplier_id"])
    defaults = await get_commercial_defaults(db)
    lines, totals = await build_lines(db, data["lines"], default_tax_rate=defaults["default_tax_rate"],
                                      price_field="cost_price")
    number = await next_number(db, "supplier_quotation")
    doc = {
        "_id": new_id("sqr"),
        "number": number,
        "status": "draft",
        "supplier_id": data["supplier_id"],
        "supplier_name": supplier.get("name", ""),
        "lines": lines,
        "totals": totals,
        "delivery_cost": r2(data.get("delivery_cost")),
        "lead_time_days": int(data.get("lead_time_days") or 0),
        "valid_until": data.get("valid_until"),
        "currency": defaults["currency"],
        "notes": data.get("notes") or "",
        "purchase_order_id": None,
        "purchase_order_number": None,
        "created_by": user["id"],
        "created_by_name": _user_name(user),
        "created_at": now(),
        "updated_at": now(),
        "history": [history_entry(user, "created", f"Devis fournisseur {number}")],
    }
    await db[COL_SUPPLIER_QUOTATIONS].insert_one(doc)
    await log_action(db, action="supplier_quotation.created", entity_type="supplier_quotation",
                     entity_id=doc["_id"], user=user, details={"number": number})
    return serialize(SupplierQuotationOut, doc)


async def update_supplier_quotation(
    db: AsyncDatabase[dict[str, Any]], quotation_id: str, fields: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SUPPLIER_QUOTATIONS].find_one({"_id": quotation_id})
    if not doc:
        raise not_found("Devis fournisseur", quotation_id)
    if doc["status"] != "draft":
        raise DomainError(409, "not_editable", "Seul un devis fournisseur en brouillon peut être modifié.")
    data = SupplierQuotationUpdate(**fields).model_dump(exclude_unset=True)
    update: dict[str, Any] = {"updated_at": now()}
    if data.get("lines") is not None:
        defaults = await get_commercial_defaults(db)
        lines, totals = await build_lines(db, data["lines"], default_tax_rate=defaults["default_tax_rate"],
                                          price_field="cost_price")
        update["lines"] = lines
        update["totals"] = totals
    for key in ("delivery_cost", "lead_time_days", "valid_until", "notes"):
        if key in data:
            update[key] = data[key]
    updated = await db[COL_SUPPLIER_QUOTATIONS].find_one_and_update(
        {"_id": quotation_id, "status": "draft"}, {"$set": update}, return_document=ReturnDocument.AFTER
    )
    if not updated:
        raise DomainError(409, "doc_modified", "Devis modifié concurrentement — rechargez.")
    await push_history(db, COL_SUPPLIER_QUOTATIONS, quotation_id, history_entry(user, "updated"))
    return serialize(SupplierQuotationOut, updated)


async def transition_supplier_quotation(
    db: AsyncDatabase[dict[str, Any]], quotation_id: str, target: str, user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SUPPLIER_QUOTATIONS].find_one({"_id": quotation_id})
    if not doc:
        raise not_found("Devis fournisseur", quotation_id)
    check_transition(doc["status"], target, SQ_TRANSITIONS, "devis fournisseur")
    updated = await transition_doc(db, COL_SUPPLIER_QUOTATIONS, quotation_id,
                                   current_status=doc["status"], target=target)
    await push_history(db, COL_SUPPLIER_QUOTATIONS, quotation_id, history_entry(user, f"status:{target}"))
    await log_action(db, action=f"supplier_quotation.{target}", entity_type="supplier_quotation",
                     entity_id=quotation_id, user=user, details={"number": doc.get("number")})
    return serialize(SupplierQuotationOut, updated)


async def compare_supplier_quotations(
    db: AsyncDatabase[dict[str, Any]], product_id: str
) -> dict[str, Any]:
    """Compare les offres fournisseurs pour un produit (prix net unitaire)."""
    quotes = await db[COL_SUPPLIER_QUOTATIONS].find(
        {"status": {"$in": ["draft", "received", "accepted"]}}
    ).to_list(length=None)
    quotes = [q for q in quotes if any(l.get("product_id") == product_id for l in q.get("lines", []))]
    product = await db["products"].find_one({"_id": product_id})
    offers: list[dict[str, Any]] = []
    for quote in quotes:
        for line in quote.get("lines", []):
            if line.get("product_id") != product_id:
                continue
            offers.append({
                "supplier_quotation_id": quote["_id"],
                "number": quote["number"],
                "supplier_id": quote.get("supplier_id"),
                "supplier_name": quote.get("supplier_name", ""),
                "quantity": line.get("quantity"),
                "unit_price": line.get("unit_price"),
                "discount_pct": line.get("discount_pct", 0),
                "net_unit_price": r2(line.get("unit_price", 0) * (1 - line.get("discount_pct", 0) / 100)),
                "lead_time_days": quote.get("lead_time_days", 0),
                "status": quote.get("status"),
            })
    offers.sort(key=lambda o: o["net_unit_price"])
    return {"product_id": product_id, "product_sku": (product or {}).get("sku", ""),
            "product_name": (product or {}).get("name", ""), "offers": offers}


async def convert_supplier_quotation(
    db: AsyncDatabase[dict[str, Any]], quotation_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    """Convertit un devis fournisseur accepté en commande d'achat —
    lignes et conditions commerciales préservées."""
    quote = await db[COL_SUPPLIER_QUOTATIONS].find_one({"_id": quotation_id})
    if not quote:
        raise not_found("Devis fournisseur", quotation_id)
    if quote["status"] != "accepted":
        raise DomainError(409, "quotation_not_accepted",
                          "Seul un devis fournisseur accepté peut être converti.")
    if quote.get("purchase_order_id"):
        raise DomainError(409, "already_converted",
                          f"Devis déjà converti (commande {quote['purchase_order_number']}).")
    raw_lines = [
        {"product_id": l["product_id"], "quantity": l["quantity"], "unit_price": l["unit_price"],
         "discount_pct": l["discount_pct"], "tax_rate": l["tax_rate"]}
        for l in quote["lines"]
    ]
    po = await create_purchase_order(
        db,
        supplier_id=quote["supplier_id"],
        lines=raw_lines,
        notes=f"Commande issue du devis fournisseur {quote['number']}.",
        user=user,
        supplier_quotation_id=quote["_id"],
        supplier_quotation_number=quote["number"],
    )
    await db[COL_SUPPLIER_QUOTATIONS].update_one(
        {"_id": quotation_id},
        {"$set": {"purchase_order_id": po["id"], "purchase_order_number": po["reference"], "updated_at": now()}},
    )
    await push_history(db, COL_SUPPLIER_QUOTATIONS, quotation_id,
                       history_entry(user, "converted", f"Commande {po['reference']}"))
    await log_action(db, action="supplier_quotation.converted", entity_type="supplier_quotation",
                     entity_id=quotation_id, user=user, details={"po": po["reference"]})
    return po


# ── Factures fournisseurs ────────────────────────────────────


async def list_supplier_invoices(
    db: AsyncDatabase[dict[str, Any]],
    *,
    status: str | None = None,
    supplier_id: str | None = None,
    purchase_order_id: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status:
        filters["status"] = status
    if supplier_id:
        filters["supplier_id"] = supplier_id
    if purchase_order_id:
        filters["purchase_order_id"] = purchase_order_id
    if search:
        filters["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                          {"supplier_name": {"$regex": search, "$options": "i"}}]
    cursor = db[COL_SUPPLIER_INVOICES].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = []
    for doc in await cursor.to_list(length=limit):
        doc["overdue"] = compute_overdue(doc)
        items.append(doc)
    total = await db[COL_SUPPLIER_INVOICES].count_documents(filters)
    return {"items": serialize_many(SupplierInvoiceOut, items), "total": total, "skip": skip, "limit": limit}


async def get_supplier_invoice(db: AsyncDatabase[dict[str, Any]], invoice_id: str) -> dict[str, Any]:
    doc = await db[COL_SUPPLIER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture fournisseur", invoice_id)
    doc["overdue"] = compute_overdue(doc)
    return serialize(SupplierInvoiceOut, doc)


async def create_supplier_invoice(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    """Facture fournisseur BROUILLON, liée à une commande (quantités bornées
    par le REÇU) ou libre (achat direct)."""
    po_id = payload.get("purchase_order_id")
    supplier_id = payload.get("supplier_id")
    po = None
    if po_id:
        po = await db[COL_PURCHASE_ORDERS].find_one({"_id": po_id})
        if not po:
            raise not_found("Commande d'achat", po_id)
        if po["status"] not in _INVOICEABLE_PO_STATUSES:
            raise DomainError(409, "po_not_invoiceable",
                              f"Facturation impossible : la commande est au statut {po['status']}.")
        supplier_id = po["supplier_id"]
    supplier = await db[COL_SUPPLIERS].find_one({"_id": supplier_id})
    if not supplier:
        raise not_found("Fournisseur", supplier_id)
    defaults = await get_commercial_defaults(db)

    po_line_by_product: dict[str, dict[str, Any]] = {}
    if po:
        for line in po["lines"]:
            po_line_by_product.setdefault(line["product_id"], line)
        po_line_by_id = {line["id"]: line for line in po["lines"]}

    raw_lines: list[dict[str, Any]] = []
    provided = payload.get("lines") or []
    if po:
        if not provided:
            for line in po["lines"]:
                invoiceable = line.get("received_quantity", 0) - line.get("invoiced_quantity", 0)
                if invoiceable > 0:
                    provided.append({"product_id": line["product_id"], "quantity": invoiceable,
                                     "unit_price": line.get("unit_price"),
                                     "discount_pct": line.get("discount_pct", 0),
                                     "tax_rate": line.get("tax_rate")})
        for raw in provided:
            po_line = po_line_by_product.get(raw.get("product_id")) or po_line_by_id.get(raw.get("po_line_id"))
            if not po_line:
                raise DomainError(422, "unknown_product",
                                  f"Produit {raw.get('product_id')} absent de la commande d'achat.")
            invoiceable = po_line.get("received_quantity", 0) - po_line.get("invoiced_quantity", 0)
            qty = int(raw.get("quantity") or 0)
            if qty <= 0 or qty > invoiceable:
                raise DomainError(
                    409, "over_invoicing",
                    f"Facturation excédentaire sur {po_line['sku']} : "
                    f"{invoiceable} unité(s) reçue(s) non facturée(s).")
            raw_lines.append({
                "product_id": po_line["product_id"], "quantity": qty,
                "unit_price": raw.get("unit_price") or po_line.get("unit_price"),
                "discount_pct": raw.get("discount_pct", po_line.get("discount_pct", 0)),
                "tax_rate": raw.get("tax_rate") if raw.get("tax_rate") is not None else po_line.get("tax_rate"),
                "po_line_id": po_line["id"],
            })
        if not raw_lines:
            raise DomainError(409, "nothing_to_invoice",
                              "Aucune quantité reçue à facturer sur cette commande.")
    else:
        if not provided:
            raise DomainError(422, "empty_lines", "Aucune ligne de facture.")
        for raw in provided:
            raw_lines.append({**raw, "po_line_id": None})

    lines, totals = await build_lines(db, raw_lines, default_tax_rate=defaults["default_tax_rate"],
                                      price_field="cost_price")
    po_line_ids = [raw.get("po_line_id") for raw in raw_lines]
    for line, po_line_id in zip(lines, po_line_ids):
        line["po_line_id"] = po_line_id

    # RÉSERVATION atomique des quantités facturées (anti-doublon dès le brouillon).
    if po:
        await bump_po_lines(
            db, po["_id"],
            [(plid, "invoiced_quantity", l["quantity"])
             for plid, l in zip(po_line_ids, lines) if plid],
            bound_field="received_quantity",
        )

    grs = []
    if po:
        grs = await db[COL_GOODS_RECEIPTS].find(
            {"po_id": po["_id"], "status": "validated"}
        ).to_list(length=None)
    number = await next_number(db, "supplier_invoice")
    doc = {
        "_id": new_id("sinv"),
        "number": number,
        "status": "draft",
        "supplier_id": supplier["_id"],
        "supplier_name": supplier.get("name", ""),
        "purchase_order_id": po["_id"] if po else None,
        "purchase_order_number": po["reference"] if po else None,
        "goods_receipt_ids": [g["_id"] for g in grs],
        "goods_receipt_numbers": [g["number"] for g in grs],
        "lines": lines,
        "totals": totals,
        "currency": defaults["currency"],
        "amount_paid": 0,
        "balance_due": totals["total_ttc"],
        "due_date": None,
        "overdue": False,
        "discrepancies": [],
        "notes": payload.get("notes") or "",
        "created_by": user["id"],
        "created_by_name": _user_name(user),
        "created_at": now(),
        "validated_at": None,
        "history": [history_entry(user, "created", f"Facture fournisseur {number}")],
    }
    await db[COL_SUPPLIER_INVOICES].insert_one(doc)
    await log_action(db, action="supplier_invoice.created", entity_type="supplier_invoice",
                     entity_id=doc["_id"], user=user, details={"number": number})
    return serialize(SupplierInvoiceOut, doc)


async def validate_supplier_invoice(
    db: AsyncDatabase[dict[str, Any]], invoice_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    doc = await db[COL_SUPPLIER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture fournisseur", invoice_id)
    if doc["status"] != "draft":
        raise DomainError(409, "invalid_transition",
                          f"Transition facture fournisseur {doc['status']} → validated interdite.")
    defaults = await get_commercial_defaults(db)

    # Écarts commandé / reçu / facturé (les bornes ont été verrouillées à la création).
    discrepancies: list[dict[str, Any]] = []
    if doc.get("purchase_order_id"):
        po = await db[COL_PURCHASE_ORDERS].find_one({"_id": doc["purchase_order_id"]})
        if not po:
            raise not_found("Commande d'achat", doc["purchase_order_id"])
        for line in doc["lines"]:
            po_line = next(
                (l for l in po["lines"]
                 if l["id"] == line.get("po_line_id") or l["product_id"] == line["product_id"]),
                None,
            )
            if po_line and line["quantity"] != po_line.get("received_quantity", 0):
                discrepancies.append({
                    "sku": line["sku"], "name": line["name"],
                    "ordered": po_line.get("quantity"), "received": po_line.get("received_quantity", 0),
                    "invoiced": line["quantity"],
                    "type": "over_invoiced" if line["quantity"] > po_line.get("received_quantity", 0)
                    else "under_invoiced",
                })

    due_date = now() + timedelta(days=defaults["payment_terms_days"])
    updated = await transition_doc(
        db, COL_SUPPLIER_INVOICES, invoice_id,
        current_status="draft", target="validated",
        extra_set={"validated_at": now(), "due_date": due_date, "discrepancies": discrepancies},
    )
    await push_history(db, COL_SUPPLIER_INVOICES, invoice_id,
                       history_entry(user, "validated", f"{len(discrepancies)} écart(s) détecté(s)"))
    await log_action(db, action="supplier_invoice.validated", entity_type="supplier_invoice",
                     entity_id=invoice_id, user=user,
                     details={"number": doc["number"], "discrepancies": len(discrepancies)})
    return serialize(SupplierInvoiceOut, updated)


async def cancel_supplier_invoice(
    db: AsyncDatabase[dict[str, Any]], invoice_id: str, user: dict[str, Any], notes: str | None = None
) -> dict[str, Any]:
    doc = await db[COL_SUPPLIER_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise not_found("Facture fournisseur", invoice_id)
    if doc["status"] != "draft":
        raise DomainError(409, "cancellation_blocked",
                          "Seule une facture fournisseur en brouillon peut être annulée.")
    check_transition(doc["status"], "cancelled", SINVOICE_TRANSITIONS, "facture fournisseur")
    # Libération des réservations de quantités.
    if doc.get("purchase_order_id"):
        releases = [(l.get("po_line_id"), "invoiced_quantity", int(l["quantity"]))
                    for l in doc["lines"] if l.get("po_line_id")]
        if releases:
            await bump_po_lines(db, doc["purchase_order_id"], releases,
                                bound_field="received_quantity", rollback=True)
    updated = await transition_doc(db, COL_SUPPLIER_INVOICES, invoice_id,
                                   current_status="draft", target="cancelled")
    await push_history(db, COL_SUPPLIER_INVOICES, invoice_id, history_entry(user, "cancelled", notes or ""))
    await log_action(db, action="supplier_invoice.cancelled", entity_type="supplier_invoice",
                     entity_id=invoice_id, user=user, details={"number": doc["number"]})
    return serialize(SupplierInvoiceOut, updated)


async def pay_supplier_invoice(
    db: AsyncDatabase[dict[str, Any]], payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    return await register_payment(db, direction="supplier", payload=payload, user=user)


async def recompute_supplier_invoice_status(db: AsyncDatabase[dict[str, Any]], invoice_id: str) -> str:
    return await _recompute_invoice_status(db, "supplier", invoice_id)
