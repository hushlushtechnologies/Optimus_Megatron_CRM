#!/usr/bin/env python3
"""
No server action may write sales_settings columns belonging to more than one
settings page.

WHY THIS CHECK EXISTS

sales_settings is a single row edited from three pages. Sprint 8 wrote all
eight editable columns on every save, which was correct while one form held
all eight fields. Once the fields are on separate pages it is a lost update:
a page that shows two fields still has to send the other six, and it sends
them as they were when it loaded. Saving a reservation hold length can put the
discount threshold back to its old value, and nothing anywhere reports it.

Proved against a real Postgres in verify/scoped-writes.sql: the all-columns
write silently reverted both the discount threshold and the separate-verifier
rule; the scoped writes did not.

A type checker cannot see this. Every column is a valid column and every value
is the right type; what is wrong is the SET list being wider than the page. So
it needs a script.

WHAT COUNTS AS A FAILURE

  - one update naming columns from two different pages
  - a column that belongs to no page (the scopes are out of date, or the
    column is new and nobody decided where it lives)

Bookkeeping columns are exempt: updated_at and updated_by belong to every
write by definition.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# These mirror settings-history-scope.ts. Kept here as data rather than parsed
# out of the TypeScript, because a check that reads its expectations from the
# code it is checking cannot disagree with it, and a check that cannot disagree
# is not a check. settings-risk-test.mts asserts the TS side covers every
# column exactly once; this asserts the writes respect the same split.
SCOPES = {
    "reservations": {
        "reservation_default_days",
        "reservation_max_days",
        "reservation_deposit_mode",
        "reservation_deposit_value",
    },
    "sales": {
        "discount_auto_approve_percent",
        "fees_enabled",
        "vat_rate_percent",
    },
    "payments": {
        "confirm_min_deposit_percent",
        "payments_require_separate_verifier",
    },
    "regional": {"currency"},
}

BOOKKEEPING = {"id", "updated_at", "updated_by"}

ALL_SCOPED = set()
for columns in SCOPES.values():
    ALL_SCOPED |= columns


def find_update_blocks(text):
    """
    Yield (line_number, body) for each `.from("sales_settings")` ... `.update({`
    in one file, where body is the text between the update's braces.

    Brace counting rather than a regex for the body: the object can contain
    nested calls and template strings, and a greedy or lazy regex gets either
    too much or too little.
    """
    for match in re.finditer(r'\.from\(\s*["\']sales_settings["\']\s*\)', text):
        window = text[match.end() : match.end() + 3000]
        update = re.search(r"\.update\(\s*\{", window)
        if not update:
            continue

        start = match.end() + update.end() - 1  # at the '{'
        depth = 0
        end = None
        in_string = None
        index = start
        while index < len(text):
            char = text[index]
            if in_string:
                if char == "\\":
                    index += 2
                    continue
                if char == in_string:
                    in_string = None
            elif char in "\"'`":
                in_string = char
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index
                    break
            index += 1

        if end is None:
            continue
        yield text[:start].count("\n") + 1, text[start + 1 : end]


def columns_written(body):
    """
    The column names on the left of a `:` at the top level of the object.

    A spread (`...patch`) means the columns come from a variable, which this
    script cannot resolve. Those are reported separately rather than passed,
    because "I could not tell" must not read as "it is fine".
    """
    spread = bool(re.search(r"\.\.\.\s*\w+", body))
    names = set()
    depth = 0
    for line in body.split("\n"):
        stripped = line.strip()
        if depth == 0:
            key = re.match(r'^(?:"([a-z_]+)"|([a-z_][a-z0-9_]*))\s*:', stripped)
            if key:
                names.add(key.group(1) or key.group(2))
        depth += line.count("{") + line.count("[") - line.count("}") - line.count("]")
    return names, spread


def main():
    files = [
        path
        for path in list(ROOT.glob("app/**/*.ts")) + list(ROOT.glob("src/**/*.ts"))
        if "node_modules" not in str(path)
    ]

    problems = []
    unresolved = []
    checked = 0

    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        if "sales_settings" not in text:
            continue

        for line_number, body in find_update_blocks(text):
            checked += 1
            names, spread = columns_written(body)
            relative = path.relative_to(ROOT)

            if spread:
                unresolved.append(f"{relative}:{line_number}  spreads a variable into the update")
                continue

            columns = names - BOOKKEEPING
            if not columns:
                continue

            unknown = columns - ALL_SCOPED
            if unknown:
                problems.append(
                    f"{relative}:{line_number}  writes {', '.join(sorted(unknown))}, "
                    f"which no settings page owns. Add it to a scope in "
                    f"settings-history-scope.ts and to SCOPES in this file."
                )

            owners = sorted(name for name, cols in SCOPES.items() if columns & cols)
            if len(owners) > 1:
                detail = "; ".join(
                    f"{owner}: {', '.join(sorted(columns & SCOPES[owner]))}" for owner in owners
                )
                problems.append(
                    f"{relative}:{line_number}  one update writes columns from "
                    f"{len(owners)} pages ({detail}). A page that does not show a "
                    f"field must not write it — see validation/settings-sections.ts."
                )

    print("=" * 70)
    print("SPRINT 10 — SETTINGS WRITE SCOPE")
    print("=" * 70)
    print(f"\n{checked} update(s) to sales_settings found in {len(files)} file(s).\n")

    if unresolved:
        # An unreadable write is a failure, not a note. The first version of
        # this script printed these and exited zero, which is the shape of
        # every check that silently stops working: the exclusion added to
        # avoid a false positive becomes where the false negative hides.
        print("Could not be judged by reading, which this check treats as a failure:")
        for item in unresolved:
            print(f"  FAIL  {item}")
        print(
            "\n  An update whose column list arrives in a variable cannot be\n"
            "  checked. Write the columns as a literal at the call site so both\n"
            "  a reader and this script can see which page owns them."
        )
        print()
        problems.extend(unresolved)

    if problems:
        for problem in problems:
            print(f"  FAIL  {problem}")
        print(f"\n{len(problems)} problem(s).")
        return 1

    for name, columns in sorted(SCOPES.items()):
        print(f"  ok   {name}: {len(columns)} column(s) written only by its own page")
    print("\nEvery write names columns from one page only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
