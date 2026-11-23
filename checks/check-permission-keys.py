#!/usr/bin/env python3
"""
Every permission key the application checks must be defined in SQL.

WHY THIS EXISTS

In Sprint 8 a README listed five permission keys that did not exist —
offers.create, offers.edit, offers.archive, offers.codes, offers.redeem —
all invented, all plausible, none real. Granting any of them would have done
nothing, silently, and the person granting them would have believed they had.

The failure mode is quiet in both directions:

  a key checked but never defined   nobody can ever hold it, so the feature
                                    is permanently refused and looks like a
                                    bug in the feature

  a key defined but never checked   somebody is granted something that does
                                    not gate anything

Neither shows up in tsc, in lint, or at runtime until a real person is
refused something they should have.

WHAT COUNTS AS "DEFINED"

A key is defined if some file under sql/ or docs/ inserts it into
app_permissions. That is the table has_permission() and get_my_permissions()
read, so it is the only definition that matters.

Usage:
    python3 checks/check-permission-keys.py
"""
import os
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent

# Where keys are DEFINED.
SQL_DIRS = ["sql", "docs"]

# Where keys are CHECKED. Only files that genuinely gate on a key.
CODE_GLOBS = [
    "src/lib/utils",
    "src/lib/supabase",
    "src/lib/types",
]

KEY_RE = re.compile(r"""['"]([a-z_]+\.[a-z_]+)['"]""")

# ---------------------------------------------------------------------------
# KEYS THAT WORK BUT HAVE NO MIGRATION IN THIS REPOSITORY
# ---------------------------------------------------------------------------
#
# These 29 keys are checked throughout Sprints 5 to 7 and plainly function —
# the Sales, Test Drives and Reservations modules gate on them every day. They
# were created directly in Supabase rather than by a migration that lives here.
#
# This list is a DEBT RECORD, not an approval. What it means in practice:
#
#   a fresh environment cannot be provisioned from this repository. Clone it,
#   run every migration in sql/, and these permissions are simply absent —
#   every gated action refuses, and the cause is invisible because nothing
#   errors.
#
# That matters for the Sprint 12 production release, and for staging, and for
# the next developer who sets up locally. It belongs in a migration that
# inserts them idempotently, the way sql/00-FIX-permissions-table.sql does for
# the Sprint 8 keys.
#
# The check passes on these and fails on anything NEW, so the debt is recorded
# and does not grow.
# Keys the code checks that no migration defines.
#
# Emptied in Sprint 9 Phase 14: sql/11-sprint-9-backfill-permission-keys.sql
# now defines all 29 that were listed here, along with the three tables they
# live in — none of which were in the repository either, which is what
# actually blocked a rebuild.
#
# It stays as an empty set rather than being deleted, so that a key added
# without a migration has somewhere to be recorded deliberately. Keep it
# empty: a populated allowlist that nobody revisits turns a check into a
# record of what we have decided to ignore.
KNOWN_UNDEFINED: set[str] = set()

# Dotted strings that look like keys and are not. Without these the check
# reports imports and filenames as missing permissions, which is the kind of
# noise that gets a check deleted.
NOT_KEYS = re.compile(
    r"""^(
        .*\.(ts|tsx|js|mjs|sql|md|json|png|css)$   # filenames
      | (next|react|motion|lucide|date|zod|sonner)\..*  # packages
      | .*\.(com|io|dev|org|net)$                  # hostnames
      | (public|auth|storage)\..*                   # schema-qualified SQL names
    )$""",
    re.X,
)


def keys_in(paths: list[pathlib.Path], pattern: re.Pattern[str]) -> dict[str, set[str]]:
    """Every key-shaped string, mapped to the files it appears in."""
    found: dict[str, set[str]] = {}

    for path in paths:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        for match in pattern.finditer(text):
            key = match.group(1)
            if NOT_KEYS.match(key):
                continue
            found.setdefault(key, set()).add(path.relative_to(REPO).as_posix())

    return found


def files_under(directory: str, suffixes: tuple[str, ...]) -> list[pathlib.Path]:
    root = REPO / directory
    if not root.exists():
        return []

    out: list[pathlib.Path] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.endswith(suffixes):
                out.append(pathlib.Path(dirpath) / name)
    return out


