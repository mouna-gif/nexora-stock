"""Amorçage de données de démonstration — IDEMPOTENT et NON DESTRUCTIF.

Principes (rappel des exigences projet) :
  • Aucun dropDatabase / dropCollection / delete_many sans filtre.
  • Les documents de référence (users, products, warehouses, suppliers,
    categories, brands, alerts) sont insérés en upsert par _id : réexécuter
    ce script est sans danger et n'écrase QUE ces documents de démo.
  • L'historique de mouvements n'est créé QUE si le journal est vide.
  • Les paramètres société (raison sociale « Nexora » + logo) sont créés
    UNE SEULE FOIS — jamais réécrits si l'administrateur les a déjà modifiés.

Usage :
    python scripts/seed.py            # crée si absent
    python scripts/seed.py --force    # ré-amorce les documents de démo (upsert)
"""

from __future__ import annotations

import argparse
import asyncio
import random
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.core.db import ensure_indexes, get_client  # noqa: E402
from app.models.fields import COL_COMPANY_SETTINGS, COL_MEDIA  # noqa: E402
from app.security.passwords import hash_password  # noqa: E402
from app.services.company_service import DEFAULT_SETTINGS, SETTINGS_ID  # noqa: E402
from app.services.media_service import media_root  # noqa: E402

DEMO_PASSWORD = "Demo1234!"

USERS = [
    ("usr-001", "Aziz", "Sakly", "aziz.sakly@nexora.tn", "owner_ceo"),
    ("usr-002", "Sarra", "Ben Amor", "s.benamor@nexora.tn", "stock_manager"),
    ("usr-003", "Mohamed", "Trabelsi", "m.trabelsi@nexora.tn", "warehouse_employee"),
    ("usr-004", "Nadia", "Chatti", "n.chatti@nexora.tn", "purchasing_manager"),
    ("usr-005", "Yassine", "Mejri", "y.mejri@nexora.tn", "sales_manager"),
    ("usr-006", "Leila", "Hammami", "l.hammami@nexora.tn", "commercial_user"),
    ("usr-007", "Karim", "Dridi", "k.dridi@nexora.tn", "accounting_admin"),
    ("usr-008", "Admin", "Nexora", "admin@nexora.tn", "super_admin"),
]

LOGO_MEDIA_ID = "med-nexora-logo"
LOGO_ASSET = Path(__file__).resolve().parent / "assets" / "nexora-logo.png"

WAREHOUSES = [
    {
        "_id": "wh-001",
        "name": "Entrepôt Principal Tunis",
        "code": "WH-TUN-01",
        "address": "Zone Industrielle La Charguia",
        "city": "Tunis",
        "capacity": 5000,
        "used_capacity": 3420,
        "manager": "Sarra Ben Amor",
        "is_active": True,
        "zones": [
            {"id": "zone-001", "warehouse_id": "wh-001", "name": "Zone Carrelage", "code": "Z-CAR",
             "type": "storage", "capacity": 1500, "used_capacity": 1100, "locations": []},
            {"id": "zone-002", "warehouse_id": "wh-001", "name": "Zone Réception", "code": "Z-REC",
             "type": "receiving", "capacity": 500, "used_capacity": 120, "locations": []},
            {"id": "zone-003", "warehouse_id": "wh-001", "name": "Zone Expédition", "code": "Z-EXP",
             "type": "dispatch", "capacity": 400, "used_capacity": 180, "locations": []},
        ],
    },
    {
        "_id": "wh-002",
        "name": "Entrepôt Sfax",
        "code": "WH-SFX-01",
        "address": "Zone Industrielle Thyna",
        "city": "Sfax",
        "capacity": 3000,
        "used_capacity": 1640,
        "manager": "Mohamed Trabelsi",
        "is_active": True,
        "zones": [
            {"id": "zone-004", "warehouse_id": "wh-002", "name": "Zone Meubles", "code": "Z-MOB",
             "type": "storage", "capacity": 1200, "used_capacity": 860, "locations": []},
            {"id": "zone-005", "warehouse_id": "wh-002", "name": "Zone Sanitaire", "code": "Z-SAN",
             "type": "storage", "capacity": 800, "used_capacity": 520, "locations": []},
        ],
    },
]

