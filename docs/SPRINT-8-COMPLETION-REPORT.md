# Sprint 8 — Offers, Discounts, Promotions & Loyalty

Completion report. 26 phases, delivered in eight batches.

## Status

Complete. `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`
all pass.

```
lint     0 errors, 8 warnings (all pre-existing <img> warnings in
         Inventory and Customers, untouched by this sprint)
tsc      clean
test     10 files, 347 assertions, all passing
build    37 pages, compiled successfully
```

## Start here: the migration bug

**If you take one thing from this report, take this.**

`sql/01-phase-2-promotions.sql` as originally shipped inserted the new
permission keys into `public.permissions`. That table does not exist in this
schema — the real one is
`public.app_permissions (key, module, label, description, sort_order)`, as
used by `docs/sprint-7-migration.sql`.

Because `01` is wrapped in `begin` / `commit`, that single bad statement
rolled back **the entire migration**. The result was a database with none of
the Sprint 8 tables and none of the Sprint 8 permission keys, which is why
every offers page reported "you don't have permission to view" — the message
was accurate, because the permission genuinely did not exist.

Fixed, and verified by reproducing the failure on a real Postgres 16 and then
applying the corrected chain from a fresh schema:

- all ten scripts commit clean
- `get_my_permissions()` returns all 8 offer and loyalty keys
- the whole chain is **safe to re-run**, so it does not matter which scripts
  applied before the failure: 8 keys, 8 grants, one `loyalty_settings` row,
  13 tables, no duplicates

`sql/00-FIX-permissions-table.sql` reports the state it finds before changing
anything, and grants all 8 keys to a named role — edit the role name on its
`where r.name = 'Super Admin'` line if yours differs, or the grant silently
does nothing.

## Run order

```
00-FIX-permissions-table.sql        permission keys and grants
01-phase-2-promotions.sql           promotions, targeting, codes, redemptions
02-phase-3-loyalty.sql              settings, wallets, ledger, earn rules
03-promotions-created-at.sql        adds promotions.created_at if missing
04-phase-12-code-redemption.sql     code redemption and reversal
05-phase-13-promotion-activity.sql  promotion activity log
06-sweep-reports-old-status.sql     fixes the status sweep's reporting
07-phases-19-21-loyalty-functions.sql  earn, reserve, redeem, adjust, reverse
08-phase-23-notification-types.sql  widens the notifications CHECK constraints
09-phase-23-earn-on-deal.sql        credits points when a sale finishes
```

## What Batch 8 added

### Phase 23 — Notifications and audit

Eight notification types wired into the existing notification system:
`offer_assigned`, `offer_expiring`, `promotion_started`, `promotion_paused`,
`points_earned`, `points_redeemed`, `points_expiring`, `points_adjusted`.

All eight go to **staff**. No customer is contacted, because there is no
customer email or WhatsApp integration in this application, and nothing
claims otherwise. See `docs/offer-notifications.md`.

Two of the eight — `offer_expiring` and `points_expiring` — are written and
callable but have no call site, because they are due at a time rather than in
response to an action. They need a scheduled job; the queries are in the
documentation, ready to use. This follows `notifyEnquiryFollowUpDue` and
honours the plan's rule against browser timers.

Audit coverage was already in place from earlier batches and needed no new
tables: `promotion_activity` (campaign created, edited, status changed),
`promotion_status_history` (every transition), `loyalty_ledger` (append-only,
every point movement including reversals), `loyalty_settings_history` (every
settings change), `offer_redemptions` (every discount given, with its
reversal).

### Phase 24 — Reports and exports

Four datasets, as PDF and Excel, through the existing export architecture:
campaigns (current filter or ticked selection), redemption history,
personalised offers, and the loyalty ledger.

- Requires `offers.export`, which is deliberately not `offers.view`
- Uses the RLS-respecting client, so a person exports only what they can
  already see
- Capped at 5,000 rows, and an incomplete file **says so** — in the subtitle
  of the workbook, in red above the table in the PDF, in the
  `X-Export-*` headers, and as a warning toast rather than a success one
- Money is formatted once, from `bigint` fils to an exact decimal string, and
  passed through untouched

`src/lib/utils/offer-list-params.ts` is new: one parser for the offers list
URL, used by both the page and the export route. Without it the export's
claim to hold "the campaigns on screen" would depend on two copies of the
same parsing staying in step.

### Phase 25 — Security and UX review

`checks/audit-offers-security.py` — all Sprint 8 security invariants hold
(19 groups, 37 checks). `checks/audit-a11y.py offers` — clean across 41
components; the two findings it reports are pre-existing in the enquiries
module.

### Phase 26 — Testing

`npm test` now exists and works. This is a real gap closed, not a tidy-up:
the test files shipped in earlier batches **were never runnable in this
repo**. They import application modules via the `@/` alias, which Next.js and
`tsc` resolve but plain Node does not, so every one of them failed before its
first assertion.

- `test/alias-hooks.mjs` applies the same mapping `tsconfig.json` declares
- `test/run.mjs` runs each file in its own process, because several call
  `process.exit()` when they finish — importing them into one process means
  the first to exit takes the whole run with it, and the suite reports success
  having run one file out of ten
