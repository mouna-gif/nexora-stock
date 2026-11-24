"""Règlements — logique partagée clients / fournisseurs.

Un règlement est IMMUTABLE : aucune route ne le modifie ni ne le supprime.
Le statut de la facture (partial / paid) est recalculé côté serveur.
"""

from __future__ import annotations

from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import (
    COL_CUSTOMER_INVOICES,
    COL_CUSTOMER_PAYMENTS,
    COL_CUSTOMERS,
    COL_SUPPLIER_INVOICES,
    COL_SUPPLIER_PAYMENTS,
    COL_SUPPLIERS,
    new_id,
    now,
)
from app.schemas.base import serialize, serialize_many
from app.schemas.commercial import PaymentCreate, PaymentOut
from app.services.audit import log_action
from app.services.commercial import history_entry, push_history, r2
from app.services.sequences import next_number


def _r2(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


async def register_payment(
    db: AsyncDatabase[dict[str, Any]], *, direction: str, payload: dict[str, Any], user: dict[str, Any]
) -> dict[str, Any]:
    if direction == "customer":
        invoice_col, seq_type, party_col, party_field = (
            COL_CUSTOMER_INVOICES, "customer_payment", COL_CUSTOMERS, "customer_id"
        )
    else:
        invoice_col, seq_type, party_col, party_field = (
            COL_SUPPLIER_INVOICES, "supplier_payment", COL_SUPPLIERS, "supplier_id"
        )

    invoice = await db[invoice_col].find_one({"_id": payload.get("invoice_id")})
    if not invoice:
        raise not_found("Facture", payload.get("invoice_id"))
    if invoice.get("status") not in ("validated", "partial"):
        raise DomainError(
            409,
            "invoice_not_payable",
            f"Règlement impossible : la facture est au statut {invoice.get('status')}.",
        )
    amount = r2(payload.get("amount"))
    if amount <= 0:
        raise DomainError(422, "invalid_amount", "Le montant du règlement doit être positif.")
    balance = r2(invoice.get("balance_due"))
    if amount > balance + 0.009:
        raise DomainError(
            409,
            "over_payment",
            f"Montant supérieur au solde restant ({balance:.2f} {invoice.get('currency', 'TND')}).",
        )

    number = await next_number(db, seq_type)
    party = await db[party_col].find_one({"_id": invoice.get(party_field)})
    doc = {
        "_id": new_id("pay"),
        "number": number,
        "direction": direction,
        "invoice_id": invoice["_id"],
        "invoice_number": invoice.get("number", ""),
        "party_id": invoice.get(party_field, ""),
        "party_name": (party or {}).get("name", ""),
        "amount": amount,
        "method": payload.get("method") or "bank_transfer",
        "reference": payload.get("reference") or "",
        "paid_at": payload.get("paid_at") or now(),
        "notes": payload.get("notes") or "",
        "currency": invoice.get("currency", "TND"),
        "created_by": user["id"],
        "created_by_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "created_at": now(),
    }
    await db[COL_CUSTOMER_PAYMENTS if direction == "customer" else COL_SUPPLIER_PAYMENTS].insert_one(doc)

    new_paid = r2(invoice.get("amount_paid", 0)) + amount
    total_ttc = r2((invoice.get("totals") or {}).get("total_ttc"))
    status = "paid" if new_paid >= total_ttc - 0.009 else "partial"
    await db[invoice_col].update_one(
        {"_id": invoice["_id"]},
        {"$set": {
            "amount_paid": new_paid,
            "balance_due": r2(total_ttc - new_paid),
            "status": status,
            "updated_at": now(),
        }},
    )
    await push_history(
        db, invoice_col, invoice["_id"],
        history_entry(user, "payment.registered", f"{number} — {amount:.2f} {doc['currency']}"),
    )
    await log_action(
        db, action="payment.registered", entity_type=f"{direction}_invoice",
        entity_id=invoice["_id"], user=user, details={"number": number, "amount": amount},
    )
    return serialize(PaymentOut, doc)


async def get_payment(
    db: AsyncDatabase[dict[str, Any]], *, direction: str, payment_id: str
) -> dict[str, Any]:
    collection = COL_CUSTOMER_PAYMENTS if direction == "customer" else COL_SUPPLIER_PAYMENTS
    doc = await db[collection].find_one({"_id": payment_id})
    if not doc:
        raise not_found("Règlement", payment_id)
    return serialize(PaymentOut, doc)


async def list_payments(
    db: AsyncDatabase[dict[str, Any]],
    *,
    direction: str,
    invoice_id: str | None = None,
    party_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    collection = COL_CUSTOMER_PAYMENTS if direction == "customer" else COL_SUPPLIER_PAYMENTS
    filters: dict[str, Any] = {"direction": direction}
    if invoice_id:
        filters["invoice_id"] = invoice_id
    if party_id:
        filters["party_id"] = party_id
    cursor = db[collection].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[collection].count_documents(filters)
    return {"items": serialize_many(PaymentOut, items), "total": total, "skip": skip, "limit": limit}


async def _recompute_invoice_status(db: AsyncDatabase[dict[str, Any]], direction: str, invoice_id: str) -> str:
    invoice_col = COL_CUSTOMER_INVOICES if direction == "customer" else COL_SUPPLIER_INVOICES
    invoice = await db[invoice_col].find_one({"_id": invoice_id})
    if not invoice or invoice.get("status") in ("draft", "cancelled"):
        return invoice.get("status", "unknown") if invoice else "unknown"
    total = r2((invoice.get("totals") or {}).get("total_ttc"))
    paid = r2(invoice.get("amount_paid"))
    status = "paid" if paid >= total - 0.009 else ("partial" if paid > 0 else "validated")
    if status != invoice.get("status"):
        await db[invoice_col].update_one(
            {"_id": invoice_id}, {"$set": {"status": status, "updated_at": now()}}
        )
    return status
