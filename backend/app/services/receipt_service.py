"""Bons de réception — workflow BROUILLON → VALIDÉ.

  • Création = brouillon : vérifie les bornes de la commande mais
    n'applique AUCUN mouvement de stock ;
  • Validation = entrée de stock RÉELLE (mouvements atomiques, journal
    immuable) + mise à jour bornée des quantités reçues de la commande +
    recomputation du statut ;
  • Quantités endommagées / manquantes : tracées, jamais mises en stock ;
  • Traitement dupliqué impossible (garde de transition + bornes atomiques).
"""

from __future__ import annotations

from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError, not_found
from app.models.fields import COL_GOODS_RECEIPTS, COL_PURCHASE_ORDERS, COL_WAREHOUSES, new_id, now
from app.schemas.base import serialize, serialize_many
from app.schemas.commercial import GoodsReceiptOut
from app.services.audit import log_action
from app.services.commercial import history_entry, push_history, transition_doc
from app.services.po_service import bump_po_lines, recompute_status_after_receipt
from app.services.sequences import next_number
from app.services.stock_service import apply_movement

_RECEIVABLE_PO_STATUSES = ("approved", "ordered", "partial")


async def list_goods_receipts(
    db: AsyncDatabase[dict[str, Any]],
    *,
    po_id: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if po_id:
        filters["po_id"] = po_id
    if status:
        filters["status"] = status
    cursor = db[COL_GOODS_RECEIPTS].find(filters).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db[COL_GOODS_RECEIPTS].count_documents(filters)
    return {"items": serialize_many(GoodsReceiptOut, items), "total": total, "skip": skip, "limit": limit}


async def get_goods_receipt(db: AsyncDatabase[dict[str, Any]], receipt_id: str) -> dict[str, Any]:
    doc = await db[COL_GOODS_RECEIPTS].find_one({"_id": receipt_id})
    if not doc:
        raise not_found("Bon de réception", receipt_id)
    return serialize(GoodsReceiptOut, doc)


async def create_goods_receipt(
    db: AsyncDatabase[dict[str, Any]],
    *,
    po_id: str,
    lines: list[dict[str, Any]],
    warehouse_id: str,
    location_id: str | None,
    notes: str | None = None,
    user: dict[str, Any],
) -> dict[str, Any]:
    """Brouillon de réception : AUCUN impact de stock à ce stade."""
    po = await db[COL_PURCHASE_ORDERS].find_one({"_id": po_id})
    if not po:
        raise not_found("Commande d'achat", po_id)
    if po["status"] not in _RECEIVABLE_PO_STATUSES:
        raise DomainError(
            409, "po_not_receivable",
            f"Réception impossible : la commande est au statut {po['status']}.")
    if not lines:
        raise DomainError(422, "empty_receipt", "Aucune ligne à réceptionner.")
    warehouse = await db[COL_WAREHOUSES].find_one({"_id": warehouse_id})
    if not warehouse:
        raise not_found("Entrepôt", warehouse_id)

    receipt_lines: list[dict[str, Any]] = []
    for raw in lines:
        po_line = next((l for l in po["lines"] if l["id"] == raw.get("line_id")), None)
        if not po_line:
            raise not_found("Ligne de commande", raw.get("line_id"))
        qty = int(raw.get("quantity") or 0)
        damaged = int(raw.get("quantity_damaged") or 0)
        missing = int(raw.get("quantity_missing") or 0)
        if qty <= 0:
            raise DomainError(422, "invalid_quantity", "Quantité reçue doit être positive.")
        if damaged < 0 or missing < 0:
            raise DomainError(422, "invalid_quantity", "Quantités endommagées/manquantes invalides.")
        remaining = po_line["quantity"] - po_line.get("received_quantity", 0)
        if qty > remaining:
            raise DomainError(
                409, "over_receipt",
                f"Réception excédentaire : {remaining} unité(s) restante(s) sur {po_line['product_sku']}.")
        receipt_lines.append({
            "line_id": po_line["id"],
            "product_id": po_line["product_id"],
            "sku": po_line.get("product_sku", ""),
            "name": po_line.get("product_name", ""),
            "unit": po_line.get("unit", ""),
            "quantity": qty,
            "quantity_damaged": damaged,
            "quantity_missing": missing,
            "notes": raw.get("notes") or "",
        })

    number = await next_number(db, "goods_receipt")
    doc = {
        "_id": new_id("gr"),
        "number": number,
        "status": "draft",
        "po_id": po["_id"],
        "po_reference": po["reference"],
        "supplier_id": po.get("supplier_id", ""),
        "supplier_name": po.get("supplier_name", ""),
        "lines": receipt_lines,
        "warehouse_id": warehouse_id,
        "warehouse_name": warehouse.get("name", ""),
        "location_id": location_id,
        "movement_ids": [],
        "notes": notes or "",
        "user_id": user["id"],
        "created_by_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "created_at": now(),
        "validated_at": None,
        "history": [history_entry(user, "created", f"BR {number} (brouillon)")],
    }
    await db[COL_GOODS_RECEIPTS].insert_one(doc)
    await log_action(db, action="goods_receipt.created", entity_type="goods_receipt",
                     entity_id=doc["_id"], user=user, details={"number": number})
    return serialize(GoodsReceiptOut, doc)


async def validate_goods_receipt(
    db: AsyncDatabase[dict[str, Any]], receipt_id: str, user: dict[str, Any]
) -> dict[str, Any]:
    """Validation : entrée de stock réelle + commande mise à jour (bornes atomiques)."""
    doc = await db[COL_GOODS_RECEIPTS].find_one({"_id": receipt_id})
    if not doc:
        raise not_found("Bon de réception", receipt_id)
    if doc["status"] != "draft":
        raise DomainError(409, "invalid_transition",
                          f"Transition bon de réception {doc['status']} → validated interdite "
                          "(réception déjà traitée ?).")
    po = await db[COL_PURCHASE_ORDERS].find_one({"_id": doc["po_id"]})
    if not po:
        raise not_found("Commande d'achat", doc["po_id"])
    if po["status"] not in _RECEIVABLE_PO_STATUSES:
        raise DomainError(409, "po_not_receivable",
                          f"Réception impossible : la commande est au statut {po['status']}.")

    movement_ids: list[str] = []
    try:
        for line in doc["lines"]:
            movement = await apply_movement(
                db,
                product_id=line["product_id"],
                warehouse_id=doc["warehouse_id"],
                mtype="in",
                quantity=line["quantity"],
                reason=f"Réception {doc['number']} ({doc['po_reference']})",
                user=user,
                location_id=doc.get("location_id"),
                reference=doc["po_id"],
            )
            movement_ids.append(movement["id"])
    except Exception:
        for line, _mid in zip(doc["lines"], movement_ids):
            await apply_movement(
                db,
                product_id=line["product_id"],
                warehouse_id=doc["warehouse_id"],
                mtype="out",
                quantity=line["quantity"],
                reason=f"Compensation BR {doc['number']} (échec validation)",
                user=user,
                location_id=doc.get("location_id"),
                reference=doc["_id"],
            )
        raise

    await bump_po_lines(
        db, doc["po_id"],
        [(l["line_id"], "received_quantity", l["quantity"]) for l in doc["lines"]],
        bound_field="quantity",
    )
    await recompute_status_after_receipt(db, doc["po_id"])

    updated = await transition_doc(
        db, COL_GOODS_RECEIPTS, receipt_id,
        current_status="draft", target="validated",
        extra_set={"movement_ids": movement_ids, "validated_at": now()},
    )
    await push_history(db, COL_GOODS_RECEIPTS, receipt_id,
                       history_entry(user, "validated", f"{len(movement_ids)} mouvement(s) d'entrée"))
    await log_action(db, action="goods_receipt.validated", entity_type="goods_receipt",
                     entity_id=receipt_id, user=user,
                     details={"number": doc["number"], "movements": len(movement_ids)})
    return serialize(GoodsReceiptOut, updated)
