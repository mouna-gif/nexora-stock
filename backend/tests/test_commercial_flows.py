"""Tests bout-en-bout de la gestion commerciale (FakeDatabase, sans serveur).

Scénarios couverts :
  • VENTES : produit → client → devis → acceptation → commande → BL
    (brouillon sans stock, validation avec sortie réelle) → facture
    (anti-doublon) → règlements partiels → soldée ;
  • ACHATS : devis fournisseur → commande → approbation → réceptions
    (brouillon puis validation avec entrée de stock) → facture fournisseur
    (écarts) → règlements ;
  • Garde-fous : sur-livraison, sur-réception, sur-facturation,
    sur-règlement, transitions invalides, doublons SKU/code-barres ;
  • Numérotation atomique configurable (aucun doublon, jamais réutilisée) ;
  • Produits : stock initial via mouvement réel, images persistées.
"""

from __future__ import annotations

import io
from datetime import datetime

import pytest
from starlette.datastructures import UploadFile

from app.core.config import get_settings
from app.core.errors import DomainError
from app.models.fields import (
    COL_AUDIT_LOGS,
    COL_MOVEMENTS,
    COL_PRODUCTS,
    COL_STOCK_ITEMS,
    COL_SUPPLIERS,
    COL_WAREHOUSES,
)
from app.services import (
    catalog_service,
    company_service,
    media_service,
    payments as payments_service,
    po_service,
    purchase_service,
    receipt_service,
    sales_service,
    sequences,
    stock_service,
)
from tests.fakes import FakeDatabase


@pytest.fixture
def db() -> FakeDatabase:
    database = FakeDatabase()
    database[COL_WAREHOUSES].docs.append(
        {"_id": "wh-001", "name": "Dépôt Principal", "code": "WH-001", "is_active": True}
    )
    database[COL_SUPPLIERS].docs.append(
        {"_id": "sup-001", "name": "Céramique Med SA", "code": "FOU-001", "is_active": True}
    )
    return database


@pytest.fixture
def user() -> dict:
    return {"id": "usr-001", "first_name": "Aziz", "last_name": "Sakly", "role": "super_admin"}


async def make_product(db: FakeDatabase, user: dict, sku: str = "CAR-001", **overrides) -> dict:
    payload = {
        "sku": sku,
        "name": f"Carreaux {sku}",
        "category": "Carrelage",
        "brand": "Ceramica",
        "unit": "m²",
        "cost_price": 60.0,
        "selling_price": 100.0,
        "min_stock": 5,
        "max_stock": 200,
        "reorder_point": 10,
        "warehouse_id": "wh-001",
        "supplier_id": "sup-001",
        "tax_rate": 19.0,
    }
    payload.update(overrides)
    return await catalog_service.create_product(db, payload, user)


async def stock_in(db: FakeDatabase, user: dict, product_id: str, qty: int) -> None:
    await stock_service.apply_movement(
        db, product_id=product_id, warehouse_id="wh-001", mtype="in",
        quantity=qty, reason="Alimentation test", user=user,
    )


def product_stock(db: FakeDatabase, product_id: str) -> int:
    return int(next(d for d in db[COL_PRODUCTS].docs if d["_id"] == product_id)["stock"])


# ── CYCLE VENTES COMPLET ─────────────────────────────────────


