# Sprint 8 — Batch 8 (final): Phases 23–26

Notifications, audit, exports, security review, testing and documentation.
This finishes Sprint 8.

## Do the SQL fix first

If you have not already run the scripts from `sprint-8-SQL-FIX.zip`, do that
before this batch. Without them you have none of the Sprint 8 tables and this
code has nothing to run against. See `README-RUN-THIS-FIRST.md` in that zip.

## Steps

### 1. Copy the files

Every path in this zip is relative to the repository root. Copy them over,
keeping the folder structure.

**Two of these are files you already have, with one line added each.** If you
would rather edit them by hand than overwrite:

- `tsconfig.json` — adds `"allowImportingTsExtensions": true` to
  `compilerOptions`. This clears 11 pre-existing `tsc` errors from the test
  files without excluding them from type checking.
- `package.json` — adds `"test": "node test/run.mjs"` to `scripts`.

The rest are either new files or files this batch genuinely changes.

### 2. Run the two new SQL scripts

In the Supabase SQL editor, in order:

| File | What it does |
|---|---|
| `sql/08-phase-23-notification-types.sql` | Widens the `notifications` CHECK constraints so the 8 new types can be inserted |
| `sql/09-phase-23-earn-on-deal.sql` | Adds `earn_loyalty_for_deal()` — the missing call site that actually credits points |

Both are safe to re-run.

**Read 08's NOTICE output.** It tells you what it found and what it changed.
If your `notifications` table has no CHECK constraint on `type`, it says so
and changes nothing — that is a normal, fine outcome. If it does have one, it
reports how many values are now allowed, and your existing types are all
still among them.

### 3. Install nothing

No new dependencies. The exports use `exceljs`, `jspdf` and
`jspdf-autotable`, all already in your `package.json` and already used by the
other export routes.

### 4. Check it

```bash
npx tsc --noEmit      # expect: no output
npm run lint          # expect: 0 errors (8 pre-existing <img> warnings)
npm test              # expect: All 10 test file(s) passed
npm run build         # expect: Compiled successfully
```

And the audits:

```bash
python3 checks/audit-offers-security.py       # all invariants hold
python3 checks/check-notifications.py         # 22 types, 4 modules
python3 checks/audit-a11y.py offers           # clean
```

`npm test` is new. The test files shipped in earlier batches were never
actually runnable in your repo — they import application modules through the
`@/` alias, which Next.js and `tsc` understand but plain Node does not, so
each one failed before its first assertion. `test/alias-hooks.mjs` applies
the same mapping your `tsconfig.json` declares, and `test/run.mjs` runs each
file in its own process.

### 5. Grant yourself the three deliberate permissions

If you have not already, `offers.publish`, `loyalty.adjust` and
`loyalty.settings` are granted only to the role named in
`00-FIX-permissions-table.sql`. Without `offers.export` you will not see the
new Export button on the offers list at all — it is hidden rather than shown
disabled, because a control that refuses everybody who can see it is worse
than no control.

## What you will see

**On the offers list** — an Export button next to Sort, if you hold
`offers.export`. It opens a small dialog: choose one of four datasets
(campaigns, redemption history, personalised offers, loyalty transactions),
then PDF or Excel.

The campaigns export holds exactly what your current filters show. Both
formats say plainly when the 5,000-row cap has been reached — in the file
itself, not just in a toast — because a short file of financial data that
looks complete is worse than a refusal.

**In your notification bell** — eight new kinds of notification. All of them
go to staff. Nothing in this batch contacts a customer, because there is no
customer email or WhatsApp integration in this application. An assigned offer
tells whoever looks after that customer; it is then their job to call.

**Nothing visible for loyalty yet.** Points are still not earned, because the
programme ships switched off. Once you set the conversion rate in loyalty
settings, enable it, and enable the `deal_completed` earn rule, completing a
sale will credit points and notify the customer's relationship manager.

## The gap this batch closed

Phase 19 built `earn_loyalty_points()` and nothing ever called it. The
function was correct and idempotent, and no customer could accrue a single
point, because there was no call site in the application or in any trigger.

`sql/09` and `src/lib/supabase/loyalty-settlement.ts` close that, wired into
the deal transition: `Confirmed` or `Completed` may credit, `Cancelled` claws
back, everything else earns nothing. It cannot fail a sale — a completed deal
stays completed even if the credit fails, and because the function is
idempotent, re-running the transition repairs it.

## Two things worth knowing

**`offer_expiring` and `points_expiring` will not fire yet.** They are due at
a time rather than in response to an action, so they need a scheduled job.
They are written and callable, and the exact SQL to drive them is in
`docs/offer-notifications.md`. The same is true of `expire_loyalty_points()`
and `sweep_loyalty_reservations()` from earlier batches. Worth setting up one
Supabase cron that calls all four.

**Nothing has been committed or pushed.** Your plan says not to merge or push
to protected branches without approval, so the working copy is as far as I
have taken it.

## Full detail

`docs/SPRINT-8-COMPLETION-REPORT.md` — what all 26 phases delivered, the four
defects found while building this batch and how each was caught, and the
known limitations.

`docs/offer-notifications.md` — the eight notifications, who receives each,
the two that need a job, and the two traps in that code (status casing, and
the CHECK constraint that would silently swallow every notification).
