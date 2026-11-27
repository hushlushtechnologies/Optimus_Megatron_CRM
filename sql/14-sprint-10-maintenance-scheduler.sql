-- ===========================================================================
-- Sprint 10 — Phase 20
-- Scheduled background jobs
-- ===========================================================================
--
-- READ THIS BEFORE RUNNING IT. The schedule at the end is commented out on
-- purpose, and section 4 tells you what to look at before you uncomment it.
--
--
-- WHAT I FOUND
--
-- Sprint 8 built three maintenance functions. Nothing in the codebase calls
-- any of them — no cron entry, no API route, no server action, no scheduler
-- of any kind. They have only ever run if somebody typed them into the SQL
-- editor. sql/07's own comment says of one of them "Run on the same schedule
-- as the promotion sweep", and that schedule has never existed.
--
--   sweep_promotion_statuses()    moves scheduled campaigns to active and
--                                 finished ones to expired
--   sweep_loyalty_reservations()  releases points held for deals that went
--                                 quiet
--   expire_loyalty_points()       ages out earned points past their expiry
--   check_loyalty_wallets()       reports any wallet whose cached balance
--                                 disagrees with its ledger
--
-- WHAT THAT MEANS TODAY
--
-- Promotions: eligibility is computed live, so discounts have been correct
-- all along. What is wrong is the stored `status` column — a campaign that
-- started last week may still read "scheduled", one that finished may still
-- read "active" — and the Sprint 9 promotions report reads that column. The
-- report has been showing a status nobody updates.
--
-- Loyalty reservations: every abandoned hold since Sprint 8 is still `held`,
-- so those customers' points are still locked and they cannot spend them.
-- This one is customer-facing.
--
-- Loyalty expiry: this is the one to be careful with. It REMOVES points from
-- customer balances. Because it has never run, its first run clears the whole
-- backlog in one go. How big that backlog is depends entirely on your
-- loyalty_settings.expiry_months — if it is null, points never expire, no
-- credit has an expires_at, and the first run does nothing at all. If it is
-- set, there may be months of accumulated expiry waiting.
--
-- I cannot see your data, so I cannot tell you which. Section 4 is a
-- read-only preview that will.
--
--
-- WHAT THIS FILE INSTALLS
--
--   1. maintenance_runs      a log, so a job that fails is visible
--   2. run_maintenance_jobs()  the wrapper cron calls
--   3. trigger_maintenance_now()  a permission-checked manual run
--   4. preview_maintenance()   read-only: what WOULD happen
--   5. the cron schedule, commented out
--
-- Installing 1 to 4 changes no promotion, no reservation and no points
-- balance. Three of the four jobs write; the wallet check only reads. Nothing starts running until you uncomment section 5.
--
-- Safe to run more than once. Requires sql/11 and sql/12.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
--
-- "Do not assume those jobs are already installed." Checked rather than
-- assumed: scheduling a function that does not exist would give a cron entry
-- that fails every night into a log nobody reads.

do $$
declare
  missing text[] := '{}';
  fn      text;
begin
  foreach fn in array array[
    'sweep_promotion_statuses',
    'sweep_loyalty_reservations',
    'expire_loyalty_points',
    'check_loyalty_wallets'
  ]
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    ) then
      missing := missing || fn;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception
      'These maintenance functions do not exist: %. They come from sql/02-phase-3-loyalty.sql, sql/06-sweep-reports-old-status.sql and sql/07-phases-19-21-loyalty-functions.sql. Run those first.',
      array_to_string(missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_permissions'
  ) then
    raise exception
      'public.app_permissions does not exist. Run sql/11, then sql/12, then this file.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The run log
-- ---------------------------------------------------------------------------
--
-- "Error visibility." A nightly job with no log is a job you find out about
-- when a number looks wrong weeks later. One row per job per run, including
-- the runs that failed and the runs that were skipped because another run
-- held the lock.

