-- ===== 5. one job failing must not stop the others =====
-- Break the middle job.
create or replace function public.sweep_loyalty_reservations()
returns integer language plpgsql as $$
begin
  raise exception 'simulated failure inside the reservations sweep';
end; $$;

-- Give the other two something to do again.
update public.promotions set status = 'scheduled', ends_at = now() - interval '1 day'
  where name = 'Not due yet';
insert into public.loyalty_ledger
  (customer_id, entry_type, points, source, expires_at, consumed_points, idempotency_key)
values ('22222222-2222-2222-2222-222222222222','earn',700,'sale',now() - interval '1 day',0,'earn-6');

\echo '--- run with a broken middle job ---'
select job, outcome, detail from public.run_maintenance_jobs('test-failure');

do $$
declare
  promo text; resv text; expiry text; err text; points integer;
begin
  select outcome into promo  from public.maintenance_runs where job='promotion_statuses'   order by id desc limit 1;
  select outcome into resv   from public.maintenance_runs where job='loyalty_reservations' order by id desc limit 1;
  select outcome into expiry from public.maintenance_runs where job='loyalty_expiry'       order by id desc limit 1;
  select error   into err    from public.maintenance_runs where job='loyalty_reservations' order by id desc limit 1;
  select (detail->>'points_expired')::integer into points
    from public.maintenance_runs where job='loyalty_expiry' order by id desc limit 1;

  if resv <> 'failed' then raise exception 'the broken job was logged as %, expected failed', resv; end if;
  if err is null or err = '' then raise exception 'the failure was logged with no error text'; end if;
  if promo <> 'ok' then raise exception 'the job BEFORE the failure logged %, expected ok', promo; end if;
  if expiry <> 'ok' then raise exception 'the job AFTER the failure logged %, expected ok', expiry; end if;
  if points <> 700 then raise exception 'the job after the failure expired % points, expected 700', points; end if;

  raise notice 'PASS  broken job logged as failed with its message; the jobs either side still ran';
  raise notice '      error recorded: %', err;
end $$;

-- ===== 6. the advisory lock is released even when a job fails =====
do $$
begin
  if not pg_try_advisory_lock(hashtext('omc_maintenance_jobs')) then
    raise exception 'THE LOCK WAS NOT RELEASED after a run containing a failure';
  end if;
  perform pg_advisory_unlock(hashtext('omc_maintenance_jobs'));
  raise notice 'PASS  the advisory lock is free after a run that contained a failure';
end $$;

-- put it back
create or replace function public.sweep_loyalty_reservations()
returns integer language plpgsql as $$
declare v_res record; v_count integer := 0;
begin
  for v_res in select id, customer_id, points from public.loyalty_reservations
    where status = 'held' and expires_at <= now() for update
  loop
    update public.loyalty_reservations set status='expired', settled_at=now(),
      released_reason='The hold expired without the deal being completed.' where id = v_res.id;
    update public.loyalty_wallets set reserved_points = greatest(reserved_points - v_res.points, 0),
      updated_at = now() where customer_id = v_res.customer_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
