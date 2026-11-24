"""Service de paramètres société — document unique `_id: "main"`.

AUCUNE valeur légale n'est inventée : tant que l'administrateur n'a pas
saisi les informations officielles (raison sociale, MF, adresse…), les
champs restent vides. Ces données alimentent les documents imprimables.
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import DomainError
from app.models.fields import COL_COMPANY_SETTINGS, now
from app.schemas.base import serialize
from app.schemas.commercial import CompanySettings, CompanySettingsUpdate

SETTINGS_ID = "main"

# Numérotation par défaut (préfixes modifiables par l'administrateur).
DEFAULT_NUMBERING: dict[str, dict[str, Any]] = {
    "sales_quotation": {"prefix": "DEV", "digits": 4},
    "sales_order": {"prefix": "CMD", "digits": 4},
    "delivery_note": {"prefix": "BL", "digits": 4},
    "customer_invoice": {"prefix": "FAC", "digits": 4},
    "customer_payment": {"prefix": "REC", "digits": 4},
    "supplier_quotation": {"prefix": "DF", "digits": 4},
    "purchase_order": {"prefix": "PO", "digits": 4},
    "goods_receipt": {"prefix": "BR", "digits": 4},
    "supplier_invoice": {"prefix": "FF", "digits": 4},
    "supplier_payment": {"prefix": "REG", "digits": 4},
    "customer": {"prefix": "CLI", "digits": 4},
}

DEFAULT_SETTINGS: dict[str, Any] = {
    "_id": SETTINGS_ID,
    "company_name": "",
    "legal_form": "",
    "address": "",
    "city": "",
    "country": "Tunisie",
    "phone": "",
    "email": "",
    "website": "",
    "tax_id": "",
    "customs_code": "",
    "currency": "TND",
    "default_tax_rate": 19.0,
    "payment_terms_days": 30,
    "bank_name": "",
    "bank_rib": "",
    "bank_iban": "",
    "footer_legal": "",
    "logo_media_id": None,
    "numbering": {},
    "updated_at": None,
    "updated_by": None,
}


async def get_settings_doc(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    doc = await db[COL_COMPANY_SETTINGS].find_one({"_id": SETTINGS_ID})
    if not doc:
        doc = dict(DEFAULT_SETTINGS)
        await db[COL_COMPANY_SETTINGS].insert_one(doc)
    return doc


async def get_company_settings(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    """Paramètres publics utilisés par les documents (fusionnés avec défauts)."""
    doc = await get_settings_doc(db)
    merged = {**{k: v for k, v in DEFAULT_SETTINGS.items() if k != "_id"},
              **{k: v for k, v in doc.items() if k != "_id" and v is not None}}
    numbering = {**DEFAULT_NUMBERING, **(doc.get("numbering") or {})}
    merged["numbering"] = numbering
    return serialize(CompanySettings, merged)


async def numbering_config(db: AsyncDatabase[dict[str, Any]], doc_type: str) -> dict[str, Any]:
    settings = await db[COL_COMPANY_SETTINGS].find_one({"_id": SETTINGS_ID})
    custom = (settings or {}).get("numbering") or {}
    cfg = {**DEFAULT_NUMBERING.get(doc_type, {"prefix": doc_type.upper()[:6], "digits": 4}),
           **(custom.get(doc_type) or {})}
    return cfg


async def get_commercial_defaults(db: AsyncDatabase[dict[str, Any]]) -> dict[str, Any]:
    """Valeurs commerciales internes (devise, TVA par défaut, délais)."""
    doc = await db[COL_COMPANY_SETTINGS].find_one({"_id": SETTINGS_ID}) or {}
    try:
        tax = float(doc.get("default_tax_rate") if doc.get("default_tax_rate") is not None else 19.0)
    except (TypeError, ValueError):
        tax = 19.0
    return {
        "currency": doc.get("currency") or "TND",
        "default_tax_rate": tax,
        "payment_terms_days": int(doc.get("payment_terms_days") or 30),
    }


async def update_company_settings(
    db: AsyncDatabase[dict[str, Any]],
    payload: dict[str, Any],
    user: dict[str, Any],
) -> dict[str, Any]:
    await get_settings_doc(db)  # ensure singleton exists
    fields = {k: v for k, v in payload.items() if k != "numbering" and v is not None}
    update: dict[str, Any] = {"$set": {**fields, "updated_at": now(), "updated_by": user["id"]}}
    numbering = payload.get("numbering")
    if numbering:
        clean: dict[str, dict[str, Any]] = {}
        for doc_type, cfg in numbering.items():
            if doc_type not in DEFAULT_NUMBERING:
                raise DomainError(422, "unknown_doc_type", f"Type de document inconnu : {doc_type}.")
            entry: dict[str, Any] = {}
            if cfg.get("prefix"):
                entry["prefix"] = str(cfg["prefix"]).strip().upper()[:8]
            if cfg.get("digits"):
                entry["digits"] = max(2, min(8, int(cfg["digits"])))
            if entry:
                clean[doc_type] = entry
        update["$set"]["numbering"] = clean
    doc = await db[COL_COMPANY_SETTINGS].find_one_and_update(
        {"_id": SETTINGS_ID}, update, return_document=ReturnDocument.AFTER, upsert=True
    )
    return await get_company_settings(db)