create table if not exists public.maintenance_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- 'ok' did what it does; 'failed' raised; 'skipped' another run held the
  -- lock. Three states rather than a boolean, because "it did not run" and
  -- "it ran and broke" need different responses.
  outcome     text not null check (outcome in ('ok', 'failed', 'skipped')),
  -- What it actually did, per job. Null for skipped.
  detail      jsonb,
  -- The database's own message. Kept raw here because this table is for
  -- whoever is fixing it; the screen shows a plain sentence instead.
  error       text,
  -- 'cron' or the id of whoever pressed Run now.
  triggered_by text not null default 'cron'
);

create index if not exists maintenance_runs_job_started_idx
  on public.maintenance_runs (job, started_at desc);

alter table public.maintenance_runs enable row level security;

-- Readable by anyone who can see system settings. Writable by nobody through
-- the API: only the definer functions below insert here.
drop policy if exists maintenance_runs_read on public.maintenance_runs;
create policy maintenance_runs_read
  on public.maintenance_runs
  for select
  to authenticated
  using ('settings.system' = any (public.get_my_permissions()));

comment on table public.maintenance_runs is
  'One row per maintenance job per run, including failures and runs skipped because another was already going. Written only by run_maintenance_jobs().';

-- ---------------------------------------------------------------------------
-- 2. The wrapper cron calls
-- ---------------------------------------------------------------------------
--
-- Four of Phase 20's requirements live in this function, so they are worth
-- naming where they are implemented rather than in a list at the top:
--
-- DEDUPLICATION. pg_try_advisory_lock, not a row lock. If a run overruns its
-- slot the next one does not queue up behind it and does not run alongside
-- it: it logs 'skipped' and returns. Two overlapping runs of the expiry job
-- would both be safe — it is idempotent — but they would also both spend
-- minutes holding row locks, and a log that says 'skipped' is easier to read
-- than two interleaved runs.
--
-- RETRY SAFETY and IDEMPOTENCY come from the three functions themselves and
-- are tested rather than assumed: expire_loyalty_points keys each expiry
-- entry on 'expire:<ledger id>' with `on conflict do nothing`, and both
-- sweeps select `for update` and only write rows that actually change. Run
-- any of them twice in a row and the second does nothing.
--
-- FAILURE ISOLATION. Each job gets its own exception block. A job that
-- raises is logged as failed and the next one still runs. Without this, a
-- single bad promotion row would stop the loyalty jobs every night, and the
-- log would only ever show the first failure.
--
-- The exception blocks are also why this is one function rather than three
-- cron entries: three entries would run at the same moment and contend, and
-- there would be nowhere to put "all three ran, one failed".

