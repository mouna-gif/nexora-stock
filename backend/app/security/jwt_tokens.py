"""Jetons JWT — accès court + refresh token sécurisé (rotation, révocation).

  • Access token  : durée de vie courte (15 min), sans état serveur.
  • Refresh token : 7 jours, stocké uniquement haché (SHA-256) dans la
    collection `refresh_tokens`, révocable, rotation à chaque usage.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings
from app.core.errors import DomainError

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: str, role: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "role": role,
        "type": ACCESS_TOKEN_TYPE,
        "iat": _now(),
        "exp": _now() + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    """Retourne (jeton, jti, date_d'expiration)."""
    settings = get_settings()
    jti = uuid.uuid4().hex
    expires_at = _now() + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "jti": jti,
        "type": REFRESH_TOKEN_TYPE,
        "iat": _now(),
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_token(token: str, expected_type: str) -> dict:
    """Décode et valide un jeton. Lève DomainError(401) si invalide."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise DomainError(401, "token_expired", "Jeton expiré.") from exc
    except jwt.InvalidTokenError as exc:
        raise DomainError(401, "invalid_token", "Jeton invalide.") from exc
    if payload.get("type") != expected_type:
        raise DomainError(401, "invalid_token_type", "Type de jeton invalide.")
    return payload


def hash_refresh_token(token: str) -> str:
    """Empreinte stockée en base (le jeton brut ne quitte jamais la réponse HTTP)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