INSERT_START_RE = re.compile(
    r"insert\s+into\s+(?:public\.)?app_permissions\b",
    re.IGNORECASE,
)


def insert_statements(text: str) -> list[str]:
    """
    The text of each `insert into app_permissions ...;` statement.

    Walks forward from each insert keyword to the terminating semicolon,
    skipping semicolons inside single-quoted strings. A naive `.*?;` cannot
    do this, and the failure is not hypothetical: a permission description
    in the Phase 14 backfill reads "Recording is a claim that money arrived;
    it does not confirm it." — that semicolon ended the statement early and
    hid the two keys defined after it.
    """
    out: list[str] = []

    for match in INSERT_START_RE.finditer(text):
        i = match.start()
        j = match.end()
        in_string = False

        while j < len(text):
            ch = text[j]

            if in_string:
                # '' is an escaped quote inside a SQL string literal.
                if ch == "'":
                    if j + 1 < len(text) and text[j + 1] == "'":
                        j += 2
                        continue
                    in_string = False
            elif ch == "'":
                in_string = True
            elif ch == ";":
                break

            j += 1

        out.append(text[i:j])

    return out


def keys_in_inserts(paths: list[pathlib.Path]) -> list[str]:
    """
    Keys created by an insert into app_permissions, and nothing else.

    Scans only the span of each matching insert statement, so a key that is
    merely mentioned elsewhere in the same file — in a grant, a comment, a
    verification list — is not mistaken for one that is created.
    """
    found: set[str] = set()

    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")

        for statement in insert_statements(text):
            for match in KEY_RE.finditer(statement):
                key = match.group(1)
                if not NOT_KEYS.search(key):
                    found.add(key)

    return sorted(found)


def main() -> int:
    sql_files: list[pathlib.Path] = []
    for directory in SQL_DIRS:
        sql_files.extend(files_under(directory, (".sql",)))

    code_files: list[pathlib.Path] = []
    for directory in CODE_GLOBS:
        code_files.extend(files_under(directory, (".ts", ".tsx")))

    # A key is DEFINED only where it is INSERTED into app_permissions.
    #
    # This used to filter whole files: any .sql file that mentioned
    # app_permissions anywhere had every quoted dotted string in it counted
    # as a definition. The comment claimed statement-level precision the code
    # did not have, and it mattered — the Phase 14 backfill lists all 29 keys
    # a second time in its own verification block, and that list alone was
    # enough to satisfy the check. Deleting a key from the actual insert left
    # the checker perfectly happy, which I only found by trying it.
    #
    # So the scan is now limited to the text of insert statements that target
    # app_permissions: from the insert keyword to the statement's semicolon.
    # A grant, a comment, a verification array or a docs example no longer
    # counts as creating anything.
    defined = keys_in_inserts(sql_files)
    checked = keys_in(code_files, KEY_RE)

    print(f"{len(defined)} keys defined in SQL, {len(checked)} referenced in code.\n")

    undefined = set(checked) - set(defined)

    # Pre-existing debt is reported, not failed on. Anything new is a failure.
    legacy = sorted(undefined & KNOWN_UNDEFINED)
    missing = sorted(undefined - KNOWN_UNDEFINED)

    if legacy:
        print(f"{len(legacy)} key(s) work but have no migration in this repo (known debt):")
        print(f"  {', '.join(legacy)}")
        print("  A fresh environment cannot be provisioned from this repository")
        print("  until these are written into a migration.\n")

    if missing:
        print("=" * 60)
        print(f"{len(missing)} NEW key(s) checked in code but never defined in SQL:\n")
        for key in missing:
            where = ", ".join(sorted(checked[key])[:3])
            print(f"  {key}")
            print(f"      checked in: {where}")
        print()
        print("Granting one of these does nothing. Either define it in a migration")
        print("or stop checking it.")
        print("=" * 60)
        return 1

    unused = sorted(set(defined) - set(checked))
    if unused:
        print(f"Note: {len(unused)} key(s) defined but not checked anywhere in code:")
        print(f"  {', '.join(unused)}")
        print("  (not a failure — they may gate database policies rather than UI)\n")

    print("=" * 60)
    print("Every permission key checked in code is defined in a migration.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