create or replace function public.run_maintenance_jobs(p_triggered_by text default 'cron')
returns table (job text, outcome text, detail jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_key  bigint := hashtext('omc_maintenance_jobs');
  v_started   timestamptz;
  v_detail    jsonb;
  v_rows      integer;
  v_points    integer;
  v_customers integer;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    insert into public.maintenance_runs (job, finished_at, outcome, triggered_by)
    values ('all', now(), 'skipped', p_triggered_by);

    return query select 'all'::text, 'skipped'::text, null::jsonb;
    return;
  end if;

  -- ----- promotion statuses -----
  v_started := clock_timestamp();
  begin
    select count(*), jsonb_agg(jsonb_build_object('id', s.promotion_id, 'from', s.old_status, 'to', s.new_status))
      into v_rows, v_detail
      from public.sweep_promotion_statuses() s;

    insert into public.maintenance_runs (job, started_at, finished_at, outcome, detail, triggered_by)
    values ('promotion_statuses', v_started, now(), 'ok',
            jsonb_build_object('changed', coalesce(v_rows, 0), 'transitions', v_detail),
            p_triggered_by);

    return query select 'promotion_statuses'::text, 'ok'::text,
                        jsonb_build_object('changed', coalesce(v_rows, 0));
  exception when others then
    insert into public.maintenance_runs (job, started_at, finished_at, outcome, error, triggered_by)
    values ('promotion_statuses', v_started, now(), 'failed', sqlstate || ': ' || sqlerrm, p_triggered_by);

    return query select 'promotion_statuses'::text, 'failed'::text,
                        jsonb_build_object('error', sqlerrm);
  end;

  -- ----- loyalty reservations -----
  v_started := clock_timestamp();
  begin
    select public.sweep_loyalty_reservations() into v_rows;

    insert into public.maintenance_runs (job, started_at, finished_at, outcome, detail, triggered_by)
    values ('loyalty_reservations', v_started, now(), 'ok',
            jsonb_build_object('released', coalesce(v_rows, 0)), p_triggered_by);

    return query select 'loyalty_reservations'::text, 'ok'::text,
                        jsonb_build_object('released', coalesce(v_rows, 0));
  exception when others then
    insert into public.maintenance_runs (job, started_at, finished_at, outcome, error, triggered_by)
    values ('loyalty_reservations', v_started, now(), 'failed', sqlstate || ': ' || sqlerrm, p_triggered_by);

    return query select 'loyalty_reservations'::text, 'failed'::text,
                        jsonb_build_object('error', sqlerrm);
  end;

  -- ----- loyalty expiry -----
  v_started := clock_timestamp();
  begin
    select coalesce(sum(e.points_expired), 0), count(*)
      into v_points, v_customers
      from public.expire_loyalty_points() e;

    insert into public.maintenance_runs (job, started_at, finished_at, outcome, detail, triggered_by)
    values ('loyalty_expiry', v_started, now(), 'ok',
            jsonb_build_object('points_expired', coalesce(v_points, 0),
                               'customers_affected', coalesce(v_customers, 0)),
            p_triggered_by);

    return query select 'loyalty_expiry'::text, 'ok'::text,
                        jsonb_build_object('points_expired', coalesce(v_points, 0),
                                           'customers_affected', coalesce(v_customers, 0));
  exception when others then
    insert into public.maintenance_runs (job, started_at, finished_at, outcome, error, triggered_by)
    values ('loyalty_expiry', v_started, now(), 'failed', sqlstate || ': ' || sqlerrm, p_triggered_by);

    return query select 'loyalty_expiry'::text, 'failed'::text,
                        jsonb_build_object('error', sqlerrm);
  end;

  -- ----- wallet integrity, last on purpose -----
  --
  -- Read-only: it reports, it does not fix. It runs AFTER the other three
  -- because they are what could introduce drift — the expiry job appends
  -- ledger entries and the reservation sweep writes wallet balances, so the
  -- moment to check that the cache still agrees with the ledger is once
  -- they have both finished.
  --
  -- It should always find nothing. A non-zero count here means a wallet is
  -- showing a customer a balance its own ledger does not support, which is
  -- worth knowing the morning after rather than whenever somebody notices.
  -- The fix is rebuild_loyalty_wallet(), which this job deliberately does
  -- NOT call: silently rewriting a balance would destroy the evidence of
  -- how it drifted.
  v_started := clock_timestamp();
  begin
    select count(*), jsonb_agg(jsonb_build_object(
             'customer_id', c.customer_id,
             'wallet', c.wallet_available,
             'ledger', c.ledger_available,
             'difference', c.difference))
      into v_rows, v_detail
      from public.check_loyalty_wallets() c;

    insert into public.maintenance_runs (job, started_at, finished_at, outcome, detail, triggered_by)
    values ('loyalty_wallet_check', v_started, now(),
            -- A discrepancy is not a job failure: the job did its work and
            -- found something. 'failed' is for the job itself breaking, and
            -- conflating the two would mean a broken job and a drifted
            -- wallet look the same in the log.
            'ok',
            jsonb_build_object('discrepancies', coalesce(v_rows, 0), 'wallets', v_detail),
            p_triggered_by);

    return query select 'loyalty_wallet_check'::text, 'ok'::text,
                        jsonb_build_object('discrepancies', coalesce(v_rows, 0));
  exception when others then
    insert into public.maintenance_runs (job, started_at, finished_at, outcome, error, triggered_by)
    values ('loyalty_wallet_check', v_started, now(), 'failed', sqlstate || ': ' || sqlerrm, p_triggered_by);

    return query select 'loyalty_wallet_check'::text, 'failed'::text,
                        jsonb_build_object('error', sqlerrm);
  end;

  perform pg_advisory_unlock(v_lock_key);
end;
$$;

-- security definer plus "granted to everyone" is how an internal function
-- becomes a way for any signed-in user to move financial data. Revoked, then
-- granted only to the roles cron runs as.
revoke all on function public.run_maintenance_jobs(text) from public;
revoke all on function public.run_maintenance_jobs(text) from authenticated;
revoke all on function public.run_maintenance_jobs(text) from anon;

comment on function public.run_maintenance_jobs is
  'Runs the three Sprint 8 maintenance functions, logging each to maintenance_runs. One advisory lock so two runs cannot overlap; one exception block per job so a failure does not stop the rest. Not callable by ordinary users: see trigger_maintenance_now().';

-- ---------------------------------------------------------------------------
-- 3. Running it by hand
-- ---------------------------------------------------------------------------
--
-- "Permission checks." The check is INSIDE the definer function rather than
-- only in the application, because a definer function granted to authenticated
-- is callable straight from the API whatever the screen allows.

create or replace function public.trigger_maintenance_now()
returns table (job text, outcome text, detail jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not ('settings.system' = any (public.get_my_permissions())) then
    raise exception 'You do not have permission to run maintenance jobs.'
      using errcode = '42501';
  end if;

  return query select * from public.run_maintenance_jobs('user:' || coalesce(auth.uid()::text, 'unknown'));
end;
$$;

revoke all on function public.trigger_maintenance_now() from public;
revoke all on function public.trigger_maintenance_now() from anon;
grant execute on function public.trigger_maintenance_now() to authenticated;

comment on function public.trigger_maintenance_now is
  'Runs the maintenance jobs now, for a user holding settings.system. The permission is checked inside the function, not only on the screen.';

-- ---------------------------------------------------------------------------
-- 4. What WOULD happen — changes nothing
-- ---------------------------------------------------------------------------
--
-- "Do not silently activate financial or loyalty maintenance jobs without
-- verifying their behavior and obtaining approval where necessary."
--
-- This is how you verify before approving. It reads the same rows the three
-- jobs would act on and counts them. It writes nothing, locks nothing, and
-- is safe to run on production whenever you like.
--
-- Run it, look at loyalty_expiry in particular, and only then decide about
-- section 5.

create or replace function public.preview_maintenance()
returns table (job text, would_affect integer, detail jsonb)
language sql
stable
security definer
set search_path = public
as $$
  -- Promotions whose stored status disagrees with their dates.
  select
    'promotion_statuses'::text,
    count(*)::integer,
    jsonb_build_object(
      'to_activate', count(*) filter (
        where p.status = 'scheduled'
          and (p.starts_at is null or p.starts_at <= now())
          and (p.ends_at is null or p.ends_at > now())
      ),
      'to_expire', count(*) filter (
        where p.status in ('active', 'scheduled')
          and p.ends_at is not null and p.ends_at <= now()
      )
    )
  from public.promotions p
  where p.archived_at is null
    and (
      (p.status = 'scheduled' and (p.starts_at is null or p.starts_at <= now()))
      or (p.status in ('active', 'scheduled') and p.ends_at is not null and p.ends_at <= now())
    )

  union all

  -- Holds past their expiry that are still locking points up.
  select
    'loyalty_reservations'::text,
    count(*)::integer,
    jsonb_build_object(
      'points_to_release', coalesce(sum(r.points), 0),
      'customers', count(distinct r.customer_id),
      'oldest', min(r.expires_at)
    )
  from public.loyalty_reservations r
  where r.status = 'held' and r.expires_at <= now()

  union all

  -- THE ONE TO LOOK AT. Points that would come off balances on the first run.
  select
    'loyalty_expiry'::text,
    count(*)::integer,
    jsonb_build_object(
      'points_to_expire', coalesce(sum(l.points - l.consumed_points), 0),
      'customers', count(distinct l.customer_id),
      'oldest_expiry', min(l.expires_at),
      -- If this is null, expiry is switched off and the job will do nothing
      -- however long it has been since it last ran.
      'expiry_months_setting', (select s.expiry_months from public.loyalty_settings s limit 1)
    )
  from public.loyalty_ledger l
  where l.entry_type = 'earn'
    and l.expires_at is not null
    and l.expires_at <= now()
    and l.consumed_points < l.points

  union all

  -- Read-only either way. Shown here so the preview covers all four jobs,
  -- and because a discrepancy that already exists is worth seeing before
  -- the other three run and muddy the question of what caused it.
  select
    'loyalty_wallet_check'::text,
    count(*)::integer,
    jsonb_build_object('note', 'Read-only. This job reports drift, it never changes a balance.')
  from public.check_loyalty_wallets();
$$;

revoke all on function public.preview_maintenance() from public;
revoke all on function public.preview_maintenance() from anon;
grant execute on function public.preview_maintenance() to authenticated;

comment on function public.preview_maintenance is
  'Read-only. Counts the rows each maintenance job would act on, so the first run can be sized before it is scheduled. Writes nothing.';

commit;

-- ===========================================================================
-- 5. THE SCHEDULE — deliberately not enabled
-- ===========================================================================
--
-- Before you uncomment this:
--
--   select * from public.preview_maintenance();
--
-- Look at the loyalty_expiry row.
--
--   expiry_months_setting is null
--     Points never expire. points_to_expire will be 0 and that job will do
--     nothing. Nothing to decide — go ahead.
--
--   points_to_expire is small
--     The normal case once this has been running. Go ahead.
--
--   points_to_expire is large
--     This is the backlog of every expiry that should have happened since
--     Sprint 8. Running the job takes all of it off customers' balances at
--     once, correctly and with a ledger entry for each, but all on one day.
--     Decide whether you want that to land in one go or whether those
--     customers should be told first. The job is right either way; the
--     timing is a business decision, not a technical one.
--
-- TIME ZONES. pg_cron reads its schedule in the database's time zone, which
-- on Supabase is UTC. Dubai is UTC+04:00 and has had no daylight saving
-- since 1990, so the offset is a flat four hours all year and there is no
-- date on which this drifts.
--
--   '0 22 * * *'  = 22:00 UTC = 02:00 Dubai, next day
--
-- 02:00 local is chosen so a long first run finishes before anyone is
-- looking at a report.
--
-- To enable, run these two statements (not inside the transaction above):
--
--   create extension if not exists pg_cron;
--
--   select cron.schedule(
--     'omc-nightly-maintenance',
--     '0 22 * * *',
--     $job$ select public.run_maintenance_jobs('cron'); $job$
--   );
--
-- If `create extension` is refused, pg_cron is not enabled for your project:
-- turn it on under Database > Extensions in Supabase, then run it again.
--
-- To check it afterwards:
--
--   select jobname, schedule, active from cron.job;
--   select * from public.maintenance_runs order by started_at desc limit 10;
--
-- To stop it:
--
--   select cron.unschedule('omc-nightly-maintenance');
--
-- Unscheduling leaves the functions and the log in place. It only stops the
-- nightly run.
-- ===========================================================================
