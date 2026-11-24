"""Fixtures pytest communes."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.events import event_bus  # noqa: E402
from tests.fakes import FakeDatabase  # noqa: E402


@pytest.fixture(autouse=True)
def _silent_events(monkeypatch: pytest.MonkeyPatch) -> None:
    """Neutralise le bus d'événements (pas de MongoDB réel en tests unitaires)."""

    async def _noop(event: str, data: dict) -> None:
        return None

    monkeypatch.setattr(event_bus, "publish", _noop)


@pytest.fixture
def fake_db() -> FakeDatabase:
    return FakeDatabase()


@pytest.fixture
def demo_user() -> dict:
    return {"id": "usr-002", "first_name": "Sarra", "last_name": "Ben Amor", "role": "stock_manager"}
