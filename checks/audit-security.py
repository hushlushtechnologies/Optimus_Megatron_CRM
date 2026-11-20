#!/usr/bin/env python3
"""
Phase 21 security review, as checks rather than claims.

Every one of these is a property I asserted while building Sprint 7. A
review that re-reads the code and says "looks right" is worth very little —
these re-derive each property from the files and name anything that fails.
"""

import re
import sys
import pathlib

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

ACTION_FILES = [
    "app/admin/enquiries/actions.ts",
    "app/admin/enquiries/work-actions.ts",
    "app/admin/enquiries/link-actions.ts",
]

failures: list[str] = []


def report(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    if detail:
        for line in detail.splitlines():
            print(f"         {line}")
    if not ok:
        failures.append(label)


def split_functions(text: str) -> list[tuple[str, str]]:
    """
    Each exported async function and its body.

    The body brace is NOT simply the next "{": a signature like
    `): Promise<{ matches: X[] }> {` puts a brace inside the return type, and
    starting there captures the type annotation instead of the body. So walk
    the parameter list to its closing paren, then take the first brace that
    is outside any angle brackets.
    """
    out = []
    for match in re.finditer(r"^export async function (\w+)\(", text, flags=re.M):
        name = match.group(1)

        # Walk the parameter list.
        depth, i = 0, match.end() - 1
        while i < len(text):
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1

        # Past the return type: first brace at angle-depth 0.
        angle, brace = 0, None
        for j in range(i, len(text)):
            ch = text[j]
            if ch == "<":
                angle += 1
            elif ch == ">":
                angle -= 1
            elif ch == "{" and angle <= 0:
                brace = j
                break

        if brace is None:
            continue

        depth = 0
        for j, ch in enumerate(text[brace:], start=brace):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    out.append((name, text[brace : j + 1]))
                    break
    return out


def strip_sql_comments(sql: str) -> str:
    """-- comments out, so prose about a status isn't read as a status."""
    return re.sub(r"--[^\n]*", "", sql)


def strip_ts_comments(ts: str) -> str:
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", ts, flags=re.S))


# =====================================================================
print("\n1. Every server action checks permission on the server")
# =====================================================================
#
# A client that hides a button is a courtesy. The action behind it is a URL.

unguarded = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for name, body in split_functions(text):
        guarded = "beginEnquiryAction(" in body or "requireEnquiryPermission(" in body
        # Bulk wrappers delegate to the single action, which guards.
        delegates = "runBulk(" in body
        if not guarded and not delegates:
            unguarded.append(f"{path}::{name}")

report(
    "every exported action begins with a permission check",
    not unguarded,
    "\n".join(unguarded),
)

# =====================================================================
print("\n2. Every action validates its input with a schema")
# =====================================================================
#
# The input is whatever was posted, not whatever the form sends.

unvalidated = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for name, body in split_functions(text):
        signature = text[: text.index(body)].rsplit("export async function", 1)[-1]
        if "input: unknown" not in signature:
            continue
        if "safeParse(" not in body:
            unvalidated.append(f"{path}::{name}")

report(
    "every action taking input runs it through safeParse",
    not unvalidated,
    "\n".join(unvalidated),
)

# =====================================================================
print("\n3. Actions take identity from the session, never from the client")
# =====================================================================
#
# An action that accepted a user id would let anybody act as anybody.

spoofable = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for name, body in split_functions(text):
        # Writing a who-did-it column from parsed input rather than the session.
        for column in ("changed_by", "created_by", "evaluated_by", "matched_by", "assigned_by", "updated_by"):
            for assignment in re.findall(rf"{column}:\s*([^,\n]+)", body):
                value = assignment.strip()
                if "start.userId" in value or value in ("null,", "null"):
                    continue
                if "v." in value or "parsed." in value:
                    spoofable.append(f"{path}::{name} sets {column} from {value}")

report(
    "who-did-it columns come from the session, not the payload",
    not spoofable,
    "\n".join(spoofable),
)

# =====================================================================
print("\n4. Validation schemas live server-side and are reused")
# =====================================================================

schema_dir = REPO / "src/lib/validation"
enquiry_schemas = sorted(p.name for p in schema_dir.glob("enquiry*.ts"))
report(
    f"enquiry schemas present ({len(enquiry_schemas)}): {', '.join(enquiry_schemas)}",
    len(enquiry_schemas) >= 4,
)

# =====================================================================
print("\n5. Customer media is private, reached by signed URL")
# =====================================================================

migration = pathlib.Path("/home/claude/sprint-7-batch-1/sql/01-phase-1-migration.sql").read_text()

bucket_public = re.search(
    r"insert into storage\.buckets.*?values\s*\(\s*'enquiry-media'\s*,\s*'enquiry-media'\s*,\s*(true|false)",
    migration,
    flags=re.S | re.I,
)
report(
    "the enquiry-media bucket is created private",
    bool(bucket_public) and bucket_public.group(1).lower() == "false",
    f"found: {bucket_public.group(1) if bucket_public else 'bucket creation not found'}",
)

photo_query = (REPO / "src/lib/supabase/enquiry-queries.ts").read_text()
report(
    "photos are served via createSignedUrl, not a public path",
    "createSignedUrl" in photo_query and "getPublicUrl" not in photo_query,
)

# =====================================================================
print("\n6. The export is a separate permission from viewing")
# =====================================================================

export_route = (REPO / "app/admin/enquiries/export/route.ts").read_text()
report(
    "the export route requires enquiries.export",
    'requireEnquiryPermission("export")' in export_route,
)
report(
    "the export route refuses with 403 rather than an empty file",
    "403" in export_route,
)

# =====================================================================
print("\n7. Anti-spam internals stay out of the export")
# =====================================================================
#
# The hashed IP and user agent catch spam. They are no use to a salesperson
# and a spreadsheet is the last place they should end up.

export_query = (REPO / "src/lib/supabase/enquiry-export-queries.ts").read_text()
leaked = [c for c in ("ip_hash", "user_agent", "honeypot") if c in export_query]
report("no ip_hash / user_agent / honeypot column in the export", not leaked, ", ".join(leaked))

# =====================================================================
print("\n8. No financial figures where they are not needed")
# =====================================================================
#
# The plan is explicit that the finance form collects no income, documents
# or ID, and that an enquiry status is never an approval.

finance_schema = (REPO / "src/lib/validation/enquiry.ts").read_text()
forbidden = [
    term
    for term in ("monthlyIncome", "salary", "emiratesId", "passportNumber", "bankStatement", "creditScore")
    if term in finance_schema
]
report("the finance schema collects no income, ID or documents", not forbidden, ", ".join(forbidden))

workflow_sql = pathlib.Path("/home/claude/sprint-7-batch-1/sql/03-phase-15-workflows.sql").read_text()
approval_statuses = re.findall(r"'([^']*[Aa]pproved[^']*)'", strip_sql_comments(workflow_sql))
report(
    "no enquiry status reads as a finance approval",
    not approval_statuses,
    ", ".join(approval_statuses),
)

# =====================================================================
print("\n9. Cross-module links can't reach another customer's records")
# =====================================================================

link_actions = (REPO / "app/admin/enquiries/link-actions.ts").read_text()
report(
    "the link action compares the record's customer to the enquiry's",
    "owner !== enquiry.customer_id" in link_actions,
)
link_queries = (REPO / "src/lib/supabase/enquiry-link-queries.ts").read_text()
report(
    "candidates are filtered by customer_id, and absent without a customer",
    '.eq("customer_id", customerId)' in link_queries and "if (!customerId) return [];" in link_queries,
)

# =====================================================================
print("\n10. Archived enquiries stay out of every read")
# =====================================================================

reads = {
    "list / counts / summary": photo_query,
    "export": export_query,
    "customer history": link_queries,
    "metrics": (REPO / "src/lib/supabase/enquiry-metrics-queries.ts").read_text(),
}
missing_archive_filter = [name for name, text in reads.items() if 'is("archived_at", null)' not in text]
report(
    "archived_at is filtered in every read path",
    not missing_archive_filter,
    ", ".join(missing_archive_filter),
)

# =====================================================================
print("\n11. Notification fan-out can't be driven from the client")
# =====================================================================
#
# It writes rows for other people with the admin client.

notifications = (REPO / "src/lib/notifications/enquiry-notifications.ts").read_text()
report(
    "the notification module is not a server-action entry point",
    '"use server"' not in strip_ts_comments(notifications),
)
report(
    "it says so, so nobody adds the directive later",
    "Deliberately NOT" in notifications,
)

# =====================================================================
print(f"\n{'=' * 60}")
if failures:
    print(f"{len(failures)} FAILED:")
    for item in failures:
        print(f"  - {item}")
else:
    print("Every security property re-derived from the code holds.")
print("=" * 60)

sys.exit(1 if failures else 0)
