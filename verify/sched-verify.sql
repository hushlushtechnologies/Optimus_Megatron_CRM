\set ON_ERROR_STOP on

-- ===== 1. the preview must have changed nothing =====
do $$
declare held integer; sched integer; unexpired integer;
begin
  -- run the preview a few more times
  perform * from public.preview_maintenance();
  perform * from public.preview_maintenance();

  select count(*) into held from public.loyalty_reservations where status = 'held';
  select count(*) into sched from public.promotions where status = 'scheduled';
  select count(*) into unexpired from public.loyalty_ledger
    where entry_type = 'earn' and expires_at <= now() and consumed_points < points;

  if held <> 3 or sched <> 3 or unexpired <> 3 then
    raise exception 'PREVIEW CHANGED DATA: held=% scheduled=% unexpired=%', held, sched, unexpired;
  end if;
  if exists (select 1 from public.maintenance_runs) then
    raise exception 'PREVIEW WROTE TO THE RUN LOG';
  end if;
  raise notice 'PASS  the preview changed nothing and logged nothing';
end $$;

-- ===== 2. first real run =====
\echo '--- first run ---'
select job, outcome, detail from public.run_maintenance_jobs('test');

do $$
declare
  w1 integer; expired_entries integer; active_count integer;
begin
  select reserved_points into w1 from public.loyalty_wallets
    where customer_id = '11111111-1111-1111-1111-111111111111';
  -- started at 1500, two holds totalling 1500 released
  if w1 <> 0 then raise exception 'reserved_points is %, expected 0', w1; end if;

  select count(*) into expired_entries from public.loyalty_ledger where entry_type = 'expire';
  if expired_entries <> 3 then raise exception 'expire entries = %, expected 3', expired_entries; end if;

  select count(*) into active_count from public.promotions where status = 'active';
  if active_count <> 1 then raise exception 'active promotions = %, expected 1', active_count; end if;

  raise notice 'PASS  first run released 1500 held points, expired 3 credits, activated 1 campaign';
end $$;

-- ===== 3. IDEMPOTENCY: a second run must do nothing =====
\echo '--- second run (must be all zeros) ---'
select job, outcome, detail from public.run_maintenance_jobs('test');

do $$
declare
  changed integer; released integer; points integer; expired_entries integer;
begin
  select (detail->>'changed')::integer into changed from public.maintenance_runs
    where job = 'promotion_statuses' order by id desc limit 1;
  select (detail->>'released')::integer into released from public.maintenance_runs
    where job = 'loyalty_reservations' order by id desc limit 1;
  select (detail->>'points_expired')::integer into points from public.maintenance_runs
    where job = 'loyalty_expiry' order by id desc limit 1;

  if changed <> 0 or released <> 0 or points <> 0 then
    raise exception 'NOT IDEMPOTENT: second run changed=% released=% points=%', changed, released, points;
  end if;

  -- and no duplicate expiry entries were written
  select count(*) into expired_entries from public.loyalty_ledger where entry_type = 'expire';
  if expired_entries <> 3 then
    raise exception 'DOUBLE EXPIRY: % expire entries after two runs, expected 3', expired_entries;
  end if;

  raise notice 'PASS  the second run did nothing and wrote no duplicate ledger entries';
end $$;

-- ===== 4. the log has one row per job per run =====
do $$
declare n integer;
begin
  select count(*) into n from public.maintenance_runs;
  if n <> 6 then raise exception 'run log has % rows, expected 6 (3 jobs x 2 runs)', n; end if;
  if exists (select 1 from public.maintenance_runs where outcome <> 'ok') then
    raise exception 'a job was logged as something other than ok';
  end if;
  raise notice 'PASS  six log rows, all ok';
end $$;