async def test_full_sales_lifecycle(db: FakeDatabase, user: dict) -> None:
    product = await make_product(db, user)
    await stock_in(db, user, product["id"], 50)

    customer = await sales_service.create_customer(
        db, {"name": "Société Ibn Khaldoun", "city": "Tunis", "tax_id": "1234567/A/M/000"}, user)

    # ── Devis : 10 m² à 100 TND, remise 10 %, TVA 19 %
    quote = await sales_service.create_sales_quotation(db, {
        "customer_id": customer["id"],
        "lines": [{"product_id": product["id"], "quantity": 10, "unit_price": 100.0, "discount_pct": 10}],
        "terms": "Paiement 30 jours",
    }, user)
    assert quote["number"].startswith("DEV-")
    totals = quote["totals"]
    assert totals["totalHt"] == 900.0      # 1000 − 10 %
    assert totals["totalTax"] == 171.0     # 900 × 19 %
    assert totals["totalTtc"] == 1071.0

    # Conversion refusée tant que le devis n'est pas accepté
    with pytest.raises(DomainError):
        await sales_service.convert_quotation_to_order(db, quote["id"], user)

    await sales_service.transition_quotation(db, quote["id"], "sent", user)
    await sales_service.transition_quotation(db, quote["id"], "accepted", user)

    # Transition invalide refusée (accepté → envoyé interdit)
    with pytest.raises(DomainError):
        await sales_service.transition_quotation(db, quote["id"], "sent", user)

    order = await sales_service.convert_quotation_to_order(db, quote["id"], user)
    assert order["number"].startswith("CMD-")
    assert order["quotationNumber"] == quote["number"]
    assert order["lines"][0]["quantity"] == 10
    assert order["lines"][0]["discountPct"] == 10

    # Re-conversion impossible (anti-doublon)
    with pytest.raises(DomainError):
        await sales_service.convert_quotation_to_order(db, quote["id"], user)

    await sales_service.transition_sales_order(db, order["id"], "confirmed", user)

    # ── BL partiel n°1 : brouillon SANS effet de stock
    dn1 = await sales_service.create_delivery_note(db, {
        "sales_order_id": order["id"],
        "warehouse_id": "wh-001",
        "lines": [{"line_id": order["lines"][0]["id"], "quantity": 4}],
        "driver": "Mohamed",
    }, user)
    assert dn1["status"] == "draft"
    assert product_stock(db, product["id"]) == 50  # Aucune sortie au brouillon

    dn1v = await sales_service.validate_delivery_note(db, dn1["id"], user)
    assert dn1v["status"] == "validated"
    assert product_stock(db, product["id"]) == 46  # Sortie réelle de 4
    order_after = await sales_service.get_sales_order(db, order["id"])
    assert order_after["status"] == "partial"
    assert order_after["lines"][0]["deliveredQuantity"] == 4

    # Sur-livraison impossible : 7 > 6 restants à livrer
    with pytest.raises(DomainError):
        await sales_service.create_delivery_note(db, {
            "sales_order_id": order["id"], "warehouse_id": "wh-001",
            "lines": [{"line_id": order["lines"][0]["id"], "quantity": 7}],
        }, user)

    # Stock insuffisant : tentative de livraison au-delà du disponible
    dn_bad = await sales_service.create_delivery_note(db, {
        "sales_order_id": order["id"], "warehouse_id": "wh-001",
        "lines": [{"line_id": order["lines"][0]["id"], "quantity": 6}],
    }, user)
    stock_doc = next(d for d in db[COL_STOCK_ITEMS].docs if d["product_id"] == product["id"])
    real_qty = int(stock_doc["qty"])
    stock_doc["qty"] = 2
    with pytest.raises(DomainError):
        await sales_service.validate_delivery_note(db, dn_bad["id"], user)
    stock_doc["qty"] = real_qty  # restauration pour la suite du scénario

    # ── BL n°2 : solde
    dn2 = await sales_service.create_delivery_note(db, {
        "sales_order_id": order["id"], "warehouse_id": "wh-001",
        "lines": [{"line_id": order["lines"][0]["id"], "quantity": 6}],
    }, user)
    await sales_service.validate_delivery_note(db, dn2["id"], user)
    assert product_stock(db, product["id"]) == 40
    order_full = await sales_service.get_sales_order(db, order["id"])
    assert order_full["status"] == "delivered"

    # ── Facture : générée depuis les quantités livrées
    invoice = await sales_service.generate_invoice_from_order(
        db, {"sales_order_id": order["id"]}, user)
    assert invoice["number"].startswith("FAC-")
    assert invoice["totals"]["totalTtc"] == 1071.0
    assert invoice["balanceDue"] == 1071.0
    assert set(invoice["deliveryNoteNumbers"]) == {dn1["number"], dn2["number"]}
    assert invoice["quotationNumber"] == quote["number"]

    # Anti-doublon : rien de facturable restant
    with pytest.raises(DomainError):
        await sales_service.generate_invoice_from_order(db, {"sales_order_id": order["id"]}, user)

    invoice_v = await sales_service.validate_invoice(db, invoice["id"], user)
    assert invoice_v["status"] == "validated"
    assert invoice_v["dueDate"] is not None

    # ── Règlements : partiel puis solde
    pay1 = await payments_service.register_payment(db, direction="customer", payload={
        "invoice_id": invoice["id"], "amount": 500.0, "method": "cheque", "reference": "CH-77"},
        user=user)
    assert pay1["number"].startswith("REC-")
    inv_after = await sales_service.get_customer_invoice(db, invoice["id"])
    assert inv_after["status"] == "partial"
    assert inv_after["amountPaid"] == 500.0
    assert inv_after["balanceDue"] == 571.0

    # Sur-règlement impossible
    with pytest.raises(DomainError):
        await payments_service.register_payment(db, direction="customer", payload={
            "invoice_id": invoice["id"], "amount": 9999.0}, user=user)

    await payments_service.register_payment(db, direction="customer", payload={
        "invoice_id": invoice["id"], "amount": 571.0, "method": "bank_transfer"}, user=user)
    inv_paid = await sales_service.get_customer_invoice(db, invoice["id"])
    assert inv_paid["status"] == "paid"
    assert inv_paid["balanceDue"] == 0.0

    # Traçabilité : mouvements immuables + audit
    movements = [d for d in db[COL_MOVEMENTS].docs if d["product_id"] == product["id"]]
    out_movements = [m for m in movements if m["type"] == "out" and "Livraison" in m["reason"]]
    assert len(out_movements) == 2
    audit_docs = [d for d in db[COL_AUDIT_LOGS].docs if d["entity_id"] == invoice["id"]]
    assert audit_docs


