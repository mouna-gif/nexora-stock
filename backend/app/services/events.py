"""Bus d'événements en mémoire pour le temps réel (WebSocket).

Le processus API publie les événements (mouvements, alertes, jobs) et le
routeur WebSocket les diffuse aux clients connectés. Les événements sont
également journalisés dans la collection `events` (traçabilité).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.db import get_database
from app.models.fields import COL_EVENTS, new_id, now

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self) -> None:
        self._listeners: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        self._listeners.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._listeners.discard(queue)

    async def publish(self, event: str, data: dict[str, Any]) -> None:
        """Diffuse un événement aux abonnés + trace en base."""
        payload = {"event": event, "data": data, "ts": now().isoformat()}
        for queue in list(self._listeners):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning("Abonné WebSocket saturé — événement %s ignoré.", event)
        try:
            db = get_database()
            await db[COL_EVENTS].insert_one(
                {"_id": new_id("evt"), **payload}
            )
        except Exception:  # noqa: BLE001 — la trace ne doit jamais casser le métier
            logger.debug("Traçabilité événement indisponible (MongoDB hors ligne ?).")


event_bus = EventBus()
