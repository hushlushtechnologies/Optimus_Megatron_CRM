-- ===========================================================================
-- Sprint 8 — small follow-up to Phase 2
-- Make sure promotions.created_at exists
-- ===========================================================================
--
-- WHY THIS EXISTS
--
-- Phase 2's migration extended `promotions` with everything the campaign
-- work needs, but it assumed `created_at` was already there. That assumption
-- came from me, not from the table: the original promotions table is a flat
-- lookup (name, discount_type, discount_value, is_active, sort_order) and I
-- never confirmed it carried a timestamp.
--
-- The offers code leans on that column in seven places — the list query, the
-- default sort, both date filters, the "created in the last 30 days" counts
-- and the stale-draft check. If the column is missing, the offers list and
-- dashboard fail at runtime with "column promotions.created_at does not
-- exist", which looks like a broken build rather than a missing column.
--
-- This script is additive and idempotent. If the column already exists it
-- does nothing at all. Safe to run whether or not you need it.
--
-- Run this once, after 01-phase-2-promotions.sql.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Report what is there now
-- ---------------------------------------------------------------------------

do $$
declare
  has_created boolean;
  has_updated boolean;
  row_count   bigint;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'promotions' and column_name = 'created_at'
  ) into has_created;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'promotions' and column_name = 'updated_at'
  ) into has_updated;

  execute 'select count(*) from public.promotions' into row_count;

  raise notice 'promotions: % existing row(s)', row_count;
  raise notice 'created_at present: %', has_created;
  raise notice 'updated_at present: %', has_updated;

  if has_created then
    raise notice 'Nothing to do — created_at is already there. The rest of this script is a no-op.';
  else
    raise notice 'created_at is missing and will be added. Existing rows will be stamped with now().';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Add it if missing
-- ---------------------------------------------------------------------------
--
-- Existing rows get now(), because there is no record of when they were
-- really made. That is a known inaccuracy for rows that predate this script
-- and it affects only the "created" column and the created-date filter —
-- never a price, a discount or a redemption.

alter table public.promotions
  add column if not exists created_at timestamptz not null default now();

-- updated_at is not read by any Sprint 8 code, so it is not added here. If
-- you want it later it is the same one-line pattern.

-- ---------------------------------------------------------------------------
-- 3. Index for the default sort
-- ---------------------------------------------------------------------------
--
-- The list's default order is newest first, and the dashboard counts rows by
-- created_at. Cheap index, and it matters once there are a few hundred
-- campaigns.

create index if not exists promotions_created_at_idx
  on public.promotions (created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Confirm
-- ---------------------------------------------------------------------------

do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'promotions' and column_name = 'created_at';

  if col_type is null then
    raise exception 'created_at still missing after the alter. Stop and tell me.';
  end if;

  raise notice 'created_at is present, type %.', col_type;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- What you should see
-- ---------------------------------------------------------------------------
--
--   NOTICE:  promotions: 3 existing row(s)
--   NOTICE:  created_at present: t
--   NOTICE:  updated_at present: f
--   NOTICE:  Nothing to do — created_at is already there. ...
--   NOTICE:  created_at is present, type timestamp with time zone.
--
-- If the third line said "created_at present: f", then the column was
-- genuinely missing and the offers list would have failed without this.
--
-- ROLLBACK
--
--   drop index if exists public.promotions_created_at_idx;
--   -- Only if this script added it. Dropping a column that was already
--   -- there would lose real data, so check first:
--   --   alter table public.promotions drop column created_at;
-- ---------------------------------------------------------------------------