SUPPLIERS = [
    {"_id": "sup-001", "name": "Saloni Ceràmica S.A.", "code": "SUP-SAL", "country": "Espagne",
     "city": "Castellón", "contact": "Carlos Miralles", "email": "c.miralles@saloni.com",
     "phone": "+34 964 52 00 00", "performance_score": 88, "reliability_score": 91,
     "avg_lead_time_days": 14, "total_orders": 47, "on_time_delivery_rate": 89,
     "categories": ["Carrelage", "Revêtements"], "is_active": True},
    {"_id": "sup-002", "name": "Porcelanosa Grupo", "code": "SUP-POR", "country": "Espagne",
     "city": "Villarreal", "contact": "Ana García", "email": "ana.garcia@porcelanosa.com",
     "phone": "+34 964 50 00 00", "performance_score": 95, "reliability_score": 97,
     "avg_lead_time_days": 21, "total_orders": 83, "on_time_delivery_rate": 96,
     "categories": ["Faïence", "Carrelage", "Sanitaire"], "is_active": True},
    {"_id": "sup-003", "name": "Roca Sanitario", "code": "SUP-ROC", "country": "Espagne",
     "city": "Gava", "contact": "David Roca", "email": "d.roca@roca.net",
     "phone": "+34 93 508 01 00", "performance_score": 82, "reliability_score": 85,
     "avg_lead_time_days": 10, "total_orders": 134, "on_time_delivery_rate": 84,
     "categories": ["Sanitaire", "Robinetterie"], "is_active": True},
    {"_id": "sup-004", "name": "Meuble Pro Tunis", "code": "SUP-MPT", "country": "Tunisie",
     "city": "Tunis", "contact": "Karim Dridi", "email": "k.dridi@meublepro.tn",
     "phone": "+216 71 850 000", "performance_score": 71, "reliability_score": 68,
     "avg_lead_time_days": 30, "total_orders": 28, "on_time_delivery_rate": 71,
     "categories": ["Meuble SDB", "Meuble Cuisine"], "is_active": True},
    {"_id": "sup-005", "name": "Garofoli Distribution", "code": "SUP-GAR", "country": "Italie",
     "city": "Porto Recanati", "contact": "Marco Belli", "email": "m.belli@garofoli.it",
     "phone": "+39 071 750 0000", "performance_score": 86, "reliability_score": 88,
     "avg_lead_time_days": 25, "total_orders": 19, "on_time_delivery_rate": 87,
     "categories": ["Portes"], "is_active": True},
    {"_id": "sup-006", "name": "Schmidt Distribution", "code": "SUP-SCH", "country": "France",
     "city": "Lyon", "contact": "Claire Dubois", "email": "c.dubois@schmidt.fr",
     "phone": "+33 4 72 00 00 00", "performance_score": 79, "reliability_score": 81,
     "avg_lead_time_days": 45, "total_orders": 12, "on_time_delivery_rate": 78,
     "categories": ["Meuble Cuisine"], "is_active": True},
    {"_id": "sup-007", "name": "Travertino Naturel", "code": "SUP-TRV", "country": "Italie",
     "city": "Tivoli", "contact": "Luca Rossi", "email": "l.rossi@travertino.it",
     "phone": "+39 0774 00 00 00", "performance_score": 90, "reliability_score": 92,
     "avg_lead_time_days": 7, "total_orders": 33, "on_time_delivery_rate": 91,
     "categories": ["Revêtements"], "is_active": True},
]

