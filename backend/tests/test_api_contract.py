"""Tests de contrat API : santé, flux d'authentification complet, RBAC HTTP."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_database
from app.main import create_app
from app.models.fields import COL_USERS, public_user_doc
from app.security.passwords import hash_password
from tests.fakes import FakeDatabase


@pytest.fixture
def app_client(fake_db: FakeDatabase) -> tuple[TestClient, FakeDatabase]:
    app = create_app()
    app.state.db = fake_db  # bypass lifespan (pas de MongoDB réel en tests)
    app.dependency_overrides[get_database] = lambda: fake_db
    client = TestClient(app)
    return client, fake_db


def _seed_user(db: FakeDatabase, email: str, role: str, password: str = "Demo1234!") -> str:
    db[COL_USERS].docs.append(
        {
            "_id": f"usr-{role}", "first_name": "Demo", "last_name": role.title(),
            "email": email, "phone": None, "role": role, "company": "Nexora",
            "password_hash": hash_password(password),
            "avatar": "DS", "created_at": None, "last_login": None, "is_active": True,
        }
    )
    return public_user_doc(db[COL_USERS].docs[-1])["id"]


def test_health_endpoint(app_client: tuple) -> None:
    client, _ = app_client
    response = client.get("/api/v1/health")
    # MongoDB réel absent en tests → la base est « dégradée » mais l'API répond.
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("ok", "degraded")
    assert body["database"] == "nexora_test"


def test_register_login_me_refresh_logout(app_client: tuple) -> None:
    client, db = app_client
    # Register (premier utilisateur → super_admin)
    r = client.post(
        "/api/v1/auth/register",
        json={"firstName": "Aziz", "lastName": "Sakly", "email": "aziz@nexora.tn",
              "company": "Nexora", "password": "Password!42"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["user"]["role"] == "super_admin"
    assert "password_hash" not in body["user"]

    # Login
    r2 = client.post("/api/v1/auth/login", json={"email": "aziz@nexora.tn", "password": "Password!42"})
    assert r2.status_code == 200
    tokens = r2.json()

    # Me
    r3 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r3.status_code == 200
    assert r3.json()["email"] == "aziz@nexora.tn"

    # Refresh (rotation)
    r4 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r4.status_code == 200
    new_tokens = r4.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    # Rejeu de l'ancien refresh → refus (rotation/révocation)
    r5 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r5.status_code == 401

    # Logout → révoque les sessions
    r6 = client.post("/api/v1/auth/logout", json={"refresh_token": new_tokens["refresh_token"]},
                     headers={"Authorization": f"Bearer {new_tokens['access_token']}"})
    assert r6.status_code == 200


def test_wrong_password_401(app_client: tuple) -> None:
    client, db = app_client
    _seed_user(db, "sarra@nexora.tn", "stock_manager")
    r = client.post("/api/v1/auth/login", json={"email": "sarra@nexora.tn", "password": "wrong!"})
    assert r.status_code == 401
    assert r.json()["error"] == "invalid_credentials"


def test_products_requires_authentication(app_client: tuple) -> None:
    client, _ = app_client
    r = client.get("/api/v1/products")
    assert r.status_code == 401


def test_products_rbac_403_for_readonly_role(app_client: tuple) -> None:
    client, db = app_client
    _seed_user(db, "commercial@nexora.tn", "commercial_user")
    tokens = client.post("/api/v1/auth/login",
                         json={"email": "commercial@nexora.tn", "password": "Demo1234!"}).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    # Lecture autorisée
    r_list = client.get("/api/v1/products", headers=headers)
    assert r_list.status_code == 200
    assert r_list.json()["items"] == []

    # Écriture refusée (RBAC serveur)
    r_post = client.post(
        "/api/v1/products",
        headers=headers,
        json={"sku": "X", "name": "Test", "category": "C", "brand": "B", "unit": "u",
              "costPrice": 1, "sellingPrice": 2, "minStock": 0, "maxStock": 10,
              "reorderPoint": 5, "warehouseId": "wh-001", "supplierId": "sup-001"},
    )
    assert r_post.status_code == 403
    assert r_post.json()["error"] == "permission_denied"


def test_products_list_camelcase_contract(app_client: tuple) -> None:
    client, db = app_client
    _seed_user(db, "manager@nexora.tn", "stock_manager")
    db["products"].docs.append(
        {"_id": "prd-001", "sku": "SKU-1", "name": "Produit", "category": "Cat",
         "brand": "Marque", "unit": "m²", "cost_price": 10, "selling_price": 15,
         "stock": 5, "min_stock": 2, "max_stock": 20, "reorder_point": 4,
         "status": "in_stock", "ai_risk": "low", "ai_risk_score": 10,
         "warehouse_id": "wh-001", "supplier_id": "sup-001", "lead_time_days": 7,
         "tags": [], "created_at": None, "updated_at": None}
    )
    tokens = client.post("/api/v1/auth/login",
                         json={"email": "manager@nexora.tn", "password": "Demo1234!"}).json()
    r = client.get("/api/v1/products", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    item = r.json()["items"][0]
    assert "costPrice" in item and "sellingPrice" in item and "minStock" in item
    assert "cost_price" not in item
