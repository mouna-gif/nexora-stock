"""Tests sécurité : mots de passe bcrypt + JWT (accès court / refresh)."""

from __future__ import annotations

import pytest

from app.core.errors import DomainError
from app.security.jwt_tokens import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_refresh_token,
)
from app.security.passwords import hash_password, verify_password


def test_password_hash_roundtrip() -> None:
    h = hash_password("Demo1234!")
    assert h != "Demo1234!"
    assert verify_password("Demo1234!", h)
    assert not verify_password("wrong-password", h)


def test_password_too_short_rejected() -> None:
    with pytest.raises(ValueError):
        hash_password("court")


def test_access_token_roundtrip() -> None:
    token = create_access_token("usr-001", "owner_ceo")
    payload = decode_token(token, "access")
    assert payload["sub"] == "usr-001"
    assert payload["role"] == "owner_ceo"


def test_access_token_expiry_is_short() -> None:
    from app.core.config import get_settings

    settings = get_settings()
    token = create_access_token("usr-001", "stock_manager")
    payload = decode_token(token, "access")
    lifetime = payload["exp"] - payload["iat"]
    assert lifetime <= settings.access_token_expire_minutes * 60


def test_refresh_token_has_jti() -> None:
    token, jti, expires = create_refresh_token("usr-001")
    payload = decode_token(token, "refresh")
    assert payload["jti"] == jti
    assert expires is not None


def test_wrong_token_type_rejected() -> None:
    access = create_access_token("usr-001", "owner_ceo")
    with pytest.raises(DomainError) as exc:
        decode_token(access, "refresh")
    assert exc.value.code == "invalid_token_type"


def test_tampered_token_rejected() -> None:
    token = create_access_token("usr-001", "owner_ceo") + "x"
    with pytest.raises(DomainError):
        decode_token(token, "access")


def test_refresh_token_never_stored_in_clear() -> None:
    token, _, _ = create_refresh_token("usr-001")
    digest = hash_refresh_token(token)
    assert digest != token
    assert len(digest) == 64
