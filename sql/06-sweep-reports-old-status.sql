-- ===========================================================================
-- Sprint 8 — Phase 14
-- sweep_promotion_statuses: report what each status WAS
-- ===========================================================================
--
-- The function declares:
--
--   returns table (promotion_id uuid, old_status text, new_status text)
--
-- ...and then returns `null::text` for old_status on every row. So a nightly
-- job logging its output records "null → expired" for everything, and
-- nobody reading that log can tell whether a campaign expired on schedule or
-- was switched from scheduled straight past active.
--
-- Not dangerous — eligibility never depended on this output — but a column
-- in a signature that is always empty is a small lie, and the status history
-- table records transitions properly, so the two disagree.
--
-- WHY IT WAS NULL
--
-- `returning` in an UPDATE gives the new row. Postgres 16 has no way to ask
-- for the old value there (that arrived in 18). So the fix reads the rows
-- and their current status first, in a CTE, then updates from it — which
-- also makes the new status explicit rather than a CASE repeated in two
-- places.
--
-- `for update` in the CTE: two sweeps running at once would otherwise both
-- read `scheduled` and both report the transition.
--
-- Replaces the function only. No table, column or trigger is touched.
-- Safe to run more than once.
-- ===========================================================================

begin;

create or replace function public.sweep_promotion_statuses()
returns table (promotion_id uuid, old_status text, new_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select
      p.id,
      p.status as was,
      case
        -- Finished is checked first: a campaign whose whole window is in the
        -- past must go to expired, not through active on the way.
        when p.ends_at is not null and p.ends_at <= now()
          then 'expired'
        when p.status = 'scheduled'
             and (p.starts_at is null or p.starts_at <= now())
          then 'active'
        else p.status
      end as becomes
    from public.promotions p
    where p.archived_at is null
      and (
        (p.status = 'scheduled' and (p.starts_at is null or p.starts_at <= now()))
        or (p.status in ('active', 'scheduled') and p.ends_at is not null and p.ends_at <= now())
      )
    for update
  ),
  moved as (
    update public.promotions p
    set status = c.becomes
    from candidates c
    where p.id = c.id
      -- Nothing to do where the computed status is what it already was.
      -- Without this, a row matching the WHERE but not changing would be
      -- reported as a transition from X to X.
      and c.becomes <> c.was
    returning p.id, c.was, p.status
  )
  select m.id, m.was, m.status from moved m;
end;
$$;

comment on function public.sweep_promotion_statuses is
  'Moves scheduled campaigns to active and finished ones to expired, reporting what each status was. Eligibility does not depend on this having run; it keeps the stored status honest for lists and counts.';

commit;

-- ===========================================================================
-- Check it
-- ===========================================================================
--
-- 1. A scheduled campaign that has started, and an active one that has
--    finished:
--
--      select * from public.sweep_promotion_statuses();
--
--    -> old_status now shows 'scheduled' and 'active', not null.
--
-- 2. Idempotent: running it again returns zero rows.
--
-- 3. A campaign whose whole window is in the past goes straight to expired
--    rather than being reported as scheduled -> active:
--
--      insert into public.promotions
--        (name, promotion_type, discount_type, discount_value, status, starts_at, ends_at)
--      values
--        ('Window Already Past','general','percentage',10,'scheduled',
--         now() - interval '10 days', now() - interval '1 day');
--
--      select * from public.sweep_promotion_statuses();
--      -> one row: scheduled -> expired
--
-- ROLLBACK
--
--   The previous version returned null for old_status. To go back, re-run
--   section 5 of 01-phase-2-promotions.sql, which still contains it.
-- ===========================================================================
