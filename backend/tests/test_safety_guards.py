"""Garde-fous : le code source ne doit JAMAIS contenir d'opérations
destructives MongoDB (exigence forte du projet).

Interdits :
  • drop_database / client.drop_database
  • drop_collection / collection.drop()
  • delete_many / delete_one non filtrés ({} ou sans argument)
  • rename_collection
Ce test balaie tout app/ et échoue si l'un de ces motifs réapparaît.
"""

from __future__ import annotations

import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"

# Motifs d'APPELS destructifs (avec parenthèses) — la documentation
# mentionnant ces interdits ne doit pas déclencher le garde-fou.
FORBIDDEN_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"drop_database\s*\(", "suppression de base"),
    (r"drop_collection\s*\(", "suppression de collection"),
    (r"\.drop\s*\(", "drop de collection"),
    (r"delete_many\s*\(\s*\{\s*\}\s*\)", "delete_many sans filtre"),
    (r"delete_one\s*\(\s*\{\s*\}\s*\)", "delete_one sans filtre"),
    (r"rename_collection\s*\(", "renommage de collection"),
)


def _python_files() -> list[Path]:
    return sorted(APP_DIR.rglob("*.py"))


def test_no_destructive_operations_in_source() -> None:
    violations: list[str] = []
    for path in _python_files():
        content = path.read_text(encoding="utf-8")
        for pattern, label in FORBIDDEN_PATTERNS:
            for match in re.finditer(pattern, content):
                line = content.count("\n", 0, match.start()) + 1
                violations.append(f"{path.relative_to(APP_DIR)}:{line} → {label} ({match.group(0)})")
    assert not violations, "Opérations destructives détectées :\n" + "\n".join(violations)


def test_deletes_are_not_exposed_via_repositories() -> None:
    """Le dépôt générique n'expose aucune méthode de suppression."""
    repo_src = (APP_DIR / "repositories" / "base.py").read_text(encoding="utf-8")
    assert "delete" not in repo_src.lower()


def test_safety_documented_in_db_module() -> None:
    """Le module de base de données documente la politique non destructive."""
    db_src = (APP_DIR / "core" / "db.py").read_text(encoding="utf-8")
    assert "AUCUN drop_database" in db_src
    assert "non destructif" in db_src
