"""WebSocket temps réel — mouvements de stock et alertes.

Connexion : ws://host/api/v1/ws?token=<access_token JWT>
Événements diffusés : movement.created, alert.created, job.completed.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.security.jwt_tokens import ACCESS_TOKEN_TYPE, decode_token

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Connexions WS authentifiées + boucles d'envoi individuelles."""

    def __init__(self) -> None:
        self._queues: dict[WebSocket, asyncio.Queue] = {}
        self._users: dict[WebSocket, str] = {}

    @property
    def active_count(self) -> int:
        return len(self._queues)

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self._queues[websocket] = asyncio.Queue(maxsize=128)
        self._users[websocket] = user_id

    def disconnect(self, websocket: WebSocket) -> None:
        self._queues.pop(websocket, None)
        self._users.pop(websocket, None)

    def user_of(self, websocket: WebSocket) -> str | None:
        return self._users.get(websocket)

    async def broadcast(self, message: dict) -> None:
        for websocket, queue in list(self._queues.items()):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                logger.warning("Client WS saturé — déconnecté.")
                self.disconnect(websocket)

    async def sender_loop(self, websocket: WebSocket) -> None:
        queue = self._queues[websocket]
        while True:
            message = await queue.get()
            await websocket.send_json(message)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")) -> None:
    """Authentifie par jeton d'accès puis diffuse les événements temps réel."""
    try:
        payload = decode_token(token, ACCESS_TOKEN_TYPE)
        user_id = str(payload.get("sub", ""))
    except Exception:  # noqa: BLE001 — jeton invalide → fermeture propre
        await websocket.close(code=4401)
        return

    await manager.connect(websocket, user_id)
    sender = asyncio.create_task(manager.sender_loop(websocket))
    try:
        while True:
            # Le serveur n'attend que des pings clients / fermetures.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        manager.disconnect(websocket)


def bridge_event_bus() -> None:
    """Ponte bus d'événements → diffusion WebSocket (lancée au démarrage)."""
    from app.services.events import event_bus

    async def _pump() -> None:
        queue = event_bus.subscribe()
        while True:
            message = await queue.get()
            await manager.broadcast(message)

    asyncio.create_task(_pump())
