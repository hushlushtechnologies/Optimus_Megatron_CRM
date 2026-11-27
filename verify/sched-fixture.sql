-- Enough of the live schema to exercise the scheduler: the three maintenance
-- functions as Sprint 8 wrote them, the tables they touch, and the permission
-- plumbing sql/14 checks for.

drop schema if exists public cascade;
drop schema if exists cron cascade;
create schema public;

create extension if not exists pgcrypto;

-- ---- permission plumbing (sql/11 + sql/12 shape) ----
create table public.app_permissions (
  key text primary key, module text, label text, description text, sort_order integer
);
insert into public.app_permissions (key, module) values
  ('settings.system', 'Settings'), ('settings.operations', 'Settings');

-- Stand-in. The real one reads profiles -> roles -> grants; only its
-- signature and return type matter to sql/14.
create or replace function public.get_my_permissions() returns text[]
language sql stable as $$ select array['settings.system']::text[] $$;

create or replace function public.auth_uid_stub() returns uuid
language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select public.auth_uid_stub() $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

-- ---- promotions ----
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  archived_at timestamptz
);

-- ---- loyalty ----
create table public.loyalty_settings (
  id boolean primary key default true,
  expiry_months integer
);
insert into public.loyalty_settings (id, expiry_months) values (true, 12);

create table public.loyalty_wallets (
  customer_id uuid primary key,
  available_points integer not null default 0,
  reserved_points integer not null default 0,
  expired_points integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.loyalty_reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  points integer not null,
  status text not null,
  expires_at timestamptz,
  settled_at timestamptz,
  released_reason text
);

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  entry_type text not null,
  points integer not null,
  source text,
  reason text,
  reverses_entry_id uuid,
  idempotency_key text unique,
  expires_at timestamptz,
  consumed_points integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---- the three Sprint 8 functions, copied as written ----

create or replace function public.sweep_promotion_statuses()
returns table (promotion_id uuid, old_status text, new_status text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select p.id, p.status as was,
      case
        when p.ends_at is not null and p.ends_at <= now() then 'expired'
        when p.status = 'scheduled' and (p.starts_at is null or p.starts_at <= now()) then 'active'
        else p.status
      end as becomes
    from public.promotions p
    where p.archived_at is null
      and ((p.status = 'scheduled' and (p.starts_at is null or p.starts_at <= now()))
        or (p.status in ('active','scheduled') and p.ends_at is not null and p.ends_at <= now()))
    for update
  ),
  moved as (
    update public.promotions p set status = c.becomes
    from candidates c
    where p.id = c.id and c.becomes <> c.was
    returning p.id, c.was, p.status
  )
  select m.id, m.was, m.status from moved m;
end; $$;

create or replace function public.sweep_loyalty_reservations()
returns integer language plpgsql as $$
declare v_res record; v_count integer := 0;
begin
  for v_res in
    select id, customer_id, points from public.loyalty_reservations
    where status = 'held' and expires_at <= now() for update
  loop
    update public.loyalty_reservations
    set status = 'expired', settled_at = now(),
        released_reason = 'The hold expired without the deal being completed.'
    where id = v_res.id;
    update public.loyalty_wallets
    set reserved_points = greatest(reserved_points - v_res.points, 0), updated_at = now()
    where customer_id = v_res.customer_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

create or replace function public.expire_loyalty_points(p_at timestamptz default now())
returns table (customer_id uuid, points_expired integer, entries integer)
language plpgsql security definer set search_path = public as $$
declare
  credit record; usable integer; made_ids uuid[] := '{}'; made_id uuid;
begin
  for credit in
    select l.id, l.customer_id, l.points, l.consumed_points
    from public.loyalty_ledger l
    where l.entry_type = 'earn' and l.expires_at is not null
      and l.expires_at <= p_at and l.consumed_points < l.points
    order by l.expires_at, l.created_at for update
  loop
    usable := credit.points - credit.consumed_points;
    if usable <= 0 then continue; end if;

    insert into public.loyalty_ledger
      (customer_id, entry_type, points, source, reason, reverses_entry_id, idempotency_key)
    values (credit.customer_id, 'expire', -usable, 'expiry_job', 'Points expired',
            credit.id, 'expire:' || credit.id::text)
    on conflict do nothing
    returning id into made_id;

    if made_id is not null then
      made_ids := made_ids || made_id; made_id := null;
    end if;

    update public.loyalty_ledger set consumed_points = points where id = credit.id;
  end loop;

  return query
  select l.customer_id, (-sum(l.points))::integer, count(*)::integer
  from public.loyalty_ledger l where l.id = any (made_ids) group by l.customer_id;
end; $$;

-- ---- data with a real backlog, as if nothing had run since Sprint 8 ----
insert into public.promotions (name, status, starts_at, ends_at) values
  ('Started last week, still says scheduled', 'scheduled', now() - interval '7 days', now() + interval '7 days'),
  ('Finished last month, still says active',  'active',    now() - interval '60 days', now() - interval '30 days'),
  ('Whole window in the past',                'scheduled', now() - interval '10 days', now() - interval '1 day'),
  ('Not due yet',                             'scheduled', now() + interval '5 days',  now() + interval '20 days');

insert into public.loyalty_wallets (customer_id, available_points, reserved_points) values
  ('11111111-1111-1111-1111-111111111111', 5000, 1500),
  ('22222222-2222-2222-2222-222222222222', 3000,  500);

insert into public.loyalty_reservations (customer_id, points, status, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 1000, 'held', now() - interval '45 days'),
  ('11111111-1111-1111-1111-111111111111',  500, 'held', now() - interval '10 days'),
  ('22222222-2222-2222-2222-222222222222',  500, 'held', now() + interval '2 days');

insert into public.loyalty_ledger
  (customer_id, entry_type, points, source, expires_at, consumed_points, idempotency_key) values
  ('11111111-1111-1111-1111-111111111111', 'earn', 2000, 'sale', now() - interval '40 days', 0,    'earn-1'),
  ('11111111-1111-1111-1111-111111111111', 'earn', 1500, 'sale', now() - interval '20 days', 500,  'earn-2'),
  ('22222222-2222-2222-2222-222222222222', 'earn', 3000, 'sale', now() - interval '5 days',  0,    'earn-3'),
  ('22222222-2222-2222-2222-222222222222', 'earn', 1000, 'sale', now() + interval '30 days', 0,    'earn-4'),
  ('11111111-1111-1111-1111-111111111111', 'earn',  800, 'sale', null,                       0,    'earn-5');

-- the fourth maintenance function, copied as Sprint 8 wrote it
create or replace function public.check_loyalty_wallets()
returns table (customer_id uuid, wallet_available integer, ledger_available bigint, difference bigint)
language sql stable as $$
  select w.customer_id, w.available_points,
         coalesce(sum(l.points), 0)::bigint,
         (w.available_points - coalesce(sum(l.points), 0))::bigint
  from public.loyalty_wallets w
  left join public.loyalty_ledger l on l.customer_id = w.customer_id
  group by w.customer_id, w.available_points
  having w.available_points <> coalesce(sum(l.points), 0);
$$;