async def test_invoice_bounded_by_delivered_quantities(db: FakeDatabase, user: dict) -> None:
    """Facturation partielle : impossible de facturer plus que livré."""
    product = await make_product(db, user)
    await stock_in(db, user, product["id"], 30)
    customer = await sales_service.create_customer(db, {"name": "Client Delta"}, user)
    quote = await sales_service.create_sales_quotation(db, {
        "customer_id": customer["id"],
        "lines": [{"product_id": product["id"], "quantity": 20, "unit_price": 100.0}],
    }, user)
    await sales_service.transition_quotation(db, quote["id"], "sent", user)
    await sales_service.transition_quotation(db, quote["id"], "accepted", user)
    order = await sales_service.convert_quotation_to_order(db, quote["id"], user)
    await sales_service.transition_sales_order(db, order["id"], "confirmed", user)

    # Facture impossible : rien n'est livré
    with pytest.raises(DomainError):
        await sales_service.generate_invoice_from_order(db, {"sales_order_id": order["id"]}, user)

    dn = await sales_service.create_delivery_note(db, {
        "sales_order_id": order["id"], "warehouse_id": "wh-001",
        "lines": [{"line_id": order["lines"][0]["id"], "quantity": 5}]}, user)
    await sales_service.validate_delivery_note(db, dn["id"], user)

    # Facturation excédentaire refusée (7 > 5 livrés)
    with pytest.raises(DomainError):
        await sales_service.generate_invoice_from_order(db, {
            "sales_order_id": order["id"],
            "lines": [{"line_id": order["lines"][0]["id"], "quantity": 7}]}, user)

    invoice = await sales_service.generate_invoice_from_order(db, {
        "sales_order_id": order["id"],
        "lines": [{"line_id": order["lines"][0]["id"], "quantity": 5}]}, user)
    assert invoice["lines"][0]["quantity"] == 5


# ── CYCLE ACHATS COMPLET ─────────────────────────────────────


