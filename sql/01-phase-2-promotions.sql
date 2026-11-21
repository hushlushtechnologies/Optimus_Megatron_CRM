-- ===========================================================================
-- Sprint 8 — Phase 2
-- Promotions: extend the table Inventory already uses
-- ===========================================================================
--
-- A `promotions` table already exists. It is a flat lookup — name, discount
-- type, discount value, is_active, sort_order — and `cars.promotion_id`
-- points at it. The add-car form reads it as a dropdown and the listing
-- price preview uses it.
--
-- This script makes that table into a real campaign table instead of adding
-- a second one. A second table would mean a car could carry an old-style
-- promotion_id AND match a new campaign, with nothing to say which price is
-- right — the conflicting-calculation problem to avoid.
--
-- THE IMPORTANT PART: Inventory reads `.eq("is_active", true)`. That column
-- stays, and a trigger now derives it from the campaign's status and dates.
-- So the existing dropdown keeps working with no code change, and it starts
-- respecting scheduling for free: a campaign that has not started or has
-- expired drops out of the list on its own.
--
-- Everything here is additive. No column is dropped, no row is deleted, and
-- every new column is nullable or defaulted, so existing rows and
-- cars.promotion_id keep working untouched.
--
-- Safe to run more than once.
--
-- ROLLBACK: see the end of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. What is actually there
-- ---------------------------------------------------------------------------
-- The promotions table came with Sprint 2 and its DDL is not in docs/, so
-- this reports what it finds rather than assuming. Read the notice.

do $$
declare
  col_list text;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'promotions'
  ) then
    raise exception
      'public.promotions does not exist. This script extends it; it does not create it. Stop and tell me.';
  end if;

  select string_agg(column_name, ', ' order by ordinal_position)
    into col_list
  from information_schema.columns
  where table_schema = 'public' and table_name = 'promotions';

  raise notice 'promotions currently has: %', col_list;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The campaign columns
-- ---------------------------------------------------------------------------

alter table public.promotions
  -- A short human reference, e.g. SUMMER26. Not a promo code customers type:
  -- those live in promotion_codes, because one campaign can have several and
  -- each needs its own limits.
  add column if not exists reference        text,
  add column if not exists description      text,

  -- What the campaign is aimed at. Targeting rows say which specific things.
  add column if not exists promotion_type   text not null default 'general',

  add column if not exists status           text not null default 'draft',

  -- Null start means "as soon as it is active"; null end means "until paused".
  add column if not exists starts_at        timestamptz,
  add column if not exists ends_at          timestamptz,

  -- When two campaigns both fit, the higher priority wins. Equal priority is
  -- resolved by the larger discount, then the earlier created_at, so the
  -- outcome never depends on row order.
  add column if not exists priority         integer not null default 0,

  -- Null means no limit.
  add column if not exists max_redemptions  integer,
  add column if not exists max_per_customer integer,
  add column if not exists redemption_count integer not null default 0,

  -- Money is fils (bigint), matching sales-money.ts. The legacy
  -- discount_value stays for the existing listing preview.
  add column if not exists min_purchase_fils bigint,
  add column if not exists max_discount_fils bigint,

  -- For loyalty-multiplier campaigns: 2.000 means double points. Null means
  -- this campaign does not affect points.
  add column if not exists points_multiplier numeric(6, 3),

  add column if not exists stacking_policy  text not null default 'none',

  add column if not exists internal_notes   text,
  add column if not exists banner_url       text,

  add column if not exists created_by       uuid references public.profiles (id) on delete set null,
  add column if not exists updated_by       uuid references public.profiles (id) on delete set null,
  add column if not exists archived_at      timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------------
