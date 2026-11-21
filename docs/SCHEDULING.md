# How campaign scheduling works

Sprint 8, Phase 14. Written because the plan asks for it in those words:
*"Document the scheduling mechanism."*

The short version: **nothing in a browser decides whether a campaign applies.** The database
does, from the campaign's status and its dates, every time it is asked.

---

## The seven statuses

| status | what it means | applies to new deals |
|---|---|---|
| `draft` | being written, never published | no |
| `scheduled` | published, start date in the future | no |
| `active` | published and within its window | **yes** |
| `paused` | published but switched off by hand | no |
| `expired` | its end date has passed | no |
| `cancelled` | abandoned without expiring | no |
| `archived` | taken off the lists (`archived_at` is set) | no |

Only `active` applies, and only inside its window.

---

## The one function that decides

```sql
create or replace function public.promotion_is_live(
  p_status text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_archived_at timestamptz, p_at timestamptz default now())
returns boolean language sql immutable as $$
  select p_archived_at is null and p_status = 'active'
     and (p_starts_at is null or p_starts_at <= p_at)
     and (p_ends_at   is null or p_ends_at   >  p_at);
$$;
```

Four conditions, read as one. Note the asymmetry: the start is `<=` and the end is `>`, so a
campaign ending at 23:00 does not apply at 23:00. One campaign ending exactly when the next
begins leaves no gap and no overlap.

Null dates are not missing values, they are meanings: no start means *from the moment it is
published*, no end means *until somebody pauses it*.

---

## How `is_active` stays correct

The original `promotions` table had an `is_active` boolean and Inventory reads it:

```ts
supabase.from("promotions").select("id, name").eq("is_active", true).order("sort_order")
```

That column stays, and a trigger now derives it:

```sql
create trigger promotions_sync_is_active
  before insert or update on public.promotions
  for each row execute function public.sync_promotion_is_active();
```

`sync_promotion_is_active` sets `new.is_active := promotion_is_live(...)`.

So Inventory's dropdown gained scheduling with **no code change at all**. A campaign that has
not started, has finished, is paused, is a draft or is archived drops out of it on its own.

Verified against a rebuilt schema:

| campaign | status | in Inventory's dropdown |
|---|---|---|
| dates span today | active | yes |
| no dates at all | active | yes |
| starts in 5 days | active | **no** |
| ended yesterday | active | **no** |
| paused mid-run | paused | **no** |
| still a draft | draft | **no** |

---

## The gap a trigger cannot close, and the sweep that closes it

A trigger fires when a row changes. Time passing is not a row changing.

So a campaign whose `ends_at` passed at midnight still has `status = 'active'` and
`is_active = true` at 9am, because nothing has touched the row since.

**This does not let an expired campaign apply to a deal.** Pricing calls `promotion_is_live`
with `now()`, which returns false regardless of what the stored columns say. The columns are
a cache; the function is the truth.

What the stale columns do affect is what people see: a finished campaign sitting in the
"Running" tab, and in Inventory's dropdown, until something touches it.

That is what the sweep is for:

```sql
select public.sweep_promotion_statuses();
```

It moves `scheduled` → `active` for campaigns that have started, and `active` → `expired` for
campaigns that have finished, and returns how many of each it changed. It is idempotent —
running it twice in a row changes nothing the second time — so running it too often is
harmless.

### Running it

Three options, best first.

**1. `pg_cron` inside Supabase** — nothing outside the database to keep alive:

```sql
-- Once, to enable the extension:
create extension if not exists pg_cron;

-- Every 15 minutes:
select cron.schedule(
  'sweep-promotion-statuses',
  '*/15 * * * *',
  $$select public.sweep_promotion_statuses()$$
);

-- To check on it:
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

**2. A Supabase Edge Function on a schedule**, calling the same function over RPC. Worth it
only if you want the run logged somewhere you already watch.

**3. Nothing at all.** Honest option. Pricing is correct either way; the lists are just
cosmetically stale. If campaigns mostly run for weeks and nobody minds a finished one
lingering in a tab until it is next edited, this costs nothing.

**Do not** call the sweep from a page load or a React effect. That ties correctness to
somebody having a tab open, which is the thing the plan rules out: *"Do not rely on a browser
timer to activate or expire offers."*

---

## Dates and the Dubai timezone

Dubai is **UTC+04:00 with no daylight saving**, which makes this simpler than it would be
almost anywhere else: the offset is a constant, so no timezone library is needed.

Three places handle it, and they agree:

**Into the database.** A `datetime-local` input gives `"2026-12-01T20:00"`, with no zone. The
validation schema appends the offset:

```ts
const dubaiDateTime = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), z.literal("")])
  .transform((value) => (value === "" ? null : `${value}:00+04:00`));
```

So 8pm typed in Dubai is stored as 8pm Dubai, not 8pm wherever the server is.

**Out of the database, back into the form.** `toDubaiLocalInput` in
`src/lib/utils/offer-detail-to-form.ts` adds four hours to the UTC instant and reads off the
wall clock. Tested, including the case that breaks a naive string slice: 22:00 UTC is 02:00
the *next day* in Dubai.

**Day boundaries in filters.** A "created from the 1st" filter becomes
`2026-12-01T00:00:00+04:00`, so it means the 1st in Dubai rather than the 1st in UTC — which
would start at 4am local and quietly miss four hours of records.

---

## What depends on what

```
  promotion_is_live()          ← the only thing that decides "does this apply"
      ↑                ↑
      │                │
  sync_promotion_is_active   pricing / eligibility checks
  (trigger, on write)        (Phases 15–16, at read time)
      ↓
  promotions.is_active       ← a cache, for Inventory's existing dropdown
      ↑
  sweep_promotion_statuses() ← refreshes the cache as time passes
```

The arrow that matters: pricing reads the function, never the cached column. So a stale cache
is a display problem, never a money problem.

---

## Where each piece lives

| piece | file |
|---|---|
| `promotion_is_live`, `sync_promotion_is_active`, `sweep_promotion_statuses` | `sql/01-phase-2-promotions.sql` |
| status transitions, and what each one refuses | `app/admin/offers/actions.ts` → `setOfferStatusAction` |
| the status history trail | `promotion_status_history`, written by a trigger |
| `datetime-local` → `+04:00` | `src/lib/validation/offers.ts` → `dubaiDateTime` |
| timestamptz → `datetime-local` | `src/lib/utils/offer-detail-to-form.ts` → `toDubaiLocalInput` |
| "10 days left" and progress bars | `src/lib/utils/campaign-window.ts` (display only) |