async def test_full_purchase_lifecycle(db: FakeDatabase, user: dict) -> None:
    product = await make_product(db, user, sku="SAN-001")

    sq = await purchase_service.create_supplier_quotation(db, {
        "supplier_id": "sup-001",
        "lines": [{"product_id": product["id"], "quantity": 20, "unit_price": 60.0, "discount_pct": 5}],
        "delivery_cost": 50.0,
        "lead_time_days": 7,
    }, user)
    assert sq["number"].startswith("DF-")

    # Comparaison des offres
    comparison = await purchase_service.compare_supplier_quotations(db, product["id"])
    assert comparison["offers"][0]["net_unit_price"] == 57.0  # 60 − 5 %

    await purchase_service.transition_supplier_quotation(db, sq["id"], "received", user)
    await purchase_service.transition_supplier_quotation(db, sq["id"], "accepted", user)

    po = await purchase_service.convert_supplier_quotation(db, sq["id"], user)
    assert po["reference"].startswith("PO-")
    assert po["supplierQuotationNumber"] == sq["number"]
    assert po["lines"][0]["unitPrice"] == 60.0
    assert po["lines"][0]["discountPct"] == 5

    # Approbation requise avant réception
    with pytest.raises(DomainError):
        await receipt_service.create_goods_receipt(db, po_id=po["id"], warehouse_id="wh-001",
                                                   location_id=None, lines=[], user=user)
    await po_service.transition(db, po["id"], "pending", user)
    await po_service.transition(db, po["id"], "approved", user)

    # ── Réception n°1 : brouillon sans stock
    gr1 = await receipt_service.create_goods_receipt(db, po_id=po["id"], warehouse_id="wh-001",
        location_id=None,
        lines=[{"line_id": po["lines"][0]["id"], "quantity": 12, "quantity_damaged": 1,
                "quantity_missing": 1}],
        user=user)
    assert gr1["status"] == "draft"
    assert gr1["number"].startswith("BR-")
    assert product_stock(db, product["id"]) == 0  # Aucune entrée au brouillon

    gr1v = await receipt_service.validate_goods_receipt(db, gr1["id"], user)
    assert gr1v["status"] == "validated"
    assert product_stock(db, product["id"]) == 12  # Entrée réelle

    # Anti-doublon : revalidation impossible
    with pytest.raises(DomainError):
        await receipt_service.validate_goods_receipt(db, gr1["id"], user)

    # Sur-réception impossible (reste 8)
    with pytest.raises(DomainError):
        await receipt_service.create_goods_receipt(db, po_id=po["id"], warehouse_id="wh-001",
            location_id=None,
            lines=[{"line_id": po["lines"][0]["id"], "quantity": 9}], user=user)

    gr2 = await receipt_service.create_goods_receipt(db, po_id=po["id"], warehouse_id="wh-001",
        location_id=None, lines=[{"line_id": po["lines"][0]["id"], "quantity": 8}], user=user)
    await receipt_service.validate_goods_receipt(db, gr2["id"], user)
    assert product_stock(db, product["id"]) == 20
    po_final = await po_service.get_purchase_order(db, po["id"])
    assert po_final["status"] == "received"

    # ── Facture fournisseur (bornée par le reçu) — 18 sur 20 reçus → écart
    sinv = await purchase_service.create_supplier_invoice(db, {
        "purchase_order_id": po["id"],
        "lines": [{"product_id": product["id"], "quantity": 18}],
    }, user)
    assert sinv["number"].startswith("FF-")
    assert set(sinv["goodsReceiptNumbers"]) == {gr1["number"], gr2["number"]}
    assert sinv["totals"]["totalHt"] == pytest.approx(18 * 57.0)  # 60 − 5 %

    sinv_v = await purchase_service.validate_supplier_invoice(db, sinv["id"], user)
    assert sinv_v["discrepancies"], "Écart facturé/reçu attendu (18 facturé vs 20 reçu)"
    assert sinv_v["discrepancies"][0]["type"] == "under_invoiced"

    # Sur-facturation impossible
    sinv2 = await purchase_service.create_supplier_invoice(db, {"purchase_order_id": po["id"]}, user)
    assert sinv2["lines"][0]["quantity"] == 2  # reste facturable
    await purchase_service.validate_supplier_invoice(db, sinv2["id"], user)
    with pytest.raises(DomainError):
        await purchase_service.create_supplier_invoice(db, {"purchase_order_id": po["id"]}, user)

    # ── Règlements fournisseur
    await payments_service.register_payment(db, direction="supplier", payload={
        "invoice_id": sinv["id"], "amount": 300.0, "method": "bank_transfer",
        "reference": "VIR-118"}, user=user)
    inv_after = await purchase_service.get_supplier_invoice(db, sinv["id"])
    assert inv_after["status"] == "partial"
    await payments_service.register_payment(db, direction="supplier", payload={
        "invoice_id": sinv["id"], "amount": inv_after["balanceDue"]}, user=user)
    inv_paid = await purchase_service.get_supplier_invoice(db, sinv["id"])
    assert inv_paid["status"] == "paid"


