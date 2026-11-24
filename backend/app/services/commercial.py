"""Helpers partagés de la gestion commerciale : lignes, totaux, transitions.

RÈGLE ABSOLUE : les montants sont TOUJOURS calculés côté serveur à partir
des données validées — jamais acceptés tels quels du frontend.
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import COL_PRODUCTS, new_id, now


def r2(value: float) -> float:
    return round(float(value) + 0.0, 2)


def _clean_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


async def build_lines(
    db: AsyncDatabase[dict[str, Any]],
    raw_lines: list[dict[str, Any]],
    *,
    default_tax_rate: float,
    price_field: str = "selling_price",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Résout les produits et calcule chaque ligne + totaux (HT/TVA/TTC)."""
    if not raw_lines:
        raise DomainError(422, "empty_lines", "Le document doit contenir au moins une ligne.")
    lines: list[dict[str, Any]] = []
    tax_breakdown: dict[str, float] = {}
    total_ht = 0.0
    total_tax = 0.0
    for raw in raw_lines:
        product = await db[COL_PRODUCTS].find_one({"_id": raw.get("product_id")})
        if not product:
            raise not_found("Produit", raw.get("product_id"))
        quantity = int(raw.get("quantity") or 0)
        if quantity <= 0:
            raise DomainError(422, "invalid_quantity", "Chaque ligne doit avoir une quantité positive.")
        unit_price = _clean_float(raw.get("unit_price"), -1)
        if unit_price < 0:
            unit_price = _clean_float(product.get(price_field))
        discount_pct = min(100.0, max(0.0, _clean_float(raw.get("discount_pct"))))
        # Taux de TVA : ligne → fiche produit → paramètres société.
        tax_rate = raw.get("tax_rate")
        if tax_rate is None:
            tax_rate = product.get("tax_rate")
        if tax_rate is None:
            tax_rate = default_tax_rate
        tax_rate = _clean_float(tax_rate)
        if tax_rate < 0:
            raise DomainError(422, "invalid_tax_rate", "Le taux de TVA ne peut pas être négatif.")

        gross = r2(quantity * unit_price)
        discount_amount = r2(gross * discount_pct / 100)
        net = r2(gross - discount_amount)
        tax_amount = r2(net * tax_rate / 100)
        total_ttc = r2(net + tax_amount)
        total_ht += net
        total_tax += tax_amount
        key = f"{tax_rate:g}%"
        tax_breakdown[key] = r2(tax_breakdown.get(key, 0) + tax_amount)

        lines.append(
            {
                "id": raw.get("id") or new_id("dcl"),
                "product_id": product["_id"],
                "sku": product.get("sku", ""),
                "name": product.get("name", ""),
                "unit": product.get("unit", ""),
                "quantity": quantity,
                "unit_price": r2(unit_price),
                "discount_pct": discount_pct,
                "tax_rate": tax_rate,
                "gross_amount": gross,
                "discount_amount": discount_amount,
                "net_amount": net,
                "tax_amount": tax_amount,
                "total_ttc": total_ttc,
            }
        )
    totals = {
        "total_ht": r2(total_ht),
        "total_tax": r2(total_tax),
        "total_ttc": r2(total_ht + total_tax),
        "tax_breakdown": tax_breakdown,
    }
    return lines, totals


def compute_totals(lines: list[dict[str, Any]]) -> dict[str, Any]:
    """Recalcule les totaux d'un document à partir de ses lignes stockées."""
    tax_breakdown: dict[str, float] = {}
    total_ht = 0.0
    total_tax = 0.0
    for line in lines:
        total_ht += _clean_float(line.get("net_amount"))
        total_tax += _clean_float(line.get("tax_amount"))
        key = f"{_clean_float(line.get('tax_rate')):g}%"
        tax_breakdown[key] = r2(tax_breakdown.get(key, 0) + _clean_float(line.get("tax_amount")))
    return {
        "total_ht": r2(total_ht),
        "total_tax": r2(total_tax),
        "total_ttc": r2(total_ht + total_tax),
        "tax_breakdown": tax_breakdown,
    }


def check_transition(current: str, target: str, allowed: dict[str, set[str]], label: str) -> None:
    if target not in allowed.get(current, set()):
        raise DomainError(
            409,
            "invalid_transition",
            f"Transition {label} {current} → {target} interdite.",
        )


def history_entry(user: dict[str, Any], action: str, details: str = "") -> dict[str, Any]:
    return {
        "action": action,
        "details": details,
        "user_id": user.get("id", ""),
        "user_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "at": now().isoformat(),
    }


async def push_history(
    db: AsyncDatabase[dict[str, Any]],
    collection: str,
    doc_id: str,
    entry: dict[str, Any],
) -> None:
    await db[collection].update_one(
        {"_id": doc_id},
        {"$push": {"history": entry}, "$set": {"updated_at": now()}},
    )


async def transition_doc(
    db: AsyncDatabase[dict[str, Any]],
    collection: str,
    doc_id: str,
    *,
    current_status: str,
    target: str,
    extra_set: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Transition atomique : le filtre inclut le statut courant (anti-concurrence)."""
    update: dict[str, Any] = {"$set": {"status": target, "updated_at": now(), **(extra_set or {})}}
    doc = await db[collection].find_one_and_update(
        {"_id": doc_id, "status": current_status},
        update,
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise DomainError(
            409,
            "doc_modified",
            "Document modifié concurrentement ou statut déjà changé — rechargez et réessayez.",
        )
    return doc


def compute_overdue(doc: dict[str, Any]) -> bool:
    """Facture en retard : solde > 0 et échéance dépassée."""
    balance = _clean_float(doc.get("balance_due"))
    if balance <= 0.009 or doc.get("status") in ("draft", "cancelled"):
        return False
    due = doc.get("due_date")
    if not due:
        return False
    if isinstance(due, str):
        try:
            due = datetime_from_iso(due)
        except ValueError:
            return False
    return due < now()


def datetime_from_iso(value: str) -> Any:
    from datetime import datetime

    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
