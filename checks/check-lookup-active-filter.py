#!/usr/bin/env python3
"""
A function that supplies dropdown options must not offer retired values.

WHY THIS CHECK EXISTS

Sprint 10 adds editors for the inventory, customer, lead and enquiry lookups.
The brief is firm that retiring a value must not touch history: "when disabling
a value, preserve historical vehicles that use it", "do not break existing
vehicle records". So the editors never delete — they set is_active false.

That only means something if the pickers honour it. A switch labelled
"Available to choose" that leaves the value in a dropdown is worse than no
switch: somebody retires a fuel type, sees it still offered on the next car
they add, and concludes the only way to get rid of it is to delete it. Which is
the thing that breaks history.

WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT

An earlier version of this script checked every read of every lookup table in
the repo. It reported 31 failures and every one of them was correct code:

  .in("id", [current.stage_id, newStageId])   resolving two known stages
  .eq("id", lostReasonId).single()            resolving one known reason
  select("id, slug, stage_type")              classifying stages to COUNT leads
  select("id, requires_detail")               building a lookup map by id

All four must NOT filter is_active. A lead sitting in a retired stage still has
to be counted, and a car built with a retired fuel type still has to display
it. Filtering those would make totals disagree with reality and blank fields on
historical records — the opposite of the brief's requirement.

So the question "should this read filter?" cannot be answered from the query.
It depends on what the caller does with the rows, which is not visible here. A
script that guesses produces 31 false failures, and a check that cries wolf is
a check everybody learns to skip.

What IS knowable is the contract of a function whose job is to supply options.
This script therefore checks exactly that: reads of a lookup table inside the
modules below, whose entire purpose is feeding pickers and filter bars.

It does not check the rest of the app, and a pass here does not mean every
dropdown everywhere is correct. It means these modules are.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Tables whose rows can be retired with is_active.
# profiles, cars and customer_profiles are deliberately absent: staff,
# vehicles and customers are not lookup values and are not retired this way.
LOOKUPS = {
    "brands",
    "models",
    "variants",
    "body_types",
    "fuel_types",
    "transmission_types",
    "drive_types",
    "paint_finish_types",
    "collections",
    "vehicle_statuses",
    "warranty_types",
    "customer_sources",
    "customer_tags",
    "lead_stages",
    "lead_tags",
    "lead_lost_reasons",
    "lead_future_actions",
    "enquiry_types",
    "enquiry_sources",
    "enquiry_statuses",
    "test_drive_request_sources",
    "locations",
}

# Modules that exist to supply options to selects and filter bars. Every read
# of a lookup table in these must hide retired values.
PICKER_MODULES = [
    "src/lib/supabase/inventory-lookups.ts",
    "src/lib/supabase/customer-lookups.ts",
    "src/lib/supabase/lead-lookups.ts",
    "src/lib/supabase/sales-filter-lookups.ts",
    "src/lib/supabase/test-drive-filter-lookups.ts",
]

# NOT a picker module, and worth recording why rather than leaving it to be
# re-added by somebody reading the table list:
#
#   src/lib/supabase/enquiry-workflow-queries.ts
#
# Sprint 7 fetches the whole enquiry vocabulary once per request, retired rows
# included, because the same cached read serves three callers with different
# needs: the filter bar and the status control want current values, and a
# server action validating an enquiry that already sits on a retired status
# needs that status to exist. It then exposes activeTypes(), activeSources()
# and activeStatuses() in src/lib/utils/enquiry-workflow.ts for the callers
# that are offering a choice.
#
# That is a better arrangement than filtering in the query, so the check for
# it is a different one: ENQUIRY_PICKER_PAGES below must reach the vocabulary
# through those helpers.
ENQUIRY_PICKER_PAGES = [
    "app/admin/enquiries/page.tsx",
    "app/admin/enquiries/new/page.tsx",
]
ACTIVE_HELPERS = ("activeTypes", "activeSources", "activeStatuses")

# Modules that must SHOW retired values, because they are how a value gets
# switched back on. Each needs its reason.
EDITOR_MODULES = {
    "src/lib/supabase/settings-lookup-queries.ts": "the lookup editors — if these filtered, nothing could switch a value back on",
    "src/lib/supabase/settings-section-queries.ts": "the showrooms editor, same reason",
}


def statement_at(text, start):
    """The chained expression from `.from(` to the end of its statement."""
    depth = 0
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
        elif char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
            if depth < 0:
                return text[start:index], True
        elif char == ";" and depth == 0:
            return text[start:index], True
        index += 1
    return text[start:], False


def enclosing_function(text, position):
    """Nearest `export function`/`export async function` above `position`."""
    best = "(top level)"
    for match in re.finditer(r"export (?:async )?function (\w+)", text[:position]):
        best = match.group(1)
    return best


RESOLVES_ONE = re.compile(r'\.(eq|in)\(\s*["\'](id|key|slug)["\']')
FILTERS_ACTIVE = re.compile(r'\.eq\(\s*["\']is_active["\']\s*,\s*true\s*\)')


def main():
    from_pattern = re.compile(r'\.from\(\s*["\']([a-z_]+)["\']\s*\)')

    ok = []
    resolving = []
    missing = []
    editors = []
    missing_files = []

    for relative in PICKER_MODULES + list(EDITOR_MODULES):
        path = ROOT / relative
        if not path.exists():
            # A module named here but absent means this list is stale, which
            # would silently shrink what gets checked.
            missing_files.append(relative)
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        is_editor = relative in EDITOR_MODULES

        for match in from_pattern.finditer(text):
            table = match.group(1)
            if table not in LOOKUPS:
                continue

            line = text[: match.start()].count("\n") + 1
            statement, _ = statement_at(text, match.start())
            function = enclosing_function(text, match.start())
            where = f"{relative}:{line}  {table}  in {function}()"

            if re.search(r"\.(insert|update|upsert|delete)\(", statement):
                continue

            if is_editor:
                editors.append(where)
                continue

            if FILTERS_ACTIVE.search(statement):
                ok.append(where)
            elif RESOLVES_ONE.search(statement):
                # Resolving a specific row by key, not offering a choice.
                resolving.append(where)
            else:
                missing.append(where)

    # The enquiry side: the pages that build pickers must go through the
    # active-only helpers rather than the raw vocabulary arrays.
    # A .from(variable) cannot be matched by table name, so it is not
    # checked. Saying so beats a count that implies coverage: the generic
    # lookup editor reads .from(spec.table), and no amount of reading this
    # script will tell you whether that filters.
    dynamic = []
    for relative in PICKER_MODULES + list(EDITOR_MODULES):
        path = ROOT / relative
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        # (?<!Array) keeps Array.from(new Set(...)) out of the results.
        for match in re.finditer(r"(?<!Array)\.from\(\s*(?![\"'])([A-Za-z_][\w.]*)", text):
            line = text[: match.start()].count("\n") + 1
            dynamic.append(f"{relative}:{line}  .from({match.group(1)})")

    enquiry_ok = []
    enquiry_bad = []
    for relative in ENQUIRY_PICKER_PAGES:
        path = ROOT / relative
        if not path.exists():
            missing_files.append(relative)
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if any(helper in text for helper in ACTIVE_HELPERS):
            enquiry_ok.append(relative)
        else:
            enquiry_bad.append(
                f"{relative}  builds enquiry pickers without activeTypes/activeSources/activeStatuses"
            )

    print("=" * 70)
    print("SPRINT 10 — PICKERS DO NOT OFFER RETIRED VALUES")
    print("=" * 70)
    print(f"\nScope: {len(PICKER_MODULES)} option-supplying module(s), {len(EDITOR_MODULES)} editor module(s).")
    print("Reads elsewhere in the app are not checked — see the note at the top.\n")
    print(f"  {len(ok)} read(s) hide retired values")
    print(f"  {len(resolving)} read(s) resolve one known row, so must not filter")
    print(f"  {len(editors)} read(s) in editors, which must show everything")
    print(f"  {len(enquiry_ok)} enquiry page(s) reach the vocabulary through the active-only helpers")
    print(f"  {len(dynamic)} read(s) name their table in a variable, so cannot be checked here")

    if dynamic:
        print("\nNot checked — the table name is a variable:")
        for item in dynamic:
            print(f"  --   {item}")
        print(
            "  These are in the editor modules, which must show retired values\n"
            "  anyway. A dynamic read in a PICKER module would need a test\n"
            "  instead; settings-lookup-test.mts covers the registry side."
        )

    if editors:
        print("\nEditors showing retired values on purpose:")
        for item in editors:
            print(f"  ok   {item}")

    problems = []

    if missing_files:
        print("\nModules named in this script but not found:")
        for item in missing_files:
            print(f"  FAIL  {item}")
        problems.extend(missing_files)

    if enquiry_bad:
        print(f"\n{len(enquiry_bad)} enquiry page(s) using the raw vocabulary:")
        for item in enquiry_bad:
            print(f"  FAIL  {item}")
        problems.extend(enquiry_bad)

    if missing:
        print(f"\n{len(missing)} option list(s) still offering retired values:")
        for item in missing:
            print(f"  FAIL  {item}")
        print(
            '\n  Add .eq("is_active", true). If the function genuinely needs\n'
            "  retired rows, it is not an option list — move it out of these\n"
            "  modules or resolve by id."
        )
        problems.extend(missing)

    if problems:
        print(f"\n{len(problems)} problem(s).")
        return 1

    print("\nEvery option list in these modules hides retired values.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