PRODUCTS = [
    {"_id": "prd-001", "sku": "CER-PLN-30X60-BL", "name": "Carrelage Céramique Plain 30×60 Blanc",
     "category": "Carrelage", "brand": "Saloni", "unit": "m²", "cost_price": 12.5,
     "selling_price": 19.9, "stock": 342, "min_stock": 200, "max_stock": 1000,
     "reorder_point": 250, "status": "in_stock", "ai_risk": "low", "ai_risk_score": 12,
     "warehouse_id": "wh-001", "supplier_id": "sup-001", "lead_time_days": 14,
     "tags": ["céramique", "blanc", "sol"]},
    {"_id": "prd-002", "sku": "FAI-MAR-20X20-GR", "name": "Faïence Marbre 20×20 Gris",
     "category": "Faïence", "brand": "Porcelanosa", "unit": "m²", "cost_price": 22.0,
     "selling_price": 38.5, "stock": 48, "min_stock": 100, "max_stock": 500,
     "reorder_point": 120, "status": "low_stock", "ai_risk": "critical", "ai_risk_score": 92,
     "warehouse_id": "wh-001", "supplier_id": "sup-002", "lead_time_days": 21,
     "tags": ["faïence", "marbre", "gris", "mur"]},
    {"_id": "prd-003", "sku": "SAN-WC-SUS-BL", "name": "WC Suspendu Rimless Blanc",
     "category": "Sanitaire", "brand": "Roca", "unit": "Pièce", "cost_price": 185.0,
     "selling_price": 320.0, "stock": 23, "min_stock": 15, "max_stock": 80,
     "reorder_point": 20, "status": "in_stock", "ai_risk": "medium", "ai_risk_score": 44,
     "warehouse_id": "wh-002", "supplier_id": "sup-003", "lead_time_days": 10,
     "tags": ["sanitaire", "wc", "suspendu"]},
    {"_id": "prd-004", "sku": "MOB-SDB-120-NOY", "name": "Meuble SDB 120cm Noyer",
     "category": "Meuble SDB", "brand": "Ikea Pro", "unit": "Pièce", "cost_price": 420.0,
     "selling_price": 780.0, "stock": 8, "min_stock": 10, "max_stock": 40,
     "reorder_point": 12, "status": "low_stock", "ai_risk": "high", "ai_risk_score": 76,
     "warehouse_id": "wh-002", "supplier_id": "sup-004", "lead_time_days": 30,
     "tags": ["meuble", "sdb", "noyer", "120cm"]},
    {"_id": "prd-005", "sku": "POR-INT-90X210-BL", "name": "Porte Intérieure 90×210 Blanc Laqué",
     "category": "Portes", "brand": "Garofoli", "unit": "Pièce", "cost_price": 310.0,
     "selling_price": 560.0, "stock": 67, "min_stock": 20, "max_stock": 120,
     "reorder_point": 30, "status": "in_stock", "ai_risk": "none", "ai_risk_score": 5,
     "warehouse_id": "wh-001", "supplier_id": "sup-005", "lead_time_days": 25,
     "tags": ["porte", "intérieure", "blanc", "laqué"]},
    {"_id": "prd-006", "sku": "REV-PIS-ANTR-2M", "name": "Revêtement Piscine Antidérapant Anthracite",
     "category": "Revêtements", "brand": "Mapei", "unit": "m²", "cost_price": 35.0,
     "selling_price": 62.0, "stock": 0, "min_stock": 50, "max_stock": 300,
     "reorder_point": 80, "status": "out_of_stock", "ai_risk": "critical", "ai_risk_score": 98,
     "warehouse_id": "wh-001", "supplier_id": "sup-001", "lead_time_days": 18,
     "tags": ["revêtement", "piscine", "antidérapant", "anthracite"]},
    {"_id": "prd-007", "sku": "MOB-CUI-240-CHAS", "name": "Cuisine Modulaire 240cm Chêne Sauvage",
     "category": "Meuble Cuisine", "brand": "Schmidt", "unit": "Module", "cost_price": 890.0,
     "selling_price": 1650.0, "stock": 5, "min_stock": 3, "max_stock": 20,
     "reorder_point": 5, "status": "in_stock", "ai_risk": "medium", "ai_risk_score": 38,
     "warehouse_id": "wh-002", "supplier_id": "sup-006", "lead_time_days": 45,
     "tags": ["cuisine", "chêne", "modulaire"]},
    {"_id": "prd-008", "sku": "DEC-SOL-PAVE-NAT", "name": "Pavé Décoratif Sol Naturel Travertin",
     "category": "Revêtements", "brand": "Travertino", "unit": "m²", "cost_price": 55.0,
     "selling_price": 98.0, "stock": 892, "min_stock": 200, "max_stock": 800,
     "reorder_point": 250, "status": "in_stock", "ai_risk": "none", "ai_risk_score": 3,
     "warehouse_id": "wh-001", "supplier_id": "sup-007", "lead_time_days": 7,
     "tags": ["pavé", "travertin", "sol", "naturel"]},
]