- `tsconfig.json` gained `allowImportingTsExtensions`, which clears the 11
  pre-existing `tsc` errors from those files without excluding them from type
  checking

## The gap Batch 8 closed

**Nothing credited loyalty points.**

Phase 19 built `earn_loyalty_points()`. It was correct, idempotent, granted
to `authenticated`, and **never called** — no trigger, no application code.
The plan's own test flow, "Complete Eligible Sale → Verify Qualification →
Credit Points → Update Wallet", had no code behind its third step. A customer
could complete any number of sales and accrue nothing.

Closed with `sql/09-phase-23-earn-on-deal.sql` and
`src/lib/supabase/loyalty-settlement.ts`, wired into `transitionDealAction`:

- `Confirmed` or `Completed` may credit, if that earn rule is enabled
- `Cancelled` claws back, under the configured refund policy
- everything else earns nothing — no points for a lead, an enquiry, or an
  unpaid reservation

`earn_loyalty_for_deal()` decides everything itself: the customer comes from
the deal rather than the caller, the deal's status must actually match the
event, the idempotency key is derived rather than supplied, and
`manual_bonus` is refused outright — that event is a staff member granting
goodwill points, which needs `loyalty.adjust` and goes through
`adjust_loyalty_points()`. Without that refusal, anyone who could reach the
function could grant points without holding the permission.

Verified with 13 scripted assertions against a real database, including the
status gate, the `manual_bonus` refusal, idempotency, and that the wallet
cache still agrees with the ledger afterwards.

## Four defects found while building Batch 8

Worth recording, because each was a silent failure rather than an error.

**1. The notification CHECK rebuild would have revoked working types.**
The first version of `08` rebuilt `notifications.type` from the values present
in the table, copying the technique `04-phase-19-audit-types.sql` uses for
`enquiry_activity`. Tested against a constraint allowing five types with rows
for one, it dropped the other four. On a real database that is lead, enquiry,
test drive and payment notifications failing weeks later. Now reads the
allowed values out of the constraint definition itself and unions them, so
the list can only grow. Mutation-tested: 0 of 4 survive with the old
approach, 4 of 4 with the fix.

**2. Promotion status casing.** `promotions.status` is lowercase;
`sales_deals.status` is capitalised. `notifyPromotionStatusChanged` compared
against `"Active"` and would never have matched, so campaign notifications
would have silently never fired. Found by checking the CHECK constraint
rather than assuming. Now normalised.

**3. A client component pulling the server Supabase client into the browser
bundle.** `offer-export-menu.tsx` imported one constant from
`offer-export-queries.ts`, which imports `supabase/server`, which reaches
`next/headers`. `tsc` was clean; the build refused it. The dataset names now
live in `src/lib/types/offer-export.ts`, which imports nothing.

**4. Two columns that do not exist.** The export queries were written against
`offer_redemptions.created_at` and `cars.make/model/year`. The real columns
are `redeemed_at`, and `display_title` / `stock_id` / `manufacturing_year` —
`cars` has brand and model as foreign keys. Caught by reading
`information_schema` rather than trusting the draft.

A fifth is worth noting because it was mine and not a bug: my own test
asserted that `Number("92233720368.54")` loses precision. It does not — 13
significant digits is comfortably within a double. The real risk at
dealership scale is duller and more likely: `Number("5000.00")` is `5000`, so
parsing a money string to "format" it drops the cents. The test now asserts
that, and is mutation-tested to prove it fails if anyone "tidies"
`formatCellMoney` into `Number(value).toFixed(2)`.

## Known limitations

**Two notifications need a scheduled job.** `offer_expiring` and
`points_expiring` will not fire until one exists. So will
`expire_loyalty_points()` and `sweep_loyalty_reservations()`. The queries are
in `docs/offer-notifications.md`.

**Loyalty ships switched off.** No points are earned or redeemable until the
conversion is configured and the programme enabled. The
`loyalty_settings_enabled_needs_config` constraint refuses to let it be
enabled without a rate, so it cannot be switched on by accident. No earn rule
is enabled either. This is deliberate: the plan says not to activate any
conversion until it is configured and approved.

**No ROI or attribution figures.** The exports report discounts given — money
actually forgone, summed exactly from fils — and keep that separate from any
notion of campaign revenue. The plan says not to invent ROI without a
defensible attribution method, and there isn't one yet.

**Three permissions are not granted automatically.** `offers.publish`,
`loyalty.adjust` and `loyalty.settings` go only to the role named in
`00-FIX-permissions-table.sql`. They activate campaigns, move points, and set
what every future point is worth. Grant them deliberately.

**Bulk status changes send one summary notification, not one per campaign.**
Pausing twenty campaigns is one decision by one person; twenty notifications
each to everybody who manages campaigns is how a notification list stops
being read.

## Not pushed

Batch 8 is on `sprint-8` in your working copy only. Nothing has been
committed or pushed — the plan says not to merge or push to protected
branches without approval, so that is yours to do.
