#!/usr/bin/env python3
"""
The Sprint 8 invariants a type checker cannot see.

Sprint 7's risks were spam and leaking one customer's details to another.
Sprint 8's risks are money: a discount that the client decides, a float that
loses a fil, four promotions silently stacking, a points rate invented in
code. Every one of those compiles.

Each check below corresponds to a line in the Sprint 8 brief.
"""

import pathlib
import re
import sys

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

ACTION_FILES = [
    "app/admin/offers/actions.ts",
]

OFFER_SOURCE = (
    sorted((REPO / "src/components/offers").glob("*.tsx"))
    + sorted((REPO / "src/lib/supabase").glob("offer*.ts"))
    + sorted((REPO / "src/lib/utils").glob("offer*.ts"))
    + sorted((REPO / "src/lib/utils").glob("campaign*.ts"))
    + sorted((REPO / "src/lib/validation").glob("offers.ts"))
    + sorted((REPO / "app/admin/offers").rglob("*.ts"))
    + sorted((REPO / "app/admin/offers").rglob("*.tsx"))
)

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
    `): Promise<{ id?: string }> {` puts a brace inside the return type, and
    starting there captures the annotation instead of the body. So walk the
    parameter list to its closing paren, then take the first brace outside
    any angle brackets.
    """
    out = []

    for match in re.finditer(r"^export async function (\w+)\(", text, flags=re.M):
        name = match.group(1)

        depth, i = 0, match.end() - 1
        while i < len(text):
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1

        angle, brace = 0, None
        for j in range(i, len(text)):
            ch = text[j]
            if ch == "<":
                angle += 1
            elif ch == ">":
                angle -= 1
            elif ch == "{" and angle == 0:
                brace = j
                break

        if brace is None:
            continue

        depth, k = 0, brace
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1

        out.append((name, text[brace : k + 1]))

    return out


print("=" * 60)
print("SPRINT 8 — OFFERS SECURITY AUDIT")
print("=" * 60)

# =====================================================================
print("\n1. Every server action checks permission on the server")
# =====================================================================
#
# A client that hides a button is a courtesy. The action behind it is a URL.

unguarded = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for name, body in split_functions(text):
        # Module-agnostic: beginXAction / requireXPermission.
        guarded = bool(re.search(r"begin\w+Action\(|require\w+Permission\(", body))
        if not guarded:
            unguarded.append(f"{path}::{name}")

report("every exported action begins with a permission check", not unguarded, "\n".join(unguarded))

# =====================================================================
print("\n2. Every action validates its input with a schema")
# =====================================================================
#
# The input is whatever was posted, not whatever the form sends.

unvalidated = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for name, body in split_functions(text):
        if ".safeParse(" not in body:
            unvalidated.append(f"{path}::{name}")

report("every exported action parses its input", not unvalidated, "\n".join(unvalidated))

# =====================================================================
print("\n3. Changing what is live needs publish, not just manage")
# =====================================================================
#
# "Never trust client-side discount calculations" has a sibling: never let
# edit permission become publish permission. Editing a draft and switching a
# campaign on are different acts.

actions_text = (REPO / "app/admin/offers/actions.ts").read_text()
bodies = dict(split_functions(actions_text))

lifecycle = ["setOfferStatusAction", "archiveOfferAction", "bulkSetOfferStatusAction", "bulkArchiveOffersAction"]
wrong_gate = [
    name
    for name in lifecycle
    if name in bodies and '"publish"' not in bodies[name]
]

report(
    "every lifecycle action is gated on publish",
    not wrong_gate,
    "\n".join(f"{n} does not ask for publish" for n in wrong_gate),
)

# A save that asks for a live status without publish must not go live.
upsert = bodies.get("upsertPromotionAction", "")
downgrades = "draft" in upsert and re.search(r"publish|canPublish", upsert) is not None

report(
    "saving a live status without publish falls back to draft",
    downgrades,
    "" if downgrades else "upsertPromotionAction does not downgrade; check it cannot publish by accident",
)

# =====================================================================
print("\n4. Money is fils, and never a float")
# =====================================================================
#
# sales-money.ts is the one money module. A parseFloat on a price is how a
# discount loses a fil per deal and the ledger stops balancing.

float_money = []
for path in OFFER_SOURCE:
    text = path.read_text()
    rel = path.relative_to(REPO)

    for pattern, why in [
        (r"parseFloat\s*\([^)]*(?:price|amount|discount|fils|total)", "parseFloat on money"),
        (r"Number\s*\([^)]*(?:price|amount|fils)[^)]*\)\s*[*/]", "Number() on money then arithmetic"),
        (r"(?:price|amount|discount)\w*\s*[*/]\s*100(?![0-9])", "scaling money by 100 by hand"),
    ]:
        for found in re.finditer(pattern, text, re.I):
            line = text[: found.start()].count("\n") + 1
            float_money.append(f"{rel}:{line} — {why}")

report("no floating-point arithmetic on money", not float_money, "\n".join(float_money))

# The deal-facing money helpers are the shared ones, not a local copy.
money_users = [p for p in OFFER_SOURCE if re.search(r"\bfils\b", p.read_text())]
local_formatters = []
for path in money_users:
    text = path.read_text()
    rel = path.relative_to(REPO)
    if re.search(r"function\s+(?:format|to)\w*[Ff]ils", text) and "sales-money" not in str(rel):
        local_formatters.append(f"{rel} defines its own fils helper")

report("fils handling uses sales-money.ts, not a second copy", not local_formatters, "\n".join(local_formatters))

# =====================================================================
print("\n5. The discount is decided on the server")
# =====================================================================
#
# "The authoritative final pricing must be validated server-side. Client
# previews must not be the source of truth."

# A preview component must not be the thing an action writes.
preview_written = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    if re.search(r"discount_fils\s*:\s*\w*(?:preview|client|input\.(?:computed|final))", text, re.I):
        preview_written.append(f"{path} writes a client-supplied discount")

report("no action writes a client-computed discount", not preview_written, "\n".join(preview_written))

# The rules engine is pure and server-usable: no DOM, no window.
engine = (REPO / "src/lib/utils/offer-rules.ts").read_text()
engine_clean = "window." not in engine and "document." not in engine and '"use client"' not in engine

report("the rules engine is pure and runs on the server", engine_clean)

# =====================================================================
print("\n6. Unknown rules fail closed")
# =====================================================================
#
# A rule kind the code does not recognise must mean "not eligible". Failing
# open would turn a typo in SQL into a free discount.

#
# EVERY default: in the engine, not just one of them. offer-rules.ts has two
# switches — target kinds and rule kinds — and both have to fail closed. An
# earlier version of this check used a DOTALL regex that matched any
# "return false" anywhere in the file, so flipping a default to `true` still
# passed. A check that cannot fail is not a check.

open_defaults = []
for found in re.finditer(r"\bdefault:", engine):
    tail = engine[found.end() : found.end() + 500]

    # Skip comments to the first real statement.
    stripped = re.sub(r"/\*.*?\*/", "", tail, flags=re.S)
    stripped = re.sub(r"//[^\n]*", "", stripped)
    first = next((line.strip() for line in stripped.splitlines() if line.strip()), "")

    if first != "return false;":
        line_no = engine[: found.start()].count("\n") + 1
        open_defaults.append(f"offer-rules.ts:{line_no} — default returns {first or '(nothing)'}")

report(
    "every switch default in the rules engine returns false",
    not open_defaults,
    "\n".join(open_defaults),
)

# And the file says why, so nobody 'tidies' it into failing open later.
explains = re.search(r"fails closed|unknown rule kind", engine, re.I) is not None
report("the engine records why it fails closed", explains)

# =====================================================================
print("\n7. Stacking is off unless configured")
# =====================================================================
#
# "Default to a safe non-stacking policy until configured."

types_text = (REPO / "src/lib/types/offers.ts").read_text()
default_none = re.search(r'STACKING_POLICIES = \["none"', types_text) is not None

report("the first stacking policy is 'none'", default_none)

validation_text = (REPO / "src/lib/validation/offers.ts").read_text()
schema_defaults_none = 'default("none")' in validation_text or '.default("none")' in validation_text

report(
    "the create schema defaults stacking to none",
    schema_defaults_none,
    "" if schema_defaults_none else "no .default(\"none\") found — a missing field could mean 'stack with everything'",
)

# =====================================================================
print("\n8. No points conversion is invented in code")
# =====================================================================
#
# "Do not assume one point equals AED 1." The rate lives in loyalty_settings
# and nowhere else.

hardcoded_rate = []
for path in OFFER_SOURCE:
    text = path.read_text()
    rel = path.relative_to(REPO)

    for pattern in [
        r"points\s*[*/]\s*(?!0\b)\d",
        r"(?:point_value|pointValue|redemption_rate|redemptionRate)\s*=\s*\d",
        r"1\s*point\s*=\s*(?:AED\s*)?1",
    ]:
        for found in re.finditer(pattern, text, re.I):
            line = text[: found.start()].count("\n") + 1
            hardcoded_rate.append(f"{rel}:{line} — a points rate in code")

report("no points-to-money rate is hardcoded", not hardcoded_rate, "\n".join(hardcoded_rate))

# =====================================================================
print("\n9. Archived campaigns stay out of every read")
# =====================================================================

queries = (REPO / "src/lib/supabase/offer-queries.ts").read_text()

#
# LIST reads must filter archived_at. A read of ONE campaign by id must not:
# the detail page is where an archived campaign is viewed and restored from,
# so filtering there would make an archived campaign unreachable and
# un-restorable. Those are different operations, so the check distinguishes
# them rather than demanding the same thing of both.

reads = re.findall(r'\.from\("promotions"\)(.*?)(?=\n\n|\.from\(|$)', queries, re.S)

unfiltered = []
for chunk in reads:
    if "archived_at" in chunk:
        continue

    # NO "count" EXCLUSION.
    #
    # There used to be one, to skip aggregate-only reads. It skipped
    # getOfferList as well, because that passes { count: "exact" } to get a
    # total — so the module's main list read was exempt from the check, and
    # deleting its archived filter still passed. Found by mutation testing.
    #
    # An archived campaign should not be counted in a total either, so an
    # aggregate read needs the filter as much as a row read does.

    # A by-id read: .eq("id", …) with maybeSingle/single.
    by_id = '.eq("id"' in chunk and ("maybeSingle" in chunk or "single()" in chunk)
    if by_id:
        continue

    unfiltered.append(chunk.strip().splitlines()[0] if chunk.strip() else "(empty)")

report(
    "every promotions LIST read filters archived_at",
    not unfiltered,
    "\n".join(f"unfiltered: {line}" for line in unfiltered),
)

# And the by-id read deliberately does NOT filter, so an archived campaign
# stays reachable and restorable. Asserted on the chunk itself so that
# somebody "fixing" it is caught — the earlier version of this check only
# looked for archived_at anywhere in the file, which adding the filter would
# not have broken.

by_id_chunks = [
    chunk
    for chunk in reads
    if '.eq("id"' in chunk and ("maybeSingle" in chunk or "single()" in chunk)
]

if not by_id_chunks:
    report("the detail read was found at all", False, "no by-id promotions read in offer-queries.ts")
else:
    over_filtered = [chunk for chunk in by_id_chunks if "archived_at" in chunk]

    report(
        "the detail read keeps archived campaigns reachable",
        not over_filtered,
        "the by-id read filters archived_at — an archived campaign could not be viewed or restored"
        if over_filtered
        else "",
    )

# =====================================================================
print("\n10. Nothing relies on a browser clock to activate an offer")
# =====================================================================
#
# "Do not rely on a browser timer to activate or expire offers."

client_decides = []
for path in OFFER_SOURCE:
    text = path.read_text()
    rel = path.relative_to(REPO)

    if '"use client"' not in text:
        continue

    # A client file may *display* a window; it must not decide status from one.
    for found in re.finditer(r"status\s*=\s*[\"'](?:active|expired)[\"']", text):
        line = text[: found.start()].count("\n") + 1
        client_decides.append(f"{rel}:{line} — a client file assigns a live status")

report("no client file decides a campaign's status", not client_decides, "\n".join(client_decides))

# The database has a sweep function, so expiry does not depend on a visit.
sql = pathlib.Path("/home/claude/sprint-8/sql/01-phase-2-promotions.sql").read_text()
has_sweep = "sweep_promotion_statuses" in sql

report("the database can expire campaigns on its own", has_sweep)

# =====================================================================
print("\n11. Redemptions are append-only")
# =====================================================================
#
# "Do not delete ledger transactions." A reversal is a new row, not an edit.

deletes = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for found in re.finditer(r'from\("(?:offer_redemptions|loyalty_ledger)"\)\s*\.\s*delete\(', text):
        line = text[: found.start()].count("\n") + 1
        deletes.append(f"{path}:{line} — deletes a ledger row")

report("no action deletes a redemption or ledger row", not deletes, "\n".join(deletes))

append_only_guard = "guard_loyalty_ledger_append_only" in pathlib.Path(
    "/home/claude/sprint-8/sql/02-phase-3-loyalty.sql"
).read_text()

report("the database refuses ledger edits regardless of the code", append_only_guard)

# =====================================================================
print("\n12. A promotion change cannot rewrite a finished sale")
# =====================================================================
#
# "Promotion changes must not retroactively modify completed sales."

touches_deals = []
for path in ACTION_FILES:
    text = (REPO / path).read_text()
    for found in re.finditer(r'from\("sales_deals"\)\s*\.\s*(?:update|delete)\(', text):
        line = text[: found.start()].count("\n") + 1
        touches_deals.append(f"{path}:{line} — an offers action writes to sales_deals")

report("no offers action writes to sales_deals", not touches_deals, "\n".join(touches_deals))

# =====================================================================
print("\n13. Code limits are enforced under a row lock, not in JavaScript")
# =====================================================================
#
# "Do not allow race conditions to exceed redemption limits."
#
# Checking used_count and then inserting is two statements. Two tills can
# both pass the check before either writes, so a code limited to 50 gets
# used 52 times and nothing in the log looks wrong. The only fix is a lock
# the database holds across both, which application code cannot express.

code_sql = pathlib.Path("/home/claude/sprint-8/sql/04-phase-12-code-redemption.sql").read_text()

has_redeem = "redeem_promotion_code" in code_sql
report("a database function owns code redemption", has_redeem)

# The lock must come before any counting.
locked = False
if has_redeem:
    body_start = code_sql.index("create or replace function public.redeem_promotion_code")
    body = code_sql[body_start : body_start + 6000]

    lock_at = body.find("for update")
    count_at = body.find("used_count >=")

    locked = lock_at != -1 and (count_at == -1 or lock_at < count_at)

report(
    "the row lock is taken before any limit is counted",
    locked,
    "" if locked else "a limit is checked before 'for update' — two sessions could both pass it",
)

# And the application must not be deciding limits itself.
js_limit_checks = []
for path in OFFER_SOURCE:
    text = path.read_text()
    rel = path.relative_to(REPO)

    for pattern in [
        r"used_?[Cc]ount\s*[<>]=?\s*\w*(?:usage|limit)",
        r"(?:usage|per_?customer)_?[Ll]imit\s*[<>]=?\s*\w*used",
    ]:
        for found in re.finditer(pattern, text):
            line = text[: found.start()].count("\n") + 1
            js_limit_checks.append(f"{rel}:{line} — a redemption limit compared in application code")

report(
    "no redemption limit is decided in application code",
    not js_limit_checks,
    "\n".join(js_limit_checks),
)

# =====================================================================
print("\n14. A reversal is a status change, never a delete")
# =====================================================================

reversal_deletes = "delete from public.offer_redemptions" in code_sql
report("the reversal function does not delete the row", not reversal_deletes)

keeps_reason = "reversal_reason" in code_sql and "reason_required" in code_sql
report("a reversal cannot be recorded without a reason", keeps_reason)

# =====================================================================
print("\n15. The audit trail cannot be written from the client")
# =====================================================================

activity_sql = pathlib.Path("/home/claude/sprint-8/sql/05-phase-13-promotion-activity.sql").read_text()

has_select_policy = "promotion_activity_select" in activity_sql
no_write_policy = not re.search(
    r"create policy \w+ on public\.promotion_activity\s+for (insert|update|delete)",
    activity_sql,
)

report("promotion_activity is readable with offers.view", has_select_policy)
report("promotion_activity has no insert, update or delete policy", no_write_policy)

# The trigger, not an action, writes it — so a change made in the SQL
# editor is logged too.
trigger_written = "promotions_log_activity" in activity_sql and "after insert or update on public.promotions" in activity_sql
report("a trigger writes it, so every path is logged", trigger_written)

# =====================================================================
print("\n16. Sales integration goes through the existing pricing path")
# =====================================================================
#
# "Preserve existing manual discounts, approval thresholds, fees, VAT
# behavior, verified payment records, deal price history."
#
# save_deal_pricing owns all of that and its source is not in this repo. So
# the promotion path must call it, not write to sales_deals itself — a direct
# update would skip the approval test, the fee rebuild, the VAT and the price
# history in one go.

sales_promo_path = REPO / "app/admin/sales/promotion-actions.ts"

if not sales_promo_path.exists():
    report("the Sales promotion action exists", False, "app/admin/sales/promotion-actions.ts missing")
else:
    sales_promo = sales_promo_path.read_text()

    direct_writes = []
    for found in re.finditer(r'from\("sales_deals"\)\s*\.\s*(?:update|delete|insert)\(', sales_promo):
        line = sales_promo[: found.start()].count("\n") + 1
        direct_writes.append(f"promotion-actions.ts:{line} — writes to sales_deals directly")

    report(
        "the promotion action never writes to sales_deals directly",
        not direct_writes,
        "\n".join(direct_writes),
    )

    goes_through = 'rpc("save_deal_pricing"' in sales_promo
    report("it saves through save_deal_pricing", goes_through)

    # The combined discount, not just the promotion's — otherwise applying a
    # promotion would wipe the manual discount already on the deal.
    combines = "manualFils + chosen.discountFils" in sales_promo or "combinedFils" in sales_promo
    report("the manual discount is added, not replaced", combines)

    # p_fee_type_ids rebuilds the deal's fees, so passing an empty list would
    # delete them.
    passes_fees = "p_fee_type_ids: feeTypeIds" in sales_promo
    report("the deal's existing fee types are passed back", passes_fees)

    # A fee whose type was retired cannot be passed back, so it must refuse
    # rather than silently drop the charge.
    guards_retired = "retired" in sales_promo and "Use Edit pricing" in sales_promo
    report(
        "a retired fee makes it refuse rather than drop the fee",
        guards_retired,
        "" if guards_retired else "a deal with a retired fee type would lose that fee",
    )

    # Completed and cancelled deals.
    guards_final = "FINAL_DEAL_STATUSES" in sales_promo
    report("final deals are refused, using the Sales module's own list", guards_final)

    # Concurrency.
    guards_concurrent = "expectedUpdatedAt" in sales_promo and "updated_at !== input.expectedUpdatedAt" in sales_promo
    report("a concurrent edit to the deal is caught", guards_concurrent)

# =====================================================================
print("\n17. The client never names its own discount")
# =====================================================================
#
# "Never trust client-side discount calculations." The panel sends which
# promotion; the server works out how much.

panel_path = REPO / "src/components/sales/detail/deal-promotions-panel.tsx"

if panel_path.exists():
    panel = panel_path.read_text()

    # The apply call's arguments.
    call = re.search(r"applyPromotionToDealAction\(\{(.*?)\}\)", panel, re.S)

    if not call:
        report("the apply call was found", False)
    else:
        args = call.group(1)
        sends_money = bool(re.search(r"(discount|amount|fils|price)\w*\s*:", args, re.I))

        report(
            "the apply call sends no discount figure",
            not sends_money,
            f"sends: {args.strip()}" if sends_money else "",
        )

    # And the server recalculates rather than reading a figure from input.
    if sales_promo_path.exists():
        recalculates = "evaluateOffersForCar" in sales_promo and "chosen.discountFils" in sales_promo
        report("the server recalculates the discount from the campaign", recalculates)

# =====================================================================
print("\n18. Inventory's existing pricing behaviour is untouched")
# =====================================================================
#
# "Preserve existing Inventory pricing behavior." The panel is additive: the
# original preview function and its two callers keep working, and the tab
# renders as before without the new prop.

preview_path = REPO / "src/lib/utils/price-preview.ts"
preview_src = preview_path.read_text()

report(
    "computePricePreview still exists with its own signature",
    "export function computePricePreview(" in preview_src
    and "regularPrice: number | null" in preview_src,
)

tab_src = (REPO / "src/components/inventory/view-car/tabs/pricing-tab.tsx").read_text()

# The new prop must be optional, or every existing render breaks.
optional_prop = "promotions = null" in tab_src and "promotions?:" in tab_src
report(
    "the new Inventory prop is optional and defaults to null",
    optional_prop,
    "" if optional_prop else "a required prop would break any caller that does not pass it",
)

still_uses_original = "computePricePreview(" in tab_src
report("the tab still uses the original preview for its own rows", still_uses_original)

# =====================================================================
print("\n19. Discount precision cannot be silently rounded")
# =====================================================================
#
# percentToBps does Math.round(percent * 100), so 12.345% becomes 12.35% —
# AED 50 on a million-dirham car, given away by a rounding step. And a fixed
# discount is rounded to whole dirhams. Both are refused at entry instead.

two_decimals = "at most two decimals" in validation_text
whole_dirhams = "whole dirhams" in validation_text

report("a percentage with more than two decimals is refused", two_decimals)
report("a fixed discount with decimals is refused", whole_dirhams)

# =====================================================================
print("\n" + "=" * 60)
if failures:
    print(f"{len(failures)} FAILED:")
    for item in failures:
        print(f"  - {item}")
    print("=" * 60)
    sys.exit(1)

print("All Sprint 8 security invariants hold.")
print("=" * 60)
