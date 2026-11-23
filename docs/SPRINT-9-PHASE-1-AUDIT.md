# Sprint 9 — Phase 1: Reports & Payments audit

Architecture and gap report. No application code has been changed.

---

## 1. Branch verification

| check | result |
|---|---|
| Remote branches | `main`, `sprint-6`, `sprint-7`, `sprint-8` |
| Latest Sprint 8 work | `origin/sprint-8` @ `64c4d02` "Sprint 8 Completed" |
| Does it contain Batch 8? | **Yes** — all 8 spot-checked files present, including `sql/08`, `sql/09` and `sql/00-FIX` |
| Does it contain the `app_permissions` migration fix? | **Yes** |
| Approved base for Sprint 9 | **`origin/sprint-8`** |
| `sprint-9` created from it | Yes, locally. Not pushed. |

Baseline health on that base, before any Sprint 9 change:

```
npx tsc --noEmit    clean
npm test            All 10 test file(s) passed
```

Nothing was lost in the handover: every Batch 8 file in my working copy compared
byte-identical to your pushed version before I branched.

---

## 2. The six questions the prompt asks — answered

### 2.1 Are report totals silently capped?

**Yes. This is the most serious reporting finding.**

`src/lib/supabase/sales-report-queries.ts` caps every aggregate query:

```ts
const AGGREGATE_LIMIT = 5000;

completedQuery  ... .limit(AGGREGATE_LIMIT)
createdQuery    ... .limit(AGGREGATE_LIMIT)
openQuery       ... .limit(AGGREGATE_LIMIT)
paymentsQuery   ... .limit(AGGREGATE_LIMIT * 2)
```

Then every KPI is computed from the rows that came back:

```ts
created:        createdRows.length
completed:      completedRows.length
completedValue: completedRows.reduce(...)
collected:      paymentsResult.data.reduce(...)
```

None of these queries asks for `count: "exact"`, so **nothing in the system can
tell whether the cap bit.** Past 5,000 deals in a window, "Deals created" reports
exactly 5000 and `completedValue` is the sum of an arbitrary 5,000 rows — with no
warning anywhere. The 5,000 figure is comfortable for one month today and is not
comfortable for `?range=all`, which is a selectable option.

A second, nearer limit sits at line 211: the completed-deal values are fetched
with `.in("id", ids)` where `ids` can hold 5,000 UUIDs. That is a ~185 KB query
string and will fail or be truncated by PostgREST well before the row cap is
reached.

Note the existing code *does* handle this correctly for the table view — there is
a `TABLE_LIMIT` of 500 with a comment explaining that the table says so and points
at the export. The aggregates simply never got the same treatment.

### 2.2 Do report date ranges use UAE business time?

**No.** `resolveRange` builds every boundary in the **server's** timezone:

```ts
case "this-month":
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
```

`new Date(y, m, 1)` is midnight *local to the process*. On Vercel and Supabase
that process runs in UTC. Dubai is UTC+04:00, so "this month" actually begins at
`2026-11-01T00:00:00Z` = **04:00 on 1 November, Dubai time**.

Consequence: every deal completed between midnight and 04:00 Dubai on the first
of a month is reported in the **previous** month. The same four-hour error applies
to `last-month`, `last-90` (`setHours(0,0,0,0)`) and `year`.

This is not a theoretical concern, because the rest of the codebase already
disagrees with it:

| module | boundary used |
|---|---|
| Payments (`payment-actions.ts`) | `getDubaiToday()` — **Dubai** |
| Sprint 8 exports (`offer-export-columns.ts`) | `timeZone: "Asia/Dubai"` — **Dubai** |
| Sprint 8 notifications | `Asia/Dubai` — **Dubai** |
| **Sales reports** (`resolveRange`) | **server local / UTC** |

So a payment recorded "today" in Dubai terms can fall outside a report window
that claims to cover today.

### 2.3 Are sales and payments counted on consistent definitions?

**Partly — with one concrete type problem.**

The date attribution is deliberate and defensible, and the file documents it:
completed deals by `completed_at`, created deals by `created_at`, payments by
`paid_on`. That part is sound.

