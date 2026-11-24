"""Tests de la matrice RBAC (8 rôles)."""

from __future__ import annotations

import pytest

from app.security.rbac import ALL_ROLES, PERMISSIONS, role_can


def test_eight_roles_defined() -> None:
    assert len(ALL_ROLES) == 8
    assert len(PERMISSIONS) == 8


def test_super_admin_is_wildcard() -> None:
    assert role_can("super_admin", "anything:at:all")
    assert role_can("super_admin", "users:manage")


def test_owner_ceo_manages_users_and_approves() -> None:
    assert role_can("owner_ceo", "users:manage")
    assert role_can("owner_ceo", "purchasing:approve")
    assert role_can("owner_ceo", "analytics:read")


def test_warehouse_employee_can_move_but_not_adjust() -> None:
    assert role_can("warehouse_employee", "inventory:move")
    assert not role_can("warehouse_employee", "inventory:adjust")
    assert not role_can("warehouse_employee", "products:write")


def test_purchasing_manager_cannot_move_stock() -> None:
    assert role_can("purchasing_manager", "purchasing:approve")
    assert not role_can("purchasing_manager", "inventory:move")
    assert role_can("purchasing_manager", "suppliers:write")


def test_commercial_user_is_read_only() -> None:
    for perm in ("products:read", "inventory:read", "alerts:read"):
        assert role_can("commercial_user", perm)
    for perm in ("products:write", "inventory:move", "users:manage", "purchasing:write"):
        assert not role_can("commercial_user", perm)


def test_accounting_admin_reads_everything_but_writes_nothing() -> None:
    assert role_can("accounting_admin", "purchasing:read")
    assert role_can("accounting_admin", "analytics:read")
    assert not role_can("accounting_admin", "inventory:move")
    assert not role_can("accounting_admin", "products:write")


def test_unknown_role_denied() -> None:
    assert not role_can("role_fantome", "products:read")


@pytest.mark.parametrize(
    "role,perm,expected",
    [
        ("stock_manager", "inventory:adjust", True),
        ("stock_manager", "users:manage", False),
        ("sales_manager", "ai:use", True),
        ("sales_manager", "inventory:move", False),
    ],
)
def test_matrix_samples(role: str, perm: str, expected: bool) -> None:
    assert role_can(role, perm) is expected
