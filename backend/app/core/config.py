"""Configuration applicative (pydantic-settings).

Toutes les valeurs surchargent le fichier `.env` à la racine du backend.
Aucun secret n'est codé en dur.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Nexora Smart Stock AI API"
    app_version: str = "1.0.0"
    debug: bool = False

    # ── MongoDB ──────────────────────────────────────────────
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    mongodb_database: str = "nexora"
    # Garde-fou : refus explicite des bases système de MongoDB.
    mongodb_database_forbidden: tuple[str, ...] = ("admin", "local", "config")

    # ── JWT ──────────────────────────────────────────────────
    jwt_secret: str = "dev-only-secret-change-me-0123456789-abcdefghijklmnopqrstuvwxyz"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # ── CORS ─────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ── Média (images produits) ──────────────────────────────
    media_dir: str = ""

    # ── Worker ───────────────────────────────────────────────
    worker_embedded: bool = False
    worker_poll_interval: float = 2.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate(self) -> None:
        """Validation de sécurité au démarrage."""
        if self.mongodb_database.lower() in self.mongodb_database_forbidden:
            raise ValueError(
                f"Base MongoDB interdite ({self.mongodb_database!r}) : utilisez une base dédiée "
                "comme 'nexora'."
            )
        if self.jwt_secret.startswith("dev-only-secret") and not self.debug:
            # En dev local on tolère la valeur par défaut, en production non.
            import warnings

            warnings.warn(
                "JWT_SECRET est la valeur par défaut — à changer impérativement en production.",
                stacklevel=1,
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate()
    return settings
