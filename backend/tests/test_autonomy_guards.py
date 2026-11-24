"""Garde-fous d'AUTONOMIE — la plateforme est 100 % autonome.

Exigence forte du projet : AUCUNE liaison avec Sage (ou tout autre ERP :
Odoo, SAP, Dynamics…), AUCUN retour du CMS Payload.

Ce test balaie :
  • le code source backend   (app/**/*.py)
  • le code source frontend  (frontend/src/**/*.{ts,tsx})
  • les manifestes de dépendances (pyproject.toml, frontend/package.json)

et échoue si l'un de ces motifs réapparaît. La documentation (README, docs/)
est volontairement exclue : elle raconte l'historique de la suppression.

L'endpoint /api/v1/health doit en outre déclarer publiquement l'autonomie
(`autonomous: true`, `external_integrations: []`).
"""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_APP = Path(__file__).resolve().parents[1] / "app"
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"
PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"
PACKAGE_JSON = PROJECT_ROOT / "frontend" / "package.json"

# ── Motifs interdits dans le CODE backend ────────────────────────────────
# (« message » ne déclenche rien : les motifs sont délimités par \b.)
BACKEND_FORBIDDEN: tuple[tuple[str, str], ...] = (
    (r"(?i)\bsage\b", "liaison Sage"),
    (r"(?i)\bodoo\b", "liaison Odoo"),
    (r"(?i)\bsap\b", "liaison SAP"),
    (r"(?i)\berp\b", "intégration ERP"),
    (r"(?i)dynamics\s*365", "liaison Dynamics 365"),
    (r"(?i)@payloadcms", "dépendance Payload CMS"),
    (r"(?i)payload\.config", "configuration Payload CMS"),
    (r"(?i)payload-types", "types générés Payload CMS"),
    (r"(?i)getPayload\s*\(", "API Payload CMS"),
    (r"(?i)\bimport\s+payload\b", "import Payload CMS"),
    (r"(?i)\bfrom\s+payload\b", "import Payload CMS"),
)

# ── Motifs interdits dans le CODE frontend ───────────────────────────────
# Le mot « ERP » est toléré côté frontend : l'interface affiche des énoncés
# d'indépendance (« sans dépendance à un ERP externe »), ce qui est voulu.
FRONTEND_FORBIDDEN: tuple[tuple[str, str], ...] = (
    (r"(?i)\bsage\b", "liaison Sage"),
    (r"(?i)\bodoo\b", "liaison Odoo"),
    (r"(?i)\bsap\b", "liaison SAP"),
    (r"(?i)dynamics\s*365", "liaison Dynamics 365"),
    (r"(?i)@payloadcms", "dépendance Payload CMS"),
    (r"(?i)payload-types", "types générés Payload CMS"),
    (r"(?i)getPayload\s*\(", "API Payload CMS"),
    (r"(?i)from\s+[\"']payload[\"']", "import Payload CMS"),
    (r"(?i)\berp[A-Z]\w*(client|sync|connector|api|service)", "module d'intégration ERP"),
    (r"(?i)\b(sage|erp)[A-Z]\w*(Client|Connector|Sync|Service|Api)\b", "module d'intégration Sage/ERP"),
)

# ── Jetons interdits dans les DÉPENDANCES déclarées ──────────────────────
MANIFEST_FORBIDDEN_TOKENS = ("sage", "odoo", "payload", "erp", "sap")


def _python_files() -> list[Path]:
    return sorted(BACKEND_APP.rglob("*.py"))


def _frontend_files() -> list[Path]:
    files: list[Path] = []
    for pattern in ("*.ts", "*.tsx"):
        files.extend(FRONTEND_SRC.rglob(pattern))
    return sorted(files)


def _violations(files: list[Path], patterns: tuple[tuple[str, str], ...], base: Path) -> list[str]:
    found: list[str] = []
    for path in files:
        content = path.read_text(encoding="utf-8")
        for pattern, label in patterns:
            for match in re.finditer(pattern, content):
                line = content.count("\n", 0, match.start()) + 1
                found.append(f"{path.relative_to(base)}:{line} → {label} ({match.group(0)!r})")
    return found


def test_no_sage_erp_payload_in_backend_source() -> None:
    violations = _violations(_python_files(), BACKEND_FORBIDDEN, BACKEND_APP)
    assert not violations, "Liaisons interdites détectées dans le backend :\n" + "\n".join(violations)


def test_no_sage_erp_payload_in_frontend_source() -> None:
    assert FRONTEND_SRC.exists(), "frontend/src introuvable — arborescence inattendue"
    violations = _violations(_frontend_files(), FRONTEND_FORBIDDEN, FRONTEND_SRC)
    assert not violations, "Liaisons interdites détectées dans le frontend :\n" + "\n".join(violations)


def _pyproject_dependency_strings() -> list[str]:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    deps: list[str] = list(data.get("project", {}).get("dependencies", []) or [])
    optional = data.get("project", {}).get("optional-dependencies", {}) or {}
    for group in optional.values():
        deps.extend(group)
    deps.extend(data.get("build-system", {}).get("requires", []) or [])
    return deps


def _package_json_dependency_strings() -> list[str]:
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    deps: list[str] = []
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        deps.extend(f"{name}@{spec}" for name, spec in (data.get(section, {}) or {}).items())
    return deps


def test_no_sage_erp_payload_in_declared_dependencies() -> None:
    violations: list[str] = []
    for dep in _pyproject_dependency_strings() + _package_json_dependency_strings():
        token = dep.lower()
        for forbidden in MANIFEST_FORBIDDEN_TOKENS:
            if forbidden in token:
                violations.append(f"dépendance {dep!r} contient {forbidden!r}")
    assert not violations, "Dépendances interdites détectées :\n" + "\n".join(violations)


def test_health_declares_full_autonomy(fake_db) -> None:
    """L'endpoint public /health proclame l'autonomie de la plateforme."""
    from app.core.db import get_database
    from app.main import create_app

    app = create_app()
    app.state.db = fake_db  # bypass lifespan (pas de MongoDB réel en tests)
    app.dependency_overrides[get_database] = lambda: fake_db
    client = TestClient(app)

    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["autonomous"] is True
    assert body["external_integrations"] == []
    assert "autonome" in body["mode"].lower()