PURCHASE_ORDERS = [
    {"_id": "po-001", "reference": "PO-2026-0891", "supplier_id": "sup-002",
     "supplier_name": "Porcelanosa Grupo", "status": "approved",
     "lines": [{"id": "pol-001", "product_id": "prd-002", "product_name": "Faïence Marbre 20×20 Gris",
                "product_sku": "FAI-MAR-20X20-GR", "quantity": 300, "received_quantity": 0,
                "unit_price": 22.0, "total_price": 6600.0}],
     "total_amount": 6600.0, "ai_recommended": True,
     "notes": "Commande urgente — risque de rupture détecté par IA"},
    {"_id": "po-002", "reference": "PO-2026-0890", "supplier_id": "sup-001",
     "supplier_name": "Saloni Ceràmica", "status": "ordered",
     "lines": [{"id": "pol-002", "product_id": "prd-006", "product_name": "Revêtement Piscine Antidérapant",
                "product_sku": "REV-PIS-ANTR-2M", "quantity": 200, "received_quantity": 0,
                "unit_price": 35.0, "total_price": 7000.0}],
     "total_amount": 7000.0, "ai_recommended": True},
    {"_id": "po-003", "reference": "PO-2026-0885", "supplier_id": "sup-004",
     "supplier_name": "Meuble Pro Tunis", "status": "partial",
     "lines": [{"id": "pol-003", "product_id": "prd-004", "product_name": "Meuble SDB 120cm Noyer",
                "product_sku": "MOB-SDB-120-NOY", "quantity": 15, "received_quantity": 8,
                "unit_price": 420.0, "total_price": 6300.0}],
     "total_amount": 6300.0, "ai_recommended": False},
]

ALERTS = [
    {"_id": "alr-001", "type": "stock", "severity": "critical", "title": "Rupture de stock — Revêtement Piscine",
     "message": "Le produit REV-PIS-ANTR-2M est en rupture totale. Commande en cours (PO-2026-0890).",
     "product_id": "prd-006", "warehouse_id": None, "is_read": False, "is_resolved": False,
     "action_url": "/app/products"},
    {"_id": "alr-002", "type": "ai", "severity": "warning", "title": "IA — Risque rupture Faïence Marbre",
     "message": "Probabilité de rupture à 87% dans 12 jours si aucune commande n'est passée.",
     "product_id": "prd-002", "warehouse_id": None, "is_read": False, "is_resolved": False,
     "action_url": "/app/forecasting"},
    {"_id": "alr-003", "type": "anomaly", "severity": "warning", "title": "Anomalie détectée — Mouvement inhabituel",
     "message": "Sortie de 120 unités de CER-PLN-30X60-BL non justifiée détectée dans WH-TUN-01.",
     "product_id": "prd-001", "warehouse_id": "wh-001", "is_read": False, "is_resolved": False,
     "action_url": "/app/anomalies"},
    {"_id": "alr-004", "type": "purchasing", "severity": "info", "title": "Livraison partielle — Meuble SDB",
     "message": "8/15 unités reçues sur PO-2026-0885. Solde attendu le 10 septembre.",
     "product_id": None, "warehouse_id": None, "is_read": True, "is_resolved": False,
     "action_url": "/app/purchases"},
    {"_id": "alr-005", "type": "stock", "severity": "warning", "title": "Stock bas — Meuble SDB 120cm Noyer",
     "message": "Stock actuel (8 unités) inférieur au minimum (10 unités).",
     "product_id": "prd-004", "warehouse_id": None, "is_read": True, "is_resolved": False,
     "action_url": "/app/products"},
]