-- Added separately from the columns so a re-run does not fail on them, and
-- so an existing row that breaks one tells you which.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promotions_status_check') then
    alter table public.promotions add constraint promotions_status_check
      check (status in ('draft','scheduled','active','paused','expired','cancelled','archived'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'promotions_type_check') then
    alter table public.promotions add constraint promotions_type_check
      check (promotion_type in (
        'general','vehicle','brand','model','collection','location',
        'customer','segment','code'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'promotions_stacking_check') then
    alter table public.promotions add constraint promotions_stacking_check
      check (stacking_policy in ('none','with_manual','with_loyalty','with_manual_and_loyalty'));
  end if;

  -- A campaign that ends before it starts is a data-entry slip, not a state.
  if not exists (select 1 from pg_constraint where conname = 'promotions_dates_check') then
    alter table public.promotions add constraint promotions_dates_check
      check (starts_at is null or ends_at is null or ends_at > starts_at);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'promotions_money_check') then
    alter table public.promotions add constraint promotions_money_check
      check (
        (min_purchase_fils is null or min_purchase_fils >= 0) and
        (max_discount_fils is null or max_discount_fils  >= 0)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'promotions_limits_check') then
    alter table public.promotions add constraint promotions_limits_check
      check (
        (max_redemptions  is null or max_redemptions  > 0) and
        (max_per_customer is null or max_per_customer > 0) and
        redemption_count >= 0
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'promotions_multiplier_check') then
    alter table public.promotions add constraint promotions_multiplier_check
      check (points_multiplier is null or points_multiplier > 0);
  end if;
end;
$$;

-- A reference is optional, but two campaigns must not share one.
create unique index if not exists promotions_reference_key
  on public.promotions (upper(reference))
  where reference is not null;

-- ---------------------------------------------------------------------------
-- 3. Give existing rows a status
-- ---------------------------------------------------------------------------
-- Every row predates this script and has status 'draft' from the default,
-- which would make it vanish from the Inventory dropdown. So anything that
-- was switched on becomes 'active' and anything switched off becomes
-- 'paused' — the honest translation of the only state the old table had.
--
-- The `status = 'draft'` guard makes this a one-time migration: a re-run
-- will not reset a campaign somebody has since paused by hand.

update public.promotions
set status = case when is_active then 'active' else 'paused' end
where status = 'draft';

-- ---------------------------------------------------------------------------
-- 4. is_active becomes derived
-- ---------------------------------------------------------------------------
-- This is what lets Inventory keep working untouched. It reads
-- `.eq("is_active", true)`, so that column has to stay truthful — and now it
-- means "usable right now", which is what the dropdown wanted all along.

create or replace function public.promotion_is_live(
  p_status      text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_archived_at timestamptz,
  p_at          timestamptz default now()
)
returns boolean
language sql
immutable
as $$
  select p_archived_at is null
     and p_status = 'active'
     and (p_starts_at is null or p_starts_at <= p_at)
     and (p_ends_at   is null or p_ends_at   >  p_at);
$$;

comment on function public.promotion_is_live is
  'Whether a campaign is usable at a moment in time. The single definition of "live" — the trigger, the scheduled sweep and the rules engine all use this one.';

create or replace function public.sync_promotion_is_active()
returns trigger
language plpgsql
as $$
begin
  new.is_active := public.promotion_is_live(
    new.status, new.starts_at, new.ends_at, new.archived_at
  );

  return new;
end;
$$;

drop trigger if exists promotions_sync_is_active on public.promotions;

create trigger promotions_sync_is_active
  before insert or update of status, starts_at, ends_at, archived_at
  on public.promotions
  for each row
  execute function public.sync_promotion_is_active();

-- Bring every existing row in line with its new status.
update public.promotions
set status = status;

-- ---------------------------------------------------------------------------
-- 5. The scheduled sweep
-- ---------------------------------------------------------------------------
-- Dates alone decide whether a campaign is live, and the rules engine checks
-- them on every read — so nothing depends on this running. What it does is
-- move the *stored* status on, so the lists and counts read correctly:
-- 'scheduled' becomes 'active' when its time comes, 'active' becomes
-- 'expired' when its end passes.
--
-- Call it from a Supabase scheduled function. See the deployment notes.

create or replace function public.sweep_promotion_statuses()
returns table (promotion_id uuid, old_status text, new_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with moved as (
    update public.promotions p
    set status = case
          when p.status = 'scheduled'
               and (p.starts_at is null or p.starts_at <= now())
               and (p.ends_at   is null or p.ends_at   >  now())
            then 'active'
          when p.status in ('active', 'scheduled')
               and p.ends_at is not null
               and p.ends_at <= now()
            then 'expired'
          else p.status
        end
    where p.archived_at is null
      and (
        (p.status = 'scheduled' and (p.starts_at is null or p.starts_at <= now()))
        or (p.status in ('active','scheduled') and p.ends_at is not null and p.ends_at <= now())
      )
    returning p.id, p.status
  )
  select m.id, null::text, m.status from moved m;
end;
$$;

comment on function public.sweep_promotion_statuses is
  'Moves scheduled campaigns to active and finished ones to expired. Eligibility does not depend on this having run; it keeps the stored status honest for lists and counts.';

-- ---------------------------------------------------------------------------
-- 6. Targeting
-- ---------------------------------------------------------------------------
-- One row per thing a campaign applies to. No rows at all means every
-- eligible vehicle — which is how a general campaign is expressed.
--
-- target_id is deliberately not a foreign key: it points at one of six
-- different tables depending on target_kind, and six nullable FK columns
-- would be worse. The rules engine resolves it, and a stale id simply
-- matches nothing.

create table if not exists public.promotion_targets (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.promotions (id) on delete cascade,
  target_kind   text not null check (target_kind in ('car','brand','model','collection','location')),
  target_id     uuid not null,
  created_at    timestamptz not null default now(),

  constraint promotion_targets_unique unique (promotion_id, target_kind, target_id)
);

create index if not exists promotion_targets_promotion_idx
  on public.promotion_targets (promotion_id);

create index if not exists promotion_targets_lookup_idx
  on public.promotion_targets (target_kind, target_id);

-- ---------------------------------------------------------------------------
-- 7. Eligibility rules
-- ---------------------------------------------------------------------------
-- Who qualifies, as data rather than code, so a rule can be read back and
-- explained to the person it was applied to.
--
-- VIP is not a boolean in this database: it is one value of
-- customer_profiles.lifecycle_status. So a VIP campaign is
-- rule_kind='lifecycle_status', operator='in', value='["VIP"]'.

create table if not exists public.promotion_eligibility_rules (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.promotions (id) on delete cascade,

  rule_kind     text not null check (rule_kind in (
                  'lifecycle_status',   -- Prospect | Active | VIP | Inactive | Do Not Contact
                  'customer_tag',       -- customer_tags.id, via customer_tag_links
                  'min_completed_deals',
                  'min_lifetime_spend_fils',
                  'interested_brand',
                  'is_existing_customer'
                )),

  operator      text not null default 'in' check (operator in ('in','not_in','gte','lte','eq')),

  -- A JSON array for in/not_in, a single JSON number for gte/lte.
  value         jsonb not null,

  created_at    timestamptz not null default now()
);

create index if not exists promotion_eligibility_rules_promotion_idx
  on public.promotion_eligibility_rules (promotion_id);

-- ---------------------------------------------------------------------------
-- 8. Private per-customer offers
-- ---------------------------------------------------------------------------
-- "Ahmed gets AED 25,000 off the Ferrari 296 GTB, and nobody else can use
-- it." An assignment narrows a campaign to one customer and optionally one
-- car or one deal, and can override the discount for that person.

create table if not exists public.customer_offer_assignments (
  id                    uuid primary key default gen_random_uuid(),
  promotion_id          uuid not null references public.promotions (id) on delete cascade,
  customer_id           uuid not null references public.customer_profiles (id) on delete cascade,

  -- Narrow it further, or leave null for any eligible vehicle.
  car_id                uuid references public.cars (id) on delete set null,
  deal_id               uuid references public.sales_deals (id) on delete set null,

  -- Null falls back to the campaign's own window.
  valid_from            timestamptz,
  valid_to              timestamptz,

  -- This person's discount, if it differs from the campaign's.
  discount_override_fils bigint check (discount_override_fils is null or discount_override_fils >= 0),

  status                text not null default 'active'
                          check (status in ('active','used','expired','cancelled')),

  notes                 text,
  assigned_by           uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint customer_offer_assignments_dates_check
    check (valid_from is null or valid_to is null or valid_to > valid_from)
);

-- One live assignment of a campaign per customer per car. A cancelled or
-- used one does not block re-assigning later, which is why the index is
-- partial rather than a plain unique constraint.
create unique index if not exists customer_offer_assignments_live_key
  on public.customer_offer_assignments (promotion_id, customer_id, coalesce(car_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

create index if not exists customer_offer_assignments_customer_idx
  on public.customer_offer_assignments (customer_id, status);

create index if not exists customer_offer_assignments_promotion_idx
  on public.customer_offer_assignments (promotion_id);

-- ---------------------------------------------------------------------------
-- 9. Promotional codes
-- ---------------------------------------------------------------------------
-- used_count is maintained by the redemption insert, inside the same
-- transaction, so two people redeeming at once cannot both pass the limit.

create table if not exists public.promotion_codes (
  id                 uuid primary key default gen_random_uuid(),
  promotion_id       uuid not null references public.promotions (id) on delete cascade,

  code               text not null,
  usage_limit        integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  used_count         integer not null default 0 check (used_count >= 0),

  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

-- Case-insensitive and unique across every campaign: somebody typing
-- "luxury2027" must not land on a different campaign than "LUXURY2027".
create unique index if not exists promotion_codes_code_key
  on public.promotion_codes (upper(code));

create index if not exists promotion_codes_promotion_idx
  on public.promotion_codes (promotion_id);

-- ---------------------------------------------------------------------------
-- 10. Redemptions — the money record
-- ---------------------------------------------------------------------------
-- `terms` is a snapshot of the campaign as it stood when applied, copied in
-- rather than referenced. This is the same pattern sales_deal_fees already
-- uses for fees, and it is what stops an edited or expired campaign from
-- rewriting a completed sale.

create table if not exists public.offer_redemptions (
  id             uuid primary key default gen_random_uuid(),
  promotion_id   uuid not null references public.promotions (id) on delete restrict,
  customer_id    uuid not null references public.customer_profiles (id) on delete restrict,
  deal_id        uuid references public.sales_deals (id) on delete set null,
  code_id        uuid references public.promotion_codes (id) on delete set null,
  assignment_id  uuid references public.customer_offer_assignments (id) on delete set null,

  discount_fils  bigint not null check (discount_fils >= 0),

  terms          jsonb not null,

  status         text not null default 'applied'
                   check (status in ('applied','reversed')),
  reversed_at    timestamptz,
  reversal_reason text,

  redeemed_by    uuid references public.profiles (id) on delete set null,
  redeemed_at    timestamptz not null default now()
);

-- One live redemption of a campaign per deal. This is the database-level
-- guard against double discounting the same deal with the same campaign,
-- however many times a request is retried.
create unique index if not exists offer_redemptions_deal_promotion_key
  on public.offer_redemptions (deal_id, promotion_id)
  where deal_id is not null and status = 'applied';

create index if not exists offer_redemptions_customer_idx
  on public.offer_redemptions (customer_id, status);

create index if not exists offer_redemptions_promotion_idx
  on public.offer_redemptions (promotion_id, status);

-- ---------------------------------------------------------------------------
-- 11. Keeping the counters honest
-- ---------------------------------------------------------------------------

create or replace function public.bump_promotion_redemption_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.status = 'applied' then
    update public.promotions
    set redemption_count = redemption_count + 1
    where id = new.promotion_id;

    if new.code_id is not null then
      update public.promotion_codes
      set used_count = used_count + 1
      where id = new.code_id;
    end if;

  elsif tg_op = 'UPDATE' and old.status = 'applied' and new.status = 'reversed' then
    -- Reversed, so it no longer counts against the limit. The row stays:
    -- the history of what happened is not something to delete.
    update public.promotions
    set redemption_count = greatest(0, redemption_count - 1)
    where id = new.promotion_id;

    if new.code_id is not null then
      update public.promotion_codes
      set used_count = greatest(0, used_count - 1)
      where id = new.code_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists offer_redemptions_bump_counts on public.offer_redemptions;

create trigger offer_redemptions_bump_counts
  after insert or update of status on public.offer_redemptions
  for each row
  execute function public.bump_promotion_redemption_counts();

-- ---------------------------------------------------------------------------
-- 12. Status history
-- ---------------------------------------------------------------------------

create table if not exists public.promotion_status_history (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  old_status   text,
  new_status   text not null,
  reason       text,
  changed_by   uuid references public.profiles (id) on delete set null,
  changed_at   timestamptz not null default now()
);

create index if not exists promotion_status_history_promotion_idx
  on public.promotion_status_history (promotion_id, changed_at desc);

create or replace function public.log_promotion_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.promotion_status_history (promotion_id, old_status, new_status, changed_by)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    new.updated_by
  );

  return new;
end;
$$;

drop trigger if exists promotions_log_status on public.promotions;

create trigger promotions_log_status
  after insert or update of status on public.promotions
  for each row
  execute function public.log_promotion_status_change();

-- ---------------------------------------------------------------------------
-- 13. Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, description)
values
  ('offers.view',    'View promotions, personalised offers and redemptions'),
  ('offers.manage',  'Create and edit promotions, targeting and codes'),
  ('offers.publish', 'Activate, pause, expire and archive promotions'),
  ('offers.assign',  'Assign private offers to specific customers'),
  ('offers.export',  'Download promotion and redemption data'),
  ('loyalty.view',   'View customer points balances and ledger history'),
  ('loyalty.adjust', 'Manually credit, deduct or reverse loyalty points'),
  ('loyalty.settings','Change loyalty program settings')
on conflict (key) do nothing;

-- Whoever can already manage sales gets the viewing keys, so the module is
-- not invisible to everyone on day one. The three that move money or change
-- the rules — publish, adjust, settings — are granted deliberately by you.
insert into public.role_permission_grants (role_id, permission)
select g.role_id, v.key
from public.role_permission_grants g
cross join (values ('offers.view'), ('offers.manage'), ('offers.assign'), ('loyalty.view')) as v (key)
where g.permission = 'sales.edit'
  and not exists (
    select 1 from public.role_permission_grants x
    where x.role_id = g.role_id and x.permission = v.key
  );

-- ---------------------------------------------------------------------------
-- 14. Row-level security
-- ---------------------------------------------------------------------------

alter table public.promotion_targets            enable row level security;
alter table public.promotion_eligibility_rules  enable row level security;
alter table public.customer_offer_assignments   enable row level security;
alter table public.promotion_codes              enable row level security;
alter table public.offer_redemptions            enable row level security;
alter table public.promotion_status_history     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'promotion_targets',
    'promotion_eligibility_rules',
    'customer_offer_assignments',
    'promotion_codes',
    'offer_redemptions',
    'promotion_status_history'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated
         using (public.has_permission(auth.uid(), ''offers.view''))', t, t);

    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated
         using (public.has_permission(auth.uid(), ''offers.manage''))
         with check (public.has_permission(auth.uid(), ''offers.manage''))', t, t);
  end loop;
end;
$$;

-- History is written by a trigger and read for audit. Nobody edits it.
drop policy if exists promotion_status_history_write on public.promotion_status_history;

-- Redemptions are money. They are written by the server-side redemption
-- path, not edited by hand.
drop policy if exists offer_redemptions_write on public.offer_redemptions;
drop policy if exists offer_redemptions_insert on public.offer_redemptions;
drop policy if exists offer_redemptions_reverse on public.offer_redemptions;

create policy offer_redemptions_insert on public.offer_redemptions
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'offers.manage'));

create policy offer_redemptions_reverse on public.offer_redemptions
  for update to authenticated
  using (public.has_permission(auth.uid(), 'offers.publish'))
  with check (public.has_permission(auth.uid(), 'offers.publish'));

-- ---------------------------------------------------------------------------
-- 15. Indexes for the list screens
-- ---------------------------------------------------------------------------

create index if not exists promotions_status_idx       on public.promotions (status) where archived_at is null;
create index if not exists promotions_window_idx       on public.promotions (starts_at, ends_at) where archived_at is null;
create index if not exists promotions_priority_idx     on public.promotions (priority desc, created_at);

commit;

-- ===========================================================================
-- Check it
-- ===========================================================================

-- 1. The new columns are there.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'promotions'
  and column_name in ('status','starts_at','ends_at','priority','stacking_policy','redemption_count')
order by column_name;

-- 2. Every existing promotion kept its on/off state, now as a status.
select status, is_active, count(*)
from public.promotions
group by status, is_active
order by status;

-- 3. is_active now means "usable right now" — these must agree.
select count(*) as rows_where_is_active_disagrees_with_dates
from public.promotions
where is_active <> public.promotion_is_live(status, starts_at, ends_at, archived_at);

-- 4. The six new tables exist.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'promotion_targets','promotion_eligibility_rules','customer_offer_assignments',
    'promotion_codes','offer_redemptions','promotion_status_history'
  )
