#!/usr/bin/env python3
"""
The notifications nobody may switch off must be the same set in all three
places that enforce it.

WHY THIS CHECK EXISTS

Sprint 10: "ordinary staff must not be able to disable mandatory security or
financial notifications." That rule is enforced three times, deliberately,
because the three fail differently:

  notification-catalog.ts   mandatory: true  — the page shows it as always-on
  create-notification.ts    the gate skips the preference lookup entirely
  sql/15                    a CHECK constraint refuses to store the row

Three enforcement points and no shared definition is exactly the shape of a
rule that quietly stops being enforced. Mark a new financial notification
mandatory in the catalog and forget the constraint, and the page says "always
on" while the database happily stores a row switching it off — and the gate
is the only thing still holding, with nothing to say the other two disagree.

Worse in the other direction: drop one from the catalog and the constraint
still refuses it, so a staff member gets an error they cannot act on from a
toggle the page told them was theirs to change.

A type checker cannot see across a .ts file and a .sql file. Hence a script.

WHAT IT CHECKS

  1. every mandatory event's preferenceKey is in the SQL constraint
  2. every key in the SQL constraint belongs to a mandatory event
  3. the gate in create-notification.ts still short-circuits on mandatory
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src" / "lib" / "types" / "notification-catalog.ts"
SQL = ROOT / "sql" / "15-sprint-10-notification-preferences.sql"
GATE = ROOT / "src" / "lib" / "notifications" / "create-notification.ts"


def mandatory_keys_from_catalog(text):
    """
    The preferenceKey of every event with mandatory: true.

    Parsed per event object rather than with one regex over the file: the
    fields appear in a fixed order within each object, but `mandatory: false`
    sits only a few lines from the next event's preferenceKey, so a looser
    pattern pairs them up wrongly.
    """
    keys = set()
    # Each event literal starts at `type:` and ends at the next one.
    chunks = re.split(r"\n  \{\n", text)
    for chunk in chunks:
        if "preferenceKey:" not in chunk:
            continue
        is_mandatory = re.search(r"\n    mandatory:\s*true\s*,", chunk)
        key = re.search(r'\n    preferenceKey:\s*"([a-z_]+)"', chunk)
        if is_mandatory and key:
            keys.add(key.group(1))
    return keys


def main():
    for path in (CATALOG, SQL, GATE):
        if not path.exists():
            print(f"  FAIL  {path.relative_to(ROOT)} does not exist")
            return 1

    catalog_text = CATALOG.read_text(encoding="utf-8")
    sql_text = SQL.read_text(encoding="utf-8")
    gate_text = GATE.read_text(encoding="utf-8")

    catalog_keys = mandatory_keys_from_catalog(catalog_text)

    # The constraint: preference_key not in ('a', 'b')
    constraint = re.search(
        r"preference_key\s+not\s+in\s*\(([^)]*)\)", sql_text, re.IGNORECASE
    )
    sql_keys = set(re.findall(r"'([a-z_]+)'", constraint.group(1))) if constraint else set()

    print("=" * 70)
    print("SPRINT 10 — MANDATORY NOTIFICATIONS AGREE ACROSS CATALOG, GATE AND SQL")
    print("=" * 70)
    print(f"\n  catalog says mandatory:    {', '.join(sorted(catalog_keys)) or '(none)'}")
    print(f"  SQL constraint refuses:    {', '.join(sorted(sql_keys)) or '(none)'}\n")

    problems = []

    if not catalog_keys:
        problems.append(
            "no mandatory events found in the catalog — either this script's pattern is "
            "stale, or nothing is mandatory any more, which the brief does not allow"
        )
    if constraint is None:
        problems.append(
            "no `preference_key not in (...)` constraint found in sql/15 — "
            "a mandatory preference could be stored by hand"
        )

    for key in sorted(catalog_keys - sql_keys):
        problems.append(
            f'"{key}" is mandatory in the catalog but the SQL constraint allows it — '
            f"the page would say always-on while the database stored it switched off"
        )
    for key in sorted(sql_keys - catalog_keys):
        problems.append(
            f'the SQL constraint refuses "{key}" but no mandatory event uses it — '
            f"somebody would get an error from a toggle the page offered them"
        )

    # The gate must still short-circuit before reading preferences.
    if not re.search(r"if\s*\(\s*event\.mandatory\s*\)\s*return\s+true\s*;", gate_text):
        problems.append(
            "create-notification.ts no longer returns early for a mandatory event — "
            "mandatory notifications would be subject to whatever preference rows exist"
        )

    if problems:
        for problem in problems:
            print(f"  FAIL  {problem}")
        print(f"\n{len(problems)} problem(s).")
        return 1

    print(f"All {len(catalog_keys)} mandatory notification(s) are enforced in all three places.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
