"""Numérotation des documents commerciaux — atomique et sans doublon.

Chaque type de document possède un compteur par année dans la collection
`document_sequences`. L'incrément utilise `find_one_and_update` avec
`$inc` + upsert : sous requêtes concurrentes MongoDB garantit un numéro
unique. Un numéro n'est JAMAIS réutilisé (même pour un document annulé).
"""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.models.fields import COL_SEQUENCES, now
from app.services.company_service import numbering_config


async def next_number(
    db: AsyncDatabase[dict[str, Any]], doc_type: str, *, with_year: bool = True
) -> str:
    """Retourne le prochain numéro, ex. `DEV-2026-0001`."""
    cfg = await numbering_config(db, doc_type)
    year = now().year
    prefix = cfg.get("prefix") or doc_type.upper()
    digits = int(cfg.get("digits", 4))
    seq_id = f"{doc_type}:{year}" if with_year else f"{doc_type}:all"
    doc = await db[COL_SEQUENCES].find_one_and_update(
        {"_id": seq_id},
        {"$inc": {"seq": 1}, "$set": {"updated_at": now()},
         "$setOnInsert": {"doc_type": doc_type, "year": year if with_year else None, "created_at": now()}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = int(doc.get("seq", 1))
    if with_year:
        return f"{prefix}-{year}-{seq:0{digits}d}"
    return f"{prefix}-{seq:0{digits}d}"
