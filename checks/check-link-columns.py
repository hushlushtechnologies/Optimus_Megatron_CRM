#!/usr/bin/env python3
"""
Do the columns in LINK_KINDS_SPEC exist on the views it names?

The spec table reaches four other modules' views by column name. A typo
there is invisible to tsc (the select string is built at runtime) and would
only show up as an empty panel in front of a user.

This checks each name against how that module's own code reads the view:
its column constant, or its row type.
"""

import re
import sys
import pathlib

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

SPEC = REPO / "src/lib/types/enquiry-links.ts"

# Where each module declares the columns it reads from its own view.
EVIDENCE = {
    "lead_list": ["src/lib/supabase/lead-list-query.ts"],
    "sales_deal_list": ["src/lib/supabase/sales-list-queries.ts", "src/lib/types/sales.ts"],
    "test_drive_list": ["src/lib/types/test-drive.ts", "src/lib/supabase/test-drive-queries.ts"],
    "vehicle_reservation_list": [
        "src/lib/supabase/reservation-queries.ts",
        "src/lib/types/reservations.ts",
    ],
}

# The FK columns on `enquiries`, as Phase 1's migration created them.
MIGRATION = pathlib.Path("/home/claude/sprint-7-batch-1/sql/01-phase-1-migration.sql")


def spec_entries() -> list[dict]:
    text = SPEC.read_text()
    body = text[text.index("LINK_KINDS_SPEC") :]

    entries = []
    for block in re.finditer(
        r"(\w+):\s*\{(.*?)\n  \}", body, flags=re.S
    ):
        kind, inner = block.group(1), block.group(2)
        fields = dict(re.findall(r'(\w+):\s*"([^"]+)"', inner))
        if "view" in fields:
            fields["kind"] = kind
            entries.append(fields)

    return entries


def evidence_for(view: str) -> str:
    return "\n".join((REPO / path).read_text() for path in EVIDENCE[view])


failed = False

for entry in spec_entries():
    view = entry["view"]
    haystack = evidence_for(view)

    # vehicle_title and customer_id are read for every kind by the shared query.
    columns = [
        entry["numberColumn"],
        entry["statusColumn"],
        entry["dateColumn"],
        "vehicle_title",
        "customer_id",
    ]

    bad = [c for c in columns if not re.search(rf'["\s]{re.escape(c)}["\s:,]', haystack)]

    print(f"{entry['kind']:12} {view:26} {'ok' if not bad else 'NOT FOUND: ' + ', '.join(bad)}")
    if bad:
        failed = True

# And the four FK columns on enquiries.
print()
sql = MIGRATION.read_text()
for entry in spec_entries():
    column = entry["column"]

    added = re.search(rf"add column if not exists {re.escape(column)}\b", sql)

    # A column the view selects must already exist: `create view ... select
    # e.lead_id` fails at migration time otherwise. So being in the view is
    # proof the column is there, for the ones that predate this sprint.
    in_view = re.search(rf"^\s*e\.{re.escape(column)},", sql, flags=re.M)

    if added:
        note = "added by phase 1"
    elif in_view:
        note = "pre-existing (read by the phase 1 view)"
    else:
        note = "NOT FOUND — neither added nor read"
        failed = True

    print(f"enquiries.{column:18} {note}")

print()
print("FAIL" if failed else "every column the link spec names is one its module actually reads")
sys.exit(1 if failed else 0)