The problem is `paid_on`. `recordPaymentAction` writes it from `getDubaiToday()`,
so it is a **calendar date**. The report then filters it with a full timestamp:

```ts
paymentsQuery.gte("paid_on", from.toISOString())   // "2026-11-01T00:00:00.000Z"
```

A `date` column compared against a timestamp string gets coerced, and the result
depends on the session timezone — a second, independent source of boundary error
on exactly the figure that matters most (verified cash). Date columns should be
filtered with date strings.

Separately, `outstanding` counts only `status === "Confirmed"`:

```ts
const outstanding = openRows
  .filter((row) => row.status === "Confirmed")
  .reduce((sum, row) => sum + num(row.balance_due), 0);
```

Reserved and Negotiation deals with a balance are excluded. That may well be the
intended business definition, but it is written nowhere and shown nowhere — the
card just says "Outstanding".

### 2.4 Does the win rate use a valid denominator and time cohort?

**No. The figure can exceed 100% and routinely will.**

```ts
winRate: createdRows.length === 0
  ? null
  : Math.round((completedRows.length / createdRows.length) * 100)
```

The numerator is *deals completed in the window*. The denominator is *deals
created in the window*. Those are two different populations. With any sales cycle
longer than the reporting window, deals complete in a month in which they were
not created.

I encoded the exact formula and ran it against an ordinary November for a
dealership with a roughly two-month cycle (`checks/winrate-demo.py`):

```
deals created in window   : 6
deals completed in window : 9

CURRENT formula  : 150%   <-- shown on the "Win rate" card
cohort-correct   : 33%    (of deals created in Nov, how many closed)

The current figure EXCEEDS 100%, which a rate cannot.
The two differ by 117 percentage points on this ordinary month.
```

The prompt names this twice — "whether the reported win rate uses a valid
denominator and time cohort", and "avoid misleading conversion or win-rate
calculations". It is the clearest example in the module of a number that looks
authoritative and is not.

### 2.5 Are refunds and reversed payments treated correctly?

**The data model is right. The presentation conflates two metrics the prompt
requires to be distinct.**

What is correct:

- A **refund** is a new `sales_payments` row with `direction: "out"`, `kind:
  "Refund"`, and it requires `payments.reverse` to record.
- A **reversal** is a status change on an existing row to `Reversed`.
- These are genuinely different things, which is what §12 of the prompt asks for.
- A reversed payment drops out of `collected` because the query filters
  `.eq("status", "Verified")`.

What is wrong:

```ts
collected: (payments).reduce((sum, row) =>
  sum + (row.direction === "out" ? -num(row.amount) : num(row.amount)), 0)
```

This is **Net Verified Cash Movement**. The card is labelled **"Collected"**.
§6 of the prompt lists "Verified Payments Collected" and "Net Verified Cash
Movement" as two separate metrics and says never to combine concepts into an
ambiguous total. Today a month with AED 2m collected and AED 2m refunded shows
"Collected: 0".

One date-attribution consequence worth a decision: because reversal mutates
status rather than appending, re-running last month's report after a reversal
shows **less** collected than it did before. That is arguably correct — the money
did not stay — but it means reports are not reproducible, and that should be a
stated rule rather than an accident.

### 2.6 Do financial report queries obey RLS?

**The application side is correct. The database side cannot be verified from the
repository, and that is itself a finding.**

Correct: every report query uses `createClient()` — the RLS-respecting client —
and reads `sales_deal_list` / `sales_payment_list`, the same views the Sales and
Payments screens use. No report uses the admin client. The file's own header says
this is deliberate, and it is the right call.

The gap: **no SQL in this repository defines `sales_payments`, `sales_deal_list`
or `sales_payment_list`.** They were created directly in Supabase during Sprint 6.
I therefore cannot confirm:

- whether those views are declared `WITH (security_invoker = true)`. On Postgres
  15+, a view **without** it runs with the *view owner's* rights, which would
  bypass RLS on the base tables and expose company-wide totals to any staff
  member who can read the view. This is precisely the risk the prompt flags for
  Phase 2, and it applies to the views that already exist.
