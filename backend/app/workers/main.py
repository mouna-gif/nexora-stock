"""Boucle du worker — claim atomique des jobs et exécution.

Lancement en process séparé (production) :
    python -m app.workers.main
Lancement embarqué (dev) : WORKER_EMBEDDED=true dans .env du backend.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal

from app.core.config import get_settings
from app.core.db import ensure_indexes, get_database, ping
from app.models.fields import COL_AI_JOBS, now
from app.workers.jobs import run_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("worker")

_stop = asyncio.Event()


def _handle_signal() -> None:
    _stop.set()


async def claim_job(db) -> dict | None:
    """Claim atomique : queued → running (un seul worker gagne)."""
    return await db[COL_AI_JOBS].find_one_and_update(
        {"status": "queued"},
        {"$set": {"status": "running", "claimed_at": now()}, "$inc": {"attempts": 1}},
        sort=[("created_at", 1)],
    )


async def worker_loop() -> None:
    settings = get_settings()
    db = get_database()
    if not await ping():
        logger.warning("MongoDB injoignable — nouvelle tentative au prochain cycle.")
    else:
        await ensure_indexes(db)
    logger.info("Worker démarré (poll=%.1fs, base=%s).", settings.worker_poll_interval, db.name)

    while not _stop.is_set():
        try:
            job = await claim_job(db)
            if job:
                await run_job(db, job)
                continue  # enchaîne immédiatement sur le job suivant
        except Exception:  # noqa: BLE001
            logger.exception("Erreur dans la boucle du worker.")
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(_stop.wait(), timeout=settings.worker_poll_interval)

    logger.info("Worker arrêté proprement.")


def main() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, _handle_signal)
    try:
        loop.run_until_complete(worker_loop())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