def _utcnow() -> datetime:
    """UTC naïf (convention du projet) sans DeprecationWarning (Py 3.12+)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _upsert_many(db, collection: str, docs: list[dict]) -> None:
    """Upsert filtré par _id — n'écrase que les documents de démo connus."""
    for doc in docs:
        await db[collection].replace_one({"_id": doc["_id"]}, doc, upsert=True)


async def _movement_history(db, products: list[dict], rng: random.Random) -> int:
    """Génère ~6 mois d'historique de mouvements (si le journal est vide)."""
    if await db["movements"].count_documents({}) > 0:
        return 0
    user_id = "usr-002"
    movements = []
    today = _utcnow()
    for product in products:
        wh = product["warehouse_id"]
        for day in range(175, -1, -3):
            date = today - timedelta(days=day)
            # Entrées de réapprovisionnement
            if rng.random() < 0.18:
                qty = rng.randint(20, 120)
                movements.append({
                    "_id": f"mov-seed-{product['_id']}-in-{day}",
                    "product_id": product["_id"], "warehouse_id": wh, "type": "in",
                    "quantity": qty, "delta": qty, "previous_stock": 0, "new_stock": qty,
                    "reason": "Réapprovisionnement", "reference": None,
                    "user_id": user_id, "username": "Sarra Ben Amor", "status": "applied",
                    "sync_status": "synced", "created_at": date,
                })
            # Sorties client régulières
            if rng.random() < 0.55:
                qty = max(1, int(rng.gauss(18, 6)))
                movements.append({
                    "_id": f"mov-seed-{product['_id']}-out-{day}",
                    "product_id": product["_id"], "warehouse_id": wh, "type": "out",
                    "quantity": qty, "delta": -qty, "previous_stock": 0, "new_stock": 0,
                    "reason": "Vente client", "reference": None,
                    "user_id": user_id, "username": "Sarra Ben Amor", "status": "applied",
                    "sync_status": "synced", "created_at": date,
                })
    if movements:
        await db["movements"].insert_many(movements)
    return len(movements)


async def seed_company_settings(db, now: datetime) -> bool:
    """Crée les paramètres société UNE SEULE FOIS (jamais réécrits après).

    Raison sociale « Nexora » + logo officiel copié dans le stockage média
    géré par le backend (référence stable media_id — jamais une URL blob).
    Les autres informations légales restent vides : elles sont saisies par
    l'administrateur dans Paramètres → Société (aucune donnée inventée).
    """
    existing = await db[COL_COMPANY_SETTINGS].find_one({"_id": SETTINGS_ID})
    if existing:
        return False  # non destructif : les choix de l'administrateur sont préservés

    logo_id = None
    if LOGO_ASSET.exists():
        root = media_root()
        dest = root / f"{LOGO_MEDIA_ID}.png"
        shutil.copyfile(LOGO_ASSET, dest)
        media_doc = {
            "_id": LOGO_MEDIA_ID,
            "filename": "nexora-logo.png",
            "content_type": "image/png",
            "size": dest.stat().st_size,
            "extension": ".png",
            "url": f"/api/v1/media/{LOGO_MEDIA_ID}/file",
            "uploaded_by": "usr-001",
            "uploaded_by_name": "Aziz Sakly",
            "created_at": now,
        }
        await db[COL_MEDIA].update_one(
            {"_id": LOGO_MEDIA_ID}, {"$setOnInsert": media_doc}, upsert=True
        )
        logo_id = LOGO_MEDIA_ID

    doc = {
        **DEFAULT_SETTINGS,
        "company_name": "Nexora",
        "logo_media_id": logo_id,
        "updated_at": now,
        "updated_by": "usr-001",
    }
    await db[COL_COMPANY_SETTINGS].insert_one(doc)
    return True