- the real column types for `amount`, `total_due`, `balance_due` and `paid_on`.

This needs a read-only check in your Supabase before Phase 2 builds on it. The
query is in §7 below.

---

## 3. Two further defects found while auditing

### 3.1 A failed payments query is reported as AED 0 collected

```ts
const [completedResult, createdResult, openResult, paymentsResult, settingsResult] =
  await Promise.all([...]);

if (completedResult.error || createdResult.error || openResult.error) {
  return emptyResult;          //  <-- paymentsResult.error is NOT checked
}
```

`paymentsResult` is left out of the error check. If that one query fails — a
timeout, an RLS change, a bad range — `paymentsResult.data` is `null`, `collected`
reduces to `0`, and the page displays **"Collected: AED 0"** as a fact, next to
correct deal counts that make the page look healthy.

The prompt's rule is explicit: "If a query fails, show an error state. A failed
query must not be represented as zero." The error state already exists for the
other three queries (`kpis === null` renders a proper message at
`sales-report-client.tsx:216`); payments just was not wired into it.

### 3.2 The separate-verifier policy is not applied to single verification

`verifyPaymentsAction` (bulk) enforces it:

```ts
const rules = await getPaymentRules();
const needsOther = rules.separateVerifier !== false;
if (needsOther) query = query.neq("recorded_by", start.userId);
```

`setPaymentStatusAction` (single) does not. It checks the permission and the
expected status, and never consults the rule — `getPaymentRules` is imported at
the top of the file and called only by the bulk path.

So unless a database trigger enforces it, **a person can verify a payment they
recorded themselves by acting on it one at a time**, while the same action in
bulk is refused. The code comment says "The database checks the same permission
again" — permission, not the verifier rule.

This is the single highest-risk finding in the Payments module, because
separation of duties is the control that makes payment verification mean
anything. It needs either a database-level check or the same guard in the single
path. Which, depends on the answer to §7's RLS question.

---

## 4. Money arithmetic

`recordPaymentAction` writes `amount: filsToDecimalString(fils)`, so the column
is `numeric` holding decimal AED — confirmed from the write path.

The reports then read those values as JavaScript numbers and accumulate them:

```ts
const num = (value) => Number(value);
completedRows.reduce((sum, row) => sum + num(row.total_due), 0)
```

So Sprint 9 inherits the codebase's two money conventions, with reporting on the
wrong side of them:

| path | representation |
|---|---|
| Deal pricing, offers, loyalty (Sprints 6–8) | `bigint` fils via `sales-money.ts` |
| **Sales reports** | **`number` (float) AED, summed in JS** |

`formatMoney(value)` is `formatFils(toFils(value))`, which converts the
already-accumulated float back into fils for display — so any drift is baked in
before formatting.

