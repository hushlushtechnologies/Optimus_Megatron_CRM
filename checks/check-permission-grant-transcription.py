#!/usr/bin/env python3
"""
Sprint 11: keep sql/17's grants and the TypeScript fallback arrays in lockstep.

Until Batch 5 removes the fallback, inventory, customers and leads have their
authorisation written down twice: once as grants in sql/17, once as a role-name
array in the helper. Two copies of the same rule drift. The drift is silent and
it is a permissions drift, which is the worst kind — somebody keeps access they
should have lost, or loses access nobody meant to take.

This script compares them without a database, so it runs in CI.

It does NOT check that the grants are correct. Deciding who should hold
customers.delete is Phase 9's job, done with the matrix visible. This checks
only that the two places which currently both claim to know the answer agree
about it.

Exit 1 on disagreement, on a missing anchor, or on a module that has one copy
and not the other.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "sql" / "17-sprint-11-module-permission-keys.sql"

# key -> (file, fallback array name). The single source of truth for what this
# script compares; adding a module here is how it gets covered.
FALLBACKS = {
    "inventory.manage": ("src/lib/supabase/inventory-permissions.ts", "INVENTORY_MANAGER_ROLES"),
    "customers.manage": ("src/lib/supabase/customer-permissions.ts", "CUSTOMER_MANAGER_ROLES"),
    "customers.delete": ("src/lib/supabase/customer-permissions.ts", "ELEVATED_CUSTOMER_ROLES"),
    "customers.notes_manage": ("src/lib/supabase/customer-permissions.ts", "ELEVATED_CUSTOMER_ROLES"),
    "leads.manage": ("src/lib/supabase/lead-permissions.ts", "LEAD_MANAGER_ROLES"),
    "leads.delete": ("src/lib/supabase/lead-permissions.ts", "ELEVATED_LEAD_ROLES"),
    "leads.notes_manage": ("src/lib/supabase/lead-permissions.ts", "ELEVATED_LEAD_ROLES"),
}

problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


def sql_grants() -> dict[str, set[str]]:
    """Pull the (role name, key) pairs out of the `wanted` VALUES block."""
    if not SQL.exists():
        fail(f"{SQL.relative_to(ROOT)} is missing — the grant migration is not in this tree.")
        return {}

    text = SQL.read_text()
    m = re.search(r"with wanted \(role_name, permission\) as \(\s*values(.*?)\n\)", text, re.S)
    if not m:
        fail(
            f"{SQL.relative_to(ROOT)}: could not find the `with wanted (role_name, permission) "
            "as (values ...)` block. If the migration was restructured, update this script — "
            "do not delete it."
        )
        return {}

    grants: dict[str, set[str]] = {}
    for role, key in re.findall(r"\('([^']+)',\s*'([^']+)'\)", m.group(1)):
        grants.setdefault(key, set()).add(role)

    if not grants:
        fail(f"{SQL.relative_to(ROOT)}: the grant block parsed to zero grants.")
    return grants


def ts_array(rel: str, name: str) -> set[str] | None:
    path = ROOT / rel
    if not path.exists():
        fail(f"{rel} is missing but {name} is still expected there.")
        return None

    src = path.read_text()
    m = re.search(re.escape(name) + r"\s*(?::[^=]*)?=\s*\[(.*?)\]", src, re.S)
    if not m:
        fail(
            f"{rel}: the fallback array {name} is gone. If the fallback has been removed on "
            f"purpose, drop its entry from FALLBACKS in this script in the same commit."
        )
        return None

    roles = set(re.findall(r'"([^"]+)"', m.group(1)))
    if not roles:
        fail(f"{rel}: {name} is empty, which would deny everybody if the fallback fired.")
    return roles


def main() -> int:
    grants = sql_grants()

    for key, (rel, name) in FALLBACKS.items():
        expected = grants.get(key)
        if expected is None:
            fail(
                f'"{key}" has a fallback array in {rel} but no grants in '
                f"{SQL.name}. The fallback would be the only thing authorising it."
            )
            continue

        actual = ts_array(rel, name)
        if actual is None:
            continue

        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            detail = []
            if missing:
                detail.append(f"granted in SQL but not in the array: {', '.join(missing)}")
            if extra:
                detail.append(f"in the array but not granted in SQL: {', '.join(extra)}")
            fail(f'"{key}" disagrees between {SQL.name} and {rel} ({name}) — ' + "; ".join(detail))

    # A key granted in the SQL with no fallback is fine for the view keys, which
    # are granted to every role and have no array. Anything else is a gap.
    for key in grants:
        if key in FALLBACKS or key.endswith(".view"):
            continue
        fail(
            f'"{key}" is granted in {SQL.name} but has no entry in this script. '
            "Add it to FALLBACKS so the two copies stay checked."
        )

    if problems:
        print("check-permission-grant-transcription: FAIL")
        for p in problems:
            print(f"  - {p}")
        return 1

    covered = len(FALLBACKS)
    print(f"check-permission-grant-transcription: ok ({covered} keys agree with their fallback arrays)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
