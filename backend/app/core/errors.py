"""Erreurs métier partagées."""

from __future__ import annotations


class DomainError(Exception):
    """Erreur métier attendue, traduite en réponse HTTP JSON homogène.

    Le frontend lit `error` (code machine) et `message` (texte FR).
    """

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def not_found(resource: str, resource_id: str) -> DomainError:
    return DomainError(404, "not_found", f"{resource} introuvable : {resource_id}")


def invalid_credentials() -> DomainError:
    return DomainError(401, "invalid_credentials", "Email ou mot de passe incorrect.")


def insufficient_stock(product_sku: str, available: int, requested: int) -> DomainError:
    return DomainError(
        409,
        "insufficient_stock",
        f"Stock insuffisant pour {product_sku} : {available} disponible(s), {requested} demandé(s).",
    )


def conflict(code: str, message: str) -> DomainError:
    return DomainError(409, code, message)
