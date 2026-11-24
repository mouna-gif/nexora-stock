"""RBAC — 8 rôles métier appliqués CÔTÉ SERVEUR.

Les rôles correspondent exactement au type `UserRole` du frontend :
  super_admin, owner_ceo, stock_manager, warehouse_employee,
  purchasing_manager, sales_manager, commercial_user, accounting_admin.

Chaque route est protégée par une permission fine (`ressource:action`).
Le frontend peut masquer des boutons, mais JAMAIS décider des droits :
la vérification fait foi ici.
"""

from __future__ import annotations

from app.core.errors import DomainError

READ_ALL = {
    "products:read",
    "suppliers:read",
    "warehouses:read",
    "inventory:read",
    "purchasing:read",
    "alerts:read",
    "analytics:read",
    "sales:read",
    "customers:read",
    "settings:read",
    "audit:read",
}

PERMISSIONS: dict[str, set[str]] = {
    "super_admin": {"*"},
    "owner_ceo": READ_ALL
    | {
        "users:manage",
        "purchasing:approve",
        "purchasing:write",
        "purchasing:invoice",
        "sales:write",
        "sales:invoice",
        "customers:write",
        "payments:write",
        "alerts:write",
        "ai:use",
        "settings:write",
    },
    "stock_manager": READ_ALL
    | {
        "products:write",
        "catalog:write",
        "warehouses:manage",
        "inventory:move",
        "inventory:adjust",
        "purchasing:write",
        "sales:deliver",
        "alerts:write",
        "ai:use",
    },
    "warehouse_employee": {
        "products:read",
        "warehouses:read",
        "inventory:read",
        "inventory:move",
        "sales:read",
        "sales:deliver",
        "alerts:read",
    },
    "purchasing_manager": READ_ALL
    | {
        "suppliers:write",
        "purchasing:write",
        "purchasing:approve",
        "purchasing:invoice",
        "alerts:write",
        "ai:use",
    },
    "sales_manager": READ_ALL
    | {"sales:write", "sales:invoice", "customers:write", "ai:use"},
    "commercial_user": {
        "products:read",
        "warehouses:read",
        "inventory:read",
        "alerts:read",
        "sales:read",
        "customers:read",
        "customers:write",
        "sales:write",
    },
    "accounting_admin": READ_ALL | {"sales:invoice", "purchasing:invoice", "payments:write"},
}

ROLE_LABELS: dict[str, str] = {
    "super_admin": "Super administrateur",
    "owner_ceo": "PDG / Propriétaire",
    "stock_manager": "Responsable de stock",
    "warehouse_employee": "Employé d'entrepôt",
    "purchasing_manager": "Responsable achats",
    "sales_manager": "Responsable commercial",
    "commercial_user": "Utilisateur commercial",
    "accounting_admin": "Administrateur comptabilité",
}

ALL_ROLES: tuple[str, ...] = (
    "super_admin",
    "owner_ceo",
    "stock_manager",
    "warehouse_employee",
    "purchasing_manager",
    "sales_manager",
    "commercial_user",
    "accounting_admin",
)


def role_can(role: str, permission: str) -> bool:
    """Vérifie qu'un rôle détient une permission."""
    perms = PERMISSIONS.get(role)
    if not perms:
        return False
    return "*" in perms or permission in perms


def require_role_permission(role: str, permission: str) -> None:
    """Lève une erreur 403 si le rôle n'a pas la permission."""
    if not role_can(role, permission):
        raise DomainError(
            403,
            "permission_denied",
            "Permission refusée : votre rôle ne permet pas cette action.",
        )