order by table_name;

-- 5. The new permissions exist.
select key from public.permissions where key like 'offers.%' or key like 'loyalty.%' order by key;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- This script is additive, so rolling back is dropping what it added. It
-- does NOT restore is_active to its old hand-set values, because those are
-- no longer knowable once the trigger has run — if you need them, take a
-- copy of the table before running this:
--
--   create table promotions_backup_phase2 as select * from public.promotions;
--
-- To undo:
--
--   drop trigger if exists promotions_sync_is_active on public.promotions;
--   drop trigger if exists promotions_log_status on public.promotions;
--   drop function if exists public.sync_promotion_is_active();
--   drop function if exists public.log_promotion_status_change();
--   drop function if exists public.sweep_promotion_statuses();
--   drop function if exists public.promotion_is_live(text, timestamptz, timestamptz, timestamptz, timestamptz);
--
--   drop table if exists public.promotion_status_history;
--   drop table if exists public.offer_redemptions;
--   drop table if exists public.promotion_codes;
--   drop table if exists public.customer_offer_assignments;
--   drop table if exists public.promotion_eligibility_rules;
--   drop table if exists public.promotion_targets;
--
--   alter table public.promotions
--     drop column if exists reference,         drop column if exists description,
--     drop column if exists promotion_type,    drop column if exists status,
--     drop column if exists starts_at,         drop column if exists ends_at,
--     drop column if exists priority,          drop column if exists max_redemptions,
--     drop column if exists max_per_customer,  drop column if exists redemption_count,
--     drop column if exists min_purchase_fils, drop column if exists max_discount_fils,
--     drop column if exists points_multiplier, drop column if exists stacking_policy,
--     drop column if exists internal_notes,    drop column if exists banner_url,
--     drop column if exists created_by,        drop column if exists updated_by,
--     drop column if exists archived_at;
--
--   -- then restore is_active from your backup, if you took one:
--   -- update public.promotions p set is_active = b.is_active
--   -- from promotions_backup_phase2 b where b.id = p.id;
-- ===========================================================================
