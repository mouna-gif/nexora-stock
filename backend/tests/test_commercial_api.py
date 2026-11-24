"""Test d'acceptation HTTP — cycle de vente COMPLET via l'API réelle.

Scénario du cahier des charges :
  créer produit (avec stock initial) → créer client → créer devis →
  accepter → convertir en commande → confirmer → livrer partiellement
  puis totalement (stock mis à jour) → générer la facture →
  règlement partiel → règlement final → vérifier numérotation,
  anti-doublons, soldes et journal d'audit.

Exécute via TestClient + FakeDatabase (aucun MongoDB requis).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_database
from app.main import create_app
from tests.fakes import FakeDatabase


@pytest.fixture
def client(fake_db: FakeDatabase) -> TestClient:
    app = create_app()
    app.state.db = fake_db  # bypass lifespan
    app.dependency_overrides[get_database] = lambda: fake_db
    return TestClient(app)


def _auth(client: TestClient) -> dict:
    r = client.post("/api/v1/auth/register", json={
        "firstName": "Aziz", "lastName": "Sakly", "email": "aziz@nexora.tn",
        "company": "Nexora", "password": "Password!42",
    })
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_full_sales_workflow_over_http(client: TestClient) -> None:
    headers = _auth(client)

    # ── Entrepôt + fournisseur + article avec stock initial 50
    r = client.post("/api/v1/warehouses", headers=headers,
                    json={"name": "Dépôt Principal", "code": "WH-001", "city": "Tunis"})
    assert r.status_code in (200, 201), r.text
    warehouse_id = r.json()["id"]

    r = client.post("/api/v1/suppliers", headers=headers,
                    json={"name": "Céramique Med SA", "code": "FOU-001"})
    assert r.status_code in (200, 201), r.text
    supplier_id = r.json()["id"]

    r = client.post("/api/v1/products", headers=headers, json={
        "sku": "CAR-60x60", "name": "Carreaux grès 60×60", "category": "Carrelage",
        "brand": "Ceramica", "unit": "m²", "costPrice": 60, "sellingPrice": 100,
        "minStock": 5, "maxStock": 200, "reorderPoint": 10,
        "warehouseId": warehouse_id, "supplierId": supplier_id,
        "taxRate": 19, "initialStock": {"quantity": 50},
    })
    assert r.status_code == 200, r.text
    product = r.json()
    assert product["stock"] == 50, "Le stock initial doit venir d'un vrai mouvement d'entrée"
    product_id = product["id"]

    # ── Client
    r = client.post("/api/v1/customers", headers=headers, json={"name": "Société Ibn Khaldoun", "city": "Tunis"})
    assert r.status_code == 200, r.text
    customer = r.json()
    assert customer["code"].startswith("CLI-")
    customer_id = customer["id"]

    # ── Devis : 10 m² à 100, remise 10 %
    r = client.post("/api/v1/sales/quotations", headers=headers, json={
        "customerId": customer_id,
        "lines": [{"productId": product_id, "quantity": 10, "unitPrice": 100, "discountPct": 10}],
        "terms": "Paiement 30 jours",
    })
    assert r.status_code == 200, r.text
    quote = r.json()
    assert quote["number"].startswith("DEV-2026-")
    assert quote["totals"]["totalTtc"] == 1071.0
    quote_id = quote["id"]

    # Brouillon non convertible
    r = client.post(f"/api/v1/sales/quotations/{quote_id}/convert", headers=headers)
    assert r.status_code == 409

    for target in ("sent", "accepted"):
        r = client.post(f"/api/v1/sales/quotations/{quote_id}/transition", headers=headers, json={"to": target})
        assert r.status_code == 200, r.text

    # Transition invalide refusée (accepté → envoyé)
    r = client.post(f"/api/v1/sales/quotations/{quote_id}/transition", headers=headers, json={"to": "sent"})
    assert r.status_code == 409

    # ── Conversion en commande (lignes + référence préservées)
    r = client.post(f"/api/v1/sales/quotations/{quote_id}/convert", headers=headers)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["number"].startswith("CMD-2026-")
    assert order["quotationNumber"] == quote["number"]
    order_id, order_line_id = order["id"], order["lines"][0]["id"]

    # Re-conversion impossible
    r = client.post(f"/api/v1/sales/quotations/{quote_id}/convert", headers=headers)
    assert r.status_code == 409

    # ── Confirmation puis BL partiel (4/10) — aucun stock au brouillon
    r = client.post(f"/api/v1/sales/orders/{order_id}/transition", headers=headers, json={"to": "confirmed"})
    assert r.status_code == 200, r.text

    r = client.post("/api/v1/sales/delivery-notes", headers=headers, json={
        "salesOrderId": order_id, "warehouseId": warehouse_id,
        "lines": [{"lineId": order_line_id, "quantity": 4}], "driver": "Mohamed",
    })
    assert r.status_code == 200, r.text
    dn = r.json()
    assert dn["number"].startswith("BL-2026-") and dn["status"] == "draft"
    dn_id = dn["id"]

    r = client.get(f"/api/v1/products/{product_id}", headers=headers)
    assert r.json()["stock"] == 50, "Aucune sortie de stock au stade brouillon"

    r = client.post(f"/api/v1/sales/delivery-notes/{dn_id}/validate", headers=headers)
    assert r.status_code == 200, r.text
    r = client.get(f"/api/v1/products/{product_id}", headers=headers)
    assert r.json()["stock"] == 46, "La validation doit sortir réellement 4 du stock"

    # Sur-livraison refusée (reste 6)
    r = client.post("/api/v1/sales/delivery-notes", headers=headers, json={
        "salesOrderId": order_id, "warehouseId": warehouse_id,
        "lines": [{"lineId": order_line_id, "quantity": 7}],
    })
    assert r.status_code == 409

    # BL n°2 : solde
    r = client.post("/api/v1/sales/delivery-notes", headers=headers, json={
        "salesOrderId": order_id, "warehouseId": warehouse_id,
        "lines": [{"lineId": order_line_id, "quantity": 6}],
    })
    dn2 = r.json()
    assert r.status_code == 200
    r = client.post(f"/api/v1/sales/delivery-notes/{dn2['id']}/validate", headers=headers)
    assert r.status_code == 200

    r = client.get(f"/api/v1/sales/orders/{order_id}", headers=headers)
    assert r.json()["status"] == "delivered"

    # ── Facture générée depuis le livré
    r = client.post("/api/v1/sales/invoices/generate", headers=headers, json={"salesOrderId": order_id})
    assert r.status_code == 200, r.text
    invoice = r.json()
    assert invoice["number"].startswith("FAC-2026-")
    assert invoice["totals"]["totalTtc"] == 1071.0
    assert set(invoice["deliveryNoteNumbers"]) == {dn["number"], dn2["number"]}
    assert invoice["balanceDue"] == 1071.0
    invoice_id = invoice["id"]

    # Anti-doublon : plus rien de facturable
    r = client.post("/api/v1/sales/invoices/generate", headers=headers, json={"salesOrderId": order_id})
    assert r.status_code == 409

    # Facture brouillon non payables
    r = client.post("/api/v1/sales/payments", headers=headers,
                    json={"invoiceId": invoice_id, "amount": 100})
    assert r.status_code == 409

    r = client.post(f"/api/v1/sales/invoices/{invoice_id}/validate", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["dueDate"] is not None

    # ── Règlement partiel puis solde
    r = client.post("/api/v1/sales/payments", headers=headers,
                    json={"invoiceId": invoice_id, "amount": 500, "method": "cheque", "reference": "CH-77"})
    assert r.status_code == 200, r.text
    receipt = r.json()
    assert receipt["number"].startswith("REC-2026-")

    r = client.get(f"/api/v1/sales/invoices/{invoice_id}", headers=headers)
    inv = r.json()
    assert inv["status"] == "partial" and inv["amountPaid"] == 500.0 and inv["balanceDue"] == 571.0

    # Sur-règlement refusé
    r = client.post("/api/v1/sales/payments", headers=headers,
                    json={"invoiceId": invoice_id, "amount": 9999})
    assert r.status_code == 409

    r = client.post("/api/v1/sales/payments", headers=headers,
                    json={"invoiceId": invoice_id, "amount": 571, "method": "bank_transfer"})
    assert r.status_code == 200
    r = client.get(f"/api/v1/sales/invoices/{invoice_id}", headers=headers)
    assert r.json()["status"] == "paid" and r.json()["balanceDue"] == 0.0

    # ── Reçu de règlement imprimable : le backend expose le règlement
    r = client.get(f"/api/v1/sales/payments/{receipt['id']}", headers=headers)
    assert r.status_code == 200 and r.json()["number"] == receipt["number"]

    # ── Journal d'audit : les actions sensibles sont tracées
    r = client.get("/api/v1/audit", headers=headers,
                   params={"entity_type": "customer_invoice", "entityId": invoice_id})
    assert r.status_code == 200
    actions = [a["action"] for a in r.json()["items"]]
    assert "invoice.generated" in actions and "payment.registered" in actions
