"""Accès aux données MongoDB (dépôts génériques)."""

from .base import MongoRepository, PaginatedResult

__all__ = ["MongoRepository", "PaginatedResult"]