# ── NUMÉROTATION & PARAMÈTRES ────────────────────────────────


async def test_sequence_atomic_and_configurable(db: FakeDatabase, user: dict) -> None:
    n1 = await sequences.next_number(db, "sales_quotation")
    n2 = await sequences.next_number(db, "sales_quotation")
    assert n1.endswith("0001") and n2.endswith("0002")
    assert n1.startswith("DEV-2026-")

    # Configuration administrateur : préfixe et digits personnalisés
    await company_service.update_company_settings(
        db, {"numbering": {"sales_quotation": {"prefix": "dv", "digits": 5}}}, user)
    n3 = await sequences.next_number(db, "sales_quotation")
    assert n3 == f"DV-{n1.split('-')[1]}-00003"

    # Numérotation client sans année
    c1 = await sequences.next_number(db, "customer", with_year=False)
    c2 = await sequences.next_number(db, "customer", with_year=False)
    assert c1 == "CLI-0001" and c2 == "CLI-0002"


async def test_company_settings_roundtrip(db: FakeDatabase, user: dict) -> None:
    settings = await company_service.update_company_settings(db, {
        "company_name": "Nexora",
        "tax_id": "",
        "default_tax_rate": 19.0,
        "currency": "TND",
    }, user)
    assert settings["companyName"] == "Nexora"
    assert settings["currency"] == "TND"
    fetched = await company_service.get_company_settings(db)
    assert fetched["companyName"] == "Nexora"
    # Aucune information légale inventée
    assert fetched["bankRib"] == ""


# ── PRODUITS : stock initial, doublons, images persistantes ──


async def test_product_initial_stock_via_real_movement(db: FakeDatabase, user: dict) -> None:
    product = await make_product(db, user, initial_stock={"warehouse_id": "wh-001", "quantity": 25})
    assert product["stock"] == 25
    movements = [d for d in db[COL_MOVEMENTS].docs if d["product_id"] == product["id"]]
    assert len(movements) == 1 and movements[0]["reason"] == "Stock initial"
    items = [d for d in db[COL_STOCK_ITEMS].docs if d["product_id"] == product["id"]]
    assert items and items[0]["qty"] == 25


async def test_duplicate_sku_and_barcode_rejected(db: FakeDatabase, user: dict) -> None:
    await make_product(db, user, sku="DUP-1", barcode="6191234567890")
    with pytest.raises(DomainError):
        await make_product(db, user, sku="DUP-1")
    with pytest.raises(DomainError):
        await make_product(db, user, sku="DUP-2", barcode="6191234567890")


async def test_product_images_persisted(db: FakeDatabase, user: dict, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path))
    product = await make_product(db, user)

    upload = UploadFile(filename="carreaux.png", file=io.BytesIO(b"\x89PNG fake image bytes"),
                        headers={"content-type": "image/png"})
    media = await media_service.save_media(db, upload, user)
    assert media["url"].startswith("/api/v1/media/")

    updated = await media_service.attach_product_image(db, product["id"], media["id"], is_primary=True)
    assert updated["images"][0]["media_id"] == media["id"]
    assert updated["images"][0]["is_primary"] is True
    assert updated["image"] == media["url"]

    # Relecture depuis la base : l'image est bien persistée
    fetched = await catalog_service.get_product(db, product["id"])
    assert fetched["images"][0]["url"] == media["url"]

    # Suppression du média refusée tant qu'il est référencé
    with pytest.raises(DomainError):
        await media_service.delete_media(db, media["id"])
    await media_service.remove_product_image(db, product["id"], media["id"])
    result = await media_service.delete_media(db, media["id"])
    assert "message" in result


async def test_upload_rejects_non_image(db: FakeDatabase, user: dict, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path))
    upload = UploadFile(filename="malware.exe", file=io.BytesIO(b"MZ..."),
                        headers={"content-type": "application/x-msdownload"})
    with pytest.raises(DomainError):
        await media_service.save_media(db, upload, user)