At dealership scale this will not produce a visibly wrong total; AED values stay
within exact double range until about 9×10¹³. It is nonetheless the pattern §6
forbids ("avoid floating-point accumulation errors", "use precise currency
arithmetic"), and the fix is cheap: sum in `bigint` fils and format once. I
recommend doing it in Phase 2 while the aggregation layer is being written
anyway, rather than leaving a known-wrong-in-principle money path in a financial
module heading for production in Sprint 12.

---

## 5. What is reusable — do not rebuild

Substantial and good. Sprint 9 should extend this, not replace it.

| asset | verdict |
|---|---|
| `sales-report-queries.ts` structure — one pass, parallel queries, RLS client, views not base tables | **Reuse the shape.** The architecture is right; the arithmetic and boundaries need fixing |
| `report-summary-view.tsx`, `report-deal-table.tsx`, `sales-report-client.tsx` | **Reuse.** Tab/view switching, metric cards, breakdown tables all work |
| The `kpis === null` error state | **Reuse and extend** to cover payments |
| `TABLE_LIMIT` + "there are more, use the export" pattern | **Reuse — and apply it to aggregates**, which is exactly what is missing |
| `payments-queue-client.tsx` (695 lines), tabs, bulk selection | **Reuse.** Working queue; enhance filters/sort/pagination |
| `record-payment-dialog.tsx`, `payment-status-dialog.tsx` | **Reuse.** Correct fils handling, good refund guard |
| Optimistic concurrency on status change (`.eq("status", expected)`) | **Reuse as the pattern** for every financial mutation in Sprint 9 |
| Separate-verifier rule, `null` treated as "required" | **Reuse** — and close the single-verify gap |
| Sprint 8 export architecture (`offer-export-columns.ts` pattern, `X-Export-*` headers, truncation surfaced in-file) | **Reuse directly** for Phase 10. It already does what Phase 10 asks for |
| `test/run.mjs` + `alias-hooks.mjs` | **Reuse.** Sprint 9 tests plug straight in |
| `getDubaiToday()` | **Reuse** — and make it the basis of all report ranges |

---

## 6. Gap matrix — the eleven report domains

| # | domain | today | Sprint 9 work |
|---|---|---|---|
| 1 | Sales & Revenue | **Exists**, with the defects above | Fix cohort/caps/timezone; add brand, vehicle, collection, showroom, discount breakdowns; drill-down |
| 2 | Inventory | none | Build. Data exists in `cars` |
| 3 | Customers | none | Build. **Distinct customer counts** — the prompt's explicit warning |
| 4 | Leads | none | Build |
| 5 | Test Drives | none | Build |
| 6 | Reservations | none | Build |
| 7 | Enquiry Requests | none | Build. Sprint 7 data |
| 8 | Staff Performance | partial — `byOwner` exists in sales only | Build across modules. **Deal-level owner, not customer's relationship manager** |
| 9 | Payments & Collections | partial — summary cards on the queue | Build proper reports; separate "collected" from "net" |
| 10 | Offers & Promotions | none in reports; Sprint 8 exports exist | Build. Reuse Sprint 8 queries |
| 11 | Loyalty Points | none in reports; ledger exists | Build. **Points must stay out of AED totals** |

Payments module, against the prompt's twelve items: dashboard (partial), queue
(exists), the four status views (exist as tabs), refunds (recordable, not
reported), history (columns exist, no timeline), deal/reservation linkage
(exists), receipts (**none found**), reconciliation (**none**), permissions
(exist), audit (**needs verification — no payment activity log found in the
repo**).

---

## 7. One thing I need from your Supabase before Phase 2

Everything above is from the repository. These four facts are not in it, and
Phase 2's aggregation strategy depends on them. Run this read-only query in the
Supabase SQL editor and paste the output:

```sql
-- 1. Are the reporting views RLS-respecting?
select c.relname,
       case when 'security_invoker=true' = any(c.reloptions)
            then 'security_invoker — RLS applies'
            else 'NO security_invoker — runs as view owner, RLS BYPASSED' end as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in ('sales_deal_list','sales_payment_list');

-- 2. Real column types for the money and date columns
select table_name, column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('sales_payments','amount'), ('sales_payments','paid_on'),
    ('sales_deals','total_due'), ('sales_deals','balance_due'),
    ('sales_deals','completed_at'))
order by table_name, column_name;

-- 3. Is the separate-verifier rule enforced in the database?
select t.tgname, p.proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_class c on c.oid = t.tgrelid
where c.relname = 'sales_payments' and not t.tgisinternal;

-- 4. Is there a payment audit trail?
select table_name from information_schema.tables
where table_schema = 'public'
  and (table_name like '%payment%audit%'
       or table_name like '%payment%activity%'
       or table_name like '%payment%history%');

-- 5. How big are the datasets? (decides whether 5000 is a real ceiling)
select 'sales_deals' t, count(*) from public.sales_deals
union all select 'sales_payments', count(*) from public.sales_payments
union all select 'cars', count(*) from public.cars
union all select 'leads', count(*) from public.leads;
```

Question 1 is the important one. If either view lacks `security_invoker`, then
**reports already show company-wide figures to any staff member who can open the
page**, and that is a Phase 1 blocker rather than a Phase 14 item.

---

## 8. Proposed architecture for Phase 2

Four new modules, then eleven domain query files that all use them.

```
src/lib/utils/report-time.ts          Dubai-correct range resolution.
                                      Replaces resolveRange. One place decides
                                      what "this month" means, for every report
                                      and every export.

src/lib/utils/report-money.ts         bigint-fils accumulation + one formatter.
                                      Removes float summing from the money path.

src/lib/supabase/report-aggregate.ts  The counted-aggregate helper. Every
                                      aggregate returns
                                      { value, rowsUsed, total, truncated }
                                      so a capped figure cannot be displayed as
                                      a complete one. Uses count:"exact", and
                                      for genuinely large sets, a SQL-side
                                      aggregate rather than a JS reduce.

src/lib/types/report-metrics.ts       One definition object per metric: label,
                                      formula in words, date basis, and what it
                                      explicitly is NOT. Drives the tooltips
                                      §6 asks for, so the explanation and the
                                      calculation live together.
```

The non-negotiable rule for the aggregate layer: a metric carries its own
completeness. `ReportMetric<T> = { value: T; complete: boolean; total: number }`.
A metric that is not `complete` renders with a warning in the UI **and** in the
export, reusing the Sprint 8 truncation pattern. This makes "do not silently
calculate incorrect totals from only the first page" structurally true rather
than a thing to remember.

On permissions: `/admin/reports` is currently gated on `sales.view`, and export
on `sales.export`. There is no `reports.*` key anywhere. Gating inventory,
enquiry and lead reports behind `sales.view` would be wrong in both directions.
My recommendation is **per-dataset gating on the module keys that already
exist** (`inventory.view`, `customers.view`, `leads.view`, `enquiries.view`,
`reservations.view`, `offers.view`, `loyalty.view`, `payments.verify`), plus
**one** new key for the money metrics. That reuses keys as the prompt asks and
avoids a parallel permission system. The one new key is where I need your call —
see below.

---

## 9. Phase 1 completion checklist

- [x] Remote branches verified; `origin/sprint-8` confirmed as the approved base
- [x] Batch 8 confirmed present in that base, including the migration fix
- [x] `sprint-9` created from it; baseline `tsc` and `npm test` pass
- [x] Existing Reports code read in full
- [x] Existing Payments code read in full
- [x] Report totals checked for silent capping — **capped, unreported**
- [x] Date semantics checked against Asia/Dubai — **UTC, inconsistent with the rest of the app**
- [x] Sales vs payment counting definitions compared — **date/timestamp coercion on `paid_on`**
- [x] Win rate denominator and cohort checked — **invalid; demonstrated at 150%**
- [x] Refund and reversal treatment checked — **model correct, presentation conflated**
- [x] RLS checked on the application side — **correct**; database side **needs §7**
- [x] Money arithmetic traced end to end — **float accumulation in the report path**
- [x] Reusable assets identified
- [x] Gap matrix for all 11 report domains and 12 payment areas
- [x] Architecture proposed
- [ ] §7 database facts confirmed — **needs you**
- [ ] Financial definitions signed off — **needs you**
- [x] No application code modified

---

## 10. Summary

The existing Reports and Payments modules are well built and should be extended,
not rebuilt. The Payments module in particular is close to what Sprint 9 wants:
correct concurrency, a real refund/reversal distinction, fils-exact recording.

Six defects to fix before building on top:

| # | finding | severity |
|---|---|---|
| 1 | Win rate mixes two cohorts; exceeds 100% | **High** — visibly wrong number |
| 2 | Separate-verifier not applied to single verification | **High** — financial control |
| 3 | Aggregates capped at 5,000 with no truncation signal | **High** — silently wrong totals |
| 4 | Failed payments query renders as AED 0 collected | **High** — failure shown as data |
| 5 | Report ranges in UTC, not Dubai; `paid_on` date/timestamp coercion | **Medium** — 4-hour boundary error |
| 6 | "Collected" card actually shows net-of-refunds | **Medium** — conflates two defined metrics |

Plus one unknown that could outrank all of them: whether `sales_deal_list` and
`sales_payment_list` are `security_invoker` views. §7 answers it in one query.