async def seed(force: bool, db=None) -> None:
    if db is None:
        get_settings()
        db = get_client()[get_settings().mongodb_database]
    await ensure_indexes(db)

    existing = await db["products"].count_documents({})
    if existing and not force:
        print(f"✅ Des produits existent déjà ({existing}) — seed ignoré (utilisez --force pour ré-amorcer).")
        return

    rng = random.Random(42)  # déterministe
    now = _utcnow()

    password_hash = hash_password(DEMO_PASSWORD)
    users = [
        {
            "_id": uid, "first_name": fn, "last_name": ln, "email": email, "phone": None,
            "role": role, "company": "Nexora",
            "password_hash": password_hash,
            "avatar": f"{fn[0]}{ln[0]}".upper(),
            "created_at": datetime(2023, 1, 15), "last_login": now, "is_active": True,
        }
        for uid, fn, ln, email, role in USERS
    ]

    categories = [{"_id": f"cat-{i+1:03d}", "name": name}
                  for i, name in enumerate(sorted({p["category"] for p in PRODUCTS}))]
    brands = [{"_id": f"brd-{i+1:03d}", "name": name}
              for i, name in enumerate(sorted({p["brand"] for p in PRODUCTS}))]

    products = []
    for p in PRODUCTS:
        doc = {**p, "image": None, "description": None, "name_ar": None,
               "created_at": datetime(2023, 6, 1), "updated_at": now}
        products.append(doc)

    stock_items = []
    for p in products:
        stock_items.append({
            "_id": f"stk-{p['_id']}", "product_id": p["_id"], "warehouse_id": p["warehouse_id"],
            "location_id": None, "qty": p["stock"], "version": 1,
            "min_stock": p["min_stock"], "max_stock": p["max_stock"],
            "reorder_point": p["reorder_point"], "created_at": now, "updated_at": now,
        })

    pos = []
    for po in PURCHASE_ORDERS:
        pos.append({**po, "expected_delivery": now + timedelta(days=14),
                    "created_at": now - timedelta(days=3), "updated_at": now,
                    "created_by": "usr-004", "approved_by": "usr-001"})

    alerts = [{**a, "created_at": now - timedelta(days=1)} for a in ALERTS]

    await _upsert_many(db, "users", users)
    await _upsert_many(db, "warehouses", WAREHOUSES)
    await _upsert_many(db, "suppliers", SUPPLIERS)
    await _upsert_many(db, "categories", categories)
    await _upsert_many(db, "brands", brands)
    await _upsert_many(db, "products", products)
    await _upsert_many(db, "stock_items", stock_items)
    await _upsert_many(db, "purchase_orders", pos)
    await _upsert_many(db, "alerts", alerts)

    n_moves = await _movement_history(db, products, rng)
    settings_created = await seed_company_settings(db, now)
    print(f"✅ Seed terminé : {len(users)} utilisateurs (mdp démo {DEMO_PASSWORD}), "
          f"{len(products)} produits, {len(WAREHOUSES)} entrepôts, {len(SUPPLIERS)} fournisseurs, "
          f"{len(pos)} commandes, {len(alerts)} alertes, {n_moves} mouvements d'historique.")
    if settings_created:
        print("✅ Paramètres société créés : raison sociale « Nexora » + logo officiel "
              "(stocké côté backend, utilisé par les documents imprimables).")
    print("ℹ️  Aucune donnée n'a été supprimée — upserts filtrés par _id uniquement.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Amorçage démo Nexora Smart Stock AI")
    parser.add_argument("--force", action="store_true", help="Ré-amorce les documents de démo (upsert)")
    args = parser.parse_args()
    asyncio.run(seed(force=args.force))
