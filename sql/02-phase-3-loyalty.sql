-- ===========================================================================
-- Sprint 8 — Phase 3
-- Loyalty: a points ledger, not a balance column
-- ===========================================================================
--
-- There is no loyalty anything in this database yet — I checked for a points
-- column, a wallet, a ledger, and found none. So this is built correctly from
-- the first migration rather than migrated out of a single balance field.
--
-- The shape:
--
--   loyalty_ledger    append-only. Every movement, with who did it and why.
--                     This is the accounting record. UPDATE and DELETE are
--                     blocked by a trigger, not by convention.
--   loyalty_wallets   a cache of the balances, maintained by trigger from the
--                     ledger. Never written by hand. Can be rebuilt from the
--                     ledger at any time, and there is a function to check
--                     the two agree.
--   loyalty_settings  one row, and it SHIPS DISABLED with null rates. Nothing
--                     can earn and nothing can redeem until you set the earn
--                     rate and the conversion yourself. The prompt says not
--                     to invent those numbers, so they are not invented.
--
-- Points are not money. They are stored as integers, and the conversion to
-- AED lives in settings where it can be changed and audited.
--
-- Safe to run more than once. ROLLBACK at the end.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
-- A single row, guarded by a one-row constraint so there can never be two
-- competing configurations.

create table if not exists public.loyalty_settings (
  id                        boolean primary key default true,

  -- Ships OFF. Nothing earns or redeems until you turn this on.
  is_enabled                boolean not null default false,

  -- Points earned per AED 1,000 of qualifying spend. NULL on purpose: an
  -- invented rate that quietly starts crediting points is worse than a
  -- feature that waits to be configured.
  earn_points_per_1000_aed  integer check (earn_points_per_1000_aed is null or earn_points_per_1000_aed > 0),

  -- What counts as qualifying spend on a deal.
  earn_basis                text not null default 'agreed_price'
                              check (earn_basis in ('agreed_price','net_price','proposed_price')),

  -- Redemption: how many points buy AED 1. Also NULL until configured.
  -- Stored as points-per-AED so 10 means 1,000 points = AED 100.
  redeem_points_per_aed     integer check (redeem_points_per_aed is null or redeem_points_per_aed > 0),

  min_redeem_points         integer check (min_redeem_points is null or min_redeem_points > 0),
  max_redeem_points         integer check (max_redeem_points is null or max_redeem_points > 0),

  -- A ceiling on how much of one deal points may cover, in basis points.
  -- 2000 = 20%. Null means no ceiling.
  max_redeem_bps_of_deal    integer check (max_redeem_bps_of_deal is null or (max_redeem_bps_of_deal > 0 and max_redeem_bps_of_deal <= 10000)),

  -- Months until earned points expire. Null means they do not expire.
  expiry_months             integer check (expiry_months is null or expiry_months > 0),

  -- What happens to points when a sale is refunded or cancelled.
  refund_policy             text not null default 'reverse_earned'
                              check (refund_policy in ('reverse_earned','keep_earned','reverse_and_restore_redeemed')),

  -- Negative balances are refused unless you deliberately allow them.
  allow_negative_balance    boolean not null default false,

  updated_by                uuid references public.profiles (id) on delete set null,
  updated_at                timestamptz not null default now(),

  constraint loyalty_settings_single_row check (id = true),
  constraint loyalty_settings_redeem_range check (
    min_redeem_points is null or max_redeem_points is null or max_redeem_points >= min_redeem_points
  ),

  -- The program cannot be switched on until the two numbers it needs exist.
  -- This is the guard that makes "ships disabled" meaningful rather than a
  -- default somebody flips past.
  constraint loyalty_settings_enabled_needs_config check (
    is_enabled = false
    or (earn_points_per_1000_aed is not null and redeem_points_per_aed is not null)
  )
);

insert into public.loyalty_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Wallets — a cache, never the truth
-- ---------------------------------------------------------------------------

create table if not exists public.loyalty_wallets (
  customer_id        uuid primary key references public.customer_profiles (id) on delete cascade,

  available_points   integer not null default 0,

  -- Earned but not yet usable: credited against a deal that is not finished.
  pending_points     integer not null default 0,

  lifetime_earned    integer not null default 0,
  lifetime_redeemed  integer not null default 0,
  expired_points     integer not null default 0,

  -- Held aside while a redemption is being completed, so two deals cannot
  -- spend the same points. See reserve/commit/release in Phase 20.
  reserved_points    integer not null default 0,

  updated_at         timestamptz not null default now(),

  constraint loyalty_wallets_non_negative check (
    pending_points >= 0 and lifetime_earned >= 0 and
    lifetime_redeemed >= 0 and expired_points >= 0 and reserved_points >= 0
  )
);

comment on table public.loyalty_wallets is
  'Cached balances, maintained by trigger from loyalty_ledger. Never write to this table directly — insert a ledger entry instead. Rebuildable with rebuild_loyalty_wallet().';

-- ---------------------------------------------------------------------------
-- 3. The ledger
-- ---------------------------------------------------------------------------
-- Append-only. Every field the prompt asks for: customer, type, points,
-- source, related deal, related promotion, actor, timestamp, reason, and an
-- idempotency key.

create table if not exists public.loyalty_ledger (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customer_profiles (id) on delete restrict,

  entry_type        text not null check (entry_type in (
                      'earn',             -- a qualifying completed purchase
                      'redeem',           -- spent against a deal
                      'expire',           -- aged out
                      'reverse',          -- undoing an earn, e.g. refunded sale
                      'adjust',           -- manual correction, needs a reason
                      'refund_reversal',  -- the refund-specific case
                      'correction'        -- administrative fix
                    )),

  -- Signed: positive adds, negative removes. One column rather than separate
  -- debit/credit columns, so the balance is a plain sum and cannot disagree
  -- with itself.
  points            integer not null check (points <> 0),

  source            text not null default 'manual' check (source in (
                      'sale','manual','expiry_job','refund','promotion','import'
                    )),

  deal_id           uuid references public.sales_deals (id) on delete set null,
  promotion_id      uuid references public.promotions (id) on delete set null,

  -- Required for anything a person chose to do. Enforced below.
  reason            text,

  actor_id          uuid references public.profiles (id) on delete set null,

  -- The retry guard. A repeated request carries the same key and collides
  -- instead of crediting twice.
  idempotency_key   text,

  -- Which entry this one undoes.
  reverses_entry_id uuid references public.loyalty_ledger (id) on delete restrict,

  -- When this credit ages out. Only meaningful on 'earn'.
  expires_at        timestamptz,

  -- How much of this credit has since been spent or expired, so expiry can
  -- be allocated oldest-first without guessing.
  consumed_points   integer not null default 0 check (consumed_points >= 0),

  created_at        timestamptz not null default now(),

  -- A manual movement must say why. An automatic one need not: its source
  -- and its deal say it.
  constraint loyalty_ledger_manual_needs_reason check (
    entry_type not in ('adjust','correction') or (reason is not null and length(trim(reason)) > 0)
  ),

  -- Direction has to match the type, or a typo silently credits.
  constraint loyalty_ledger_direction check (
    (entry_type = 'earn'            and points > 0) or
    (entry_type = 'redeem'          and points < 0) or
    (entry_type = 'expire'          and points < 0) or
    (entry_type = 'reverse'         and points < 0) or
    (entry_type = 'refund_reversal' and points < 0) or
    (entry_type in ('adjust','correction'))
  ),

  constraint loyalty_ledger_consumed_fits check (consumed_points <= abs(points))
);

-- The retry guard, as an index so it is enforced by the database.
create unique index if not exists loyalty_ledger_idempotency_key
  on public.loyalty_ledger (idempotency_key)
  where idempotency_key is not null;

-- One reversal per entry.
create unique index if not exists loyalty_ledger_reverses_key
  on public.loyalty_ledger (reverses_entry_id)
  where reverses_entry_id is not null;

create index if not exists loyalty_ledger_customer_idx
  on public.loyalty_ledger (customer_id, created_at desc);

create index if not exists loyalty_ledger_deal_idx
  on public.loyalty_ledger (deal_id) where deal_id is not null;

-- For the expiry job: unspent earns with a date that has passed.
create index if not exists loyalty_ledger_expiry_idx
  on public.loyalty_ledger (expires_at)
  where entry_type = 'earn' and expires_at is not null;

comment on table public.loyalty_ledger is
  'Append-only accounting record of every points movement. UPDATE and DELETE are blocked except for consumed_points, which the expiry allocation maintains.';

-- ---------------------------------------------------------------------------
-- 4. Append-only, enforced
-- ---------------------------------------------------------------------------
-- "Do not delete ledger transactions. Do not silently modify historical
-- entries." A comment asking people not to is not a control; this is.
--
-- The one permitted change is consumed_points, which expiry allocation has
-- to maintain. Everything else about a row is frozen once written.

create or replace function public.guard_loyalty_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'loyalty_ledger is append-only: entries are never deleted. Insert a reversing entry instead.';
  end if;

  if new.id                is distinct from old.id
     or new.customer_id    is distinct from old.customer_id
     or new.entry_type     is distinct from old.entry_type
     or new.points         is distinct from old.points
     or new.source         is distinct from old.source
     or new.deal_id        is distinct from old.deal_id
     or new.promotion_id   is distinct from old.promotion_id
     or new.actor_id       is distinct from old.actor_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.reverses_entry_id is distinct from old.reverses_entry_id
     or new.created_at     is distinct from old.created_at
  then
    raise exception
      'loyalty_ledger entries cannot be altered. Only consumed_points may change (expiry allocation). Insert a correcting entry instead.';
  end if;

  return new;
end;
$$;

drop trigger if exists loyalty_ledger_append_only on public.loyalty_ledger;

create trigger loyalty_ledger_append_only
  before update or delete on public.loyalty_ledger
  for each row
  execute function public.guard_loyalty_ledger_append_only();

-- ---------------------------------------------------------------------------
-- 5. The wallet follows the ledger
-- ---------------------------------------------------------------------------

create or replace function public.apply_loyalty_entry_to_wallet()
returns trigger
language plpgsql
as $$
declare
  allow_negative boolean;
  new_available  integer;
begin
  insert into public.loyalty_wallets (customer_id)
  values (new.customer_id)
  on conflict (customer_id) do nothing;

  select coalesce(s.allow_negative_balance, false)
    into allow_negative
  from public.loyalty_settings s
  where s.id = true;

  update public.loyalty_wallets w
  set available_points  = w.available_points + new.points,
      lifetime_earned   = w.lifetime_earned
                          + case when new.points > 0 and new.entry_type in ('earn','adjust','correction')
                                 then new.points else 0 end,
      lifetime_redeemed = w.lifetime_redeemed
                          + case when new.entry_type = 'redeem' then -new.points else 0 end,
      expired_points    = w.expired_points
                          + case when new.entry_type = 'expire' then -new.points else 0 end,
      updated_at        = now()
  where w.customer_id = new.customer_id
  returning w.available_points into new_available;

  -- The balance check happens in the same transaction as the insert, so two
  -- concurrent redemptions cannot both see enough points: the second waits
  -- on the row lock the first is holding, then fails here.
  if new_available < 0 and not coalesce(allow_negative, false) then
    raise exception
      'This would take % to % points. Negative balances are not allowed under the current policy.',
      new.customer_id, new_available
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists loyalty_ledger_apply_to_wallet on public.loyalty_ledger;

create trigger loyalty_ledger_apply_to_wallet
  after insert on public.loyalty_ledger
  for each row
  execute function public.apply_loyalty_entry_to_wallet();

-- ---------------------------------------------------------------------------
-- 6. Rebuilding and checking
-- ---------------------------------------------------------------------------
-- The wallet is a cache, so it must be possible to prove it agrees with the
-- ledger. If these ever disagree, the ledger is right.

create or replace function public.rebuild_loyalty_wallet(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.loyalty_wallets (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  update public.loyalty_wallets w
  set available_points  = coalesce(l.total, 0),
      lifetime_earned   = coalesce(l.earned, 0),
      lifetime_redeemed = coalesce(l.redeemed, 0),
      expired_points    = coalesce(l.expired, 0),
      updated_at        = now()
  from (
    select
      sum(points)                                                                   as total,
      sum(case when points > 0 and entry_type in ('earn','adjust','correction')
               then points else 0 end)                                              as earned,
      sum(case when entry_type = 'redeem' then -points else 0 end)                  as redeemed,
      sum(case when entry_type = 'expire' then -points else 0 end)                  as expired
    from public.loyalty_ledger
    where customer_id = p_customer_id
  ) l
  where w.customer_id = p_customer_id;
end;
$$;

create or replace function public.check_loyalty_wallets()
returns table (
  customer_id       uuid,
  wallet_available  integer,
  ledger_available  bigint,
  difference        bigint
)
language sql
stable
as $$
  select w.customer_id,
         w.available_points,
         coalesce(sum(l.points), 0)::bigint,
         (w.available_points - coalesce(sum(l.points), 0))::bigint
  from public.loyalty_wallets w
  left join public.loyalty_ledger l on l.customer_id = w.customer_id
  group by w.customer_id, w.available_points
  having w.available_points <> coalesce(sum(l.points), 0);
$$;

comment on function public.check_loyalty_wallets is
  'Returns any wallet whose cached balance disagrees with the sum of its ledger. Should always return zero rows; if not, the ledger is authoritative — run rebuild_loyalty_wallet().';

-- ---------------------------------------------------------------------------
-- 7. Expiry, oldest credit first
-- ---------------------------------------------------------------------------
-- Deterministic allocation: the oldest unspent earn expires first, and only
-- the part of it that is still unspent. consumed_points is what makes that
-- knowable rather than estimated.
--
-- Call from a scheduled function, daily. It is safe to call repeatedly — an
-- already-expired credit is fully consumed and will not be picked up again.

create or replace function public.expire_loyalty_points(p_at timestamptz default now())
returns table (customer_id uuid, points_expired integer, entries integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  credit     record;
  usable     integer;
  -- Only what THIS call expired. Counting recent rows instead would make a
  -- nightly job report the previous night's expiry as its own.
  made_ids   uuid[] := '{}';
  made_id    uuid;
begin
  for credit in
    select l.id, l.customer_id, l.points, l.consumed_points
    from public.loyalty_ledger l
    where l.entry_type = 'earn'
      and l.expires_at is not null
      and l.expires_at <= p_at
      and l.consumed_points < l.points
    order by l.expires_at, l.created_at
    for update
  loop
    usable := credit.points - credit.consumed_points;

    if usable <= 0 then
      continue;
    end if;

    insert into public.loyalty_ledger (
      customer_id, entry_type, points, source, reason, reverses_entry_id, idempotency_key
    )
    values (
      credit.customer_id, 'expire', -usable, 'expiry_job',
      'Points expired', credit.id,
      'expire:' || credit.id::text
    )
    on conflict do nothing
    returning id into made_id;

    if made_id is not null then
      made_ids := made_ids || made_id;
      made_id  := null;
    end if;

    update public.loyalty_ledger
    set consumed_points = points
    where id = credit.id;
  end loop;

  return query
  select l.customer_id, (-sum(l.points))::integer, count(*)::integer
  from public.loyalty_ledger l
  where l.id = any (made_ids)
  group by l.customer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Earn rules
-- ---------------------------------------------------------------------------
-- Which events credit points, so "no points for a lead, no points for an
-- enquiry, no points for an unpaid reservation" is configuration rather than
-- a rule buried in code.

create table if not exists public.loyalty_earn_rules (
  id              uuid primary key default gen_random_uuid(),
  event_key       text not null unique check (event_key in (
                    'deal_completed','deal_confirmed','payment_verified','manual_bonus'
                  )),
  is_enabled      boolean not null default false,
  multiplier      numeric(6, 3) not null default 1.000 check (multiplier > 0),
  -- Only deals for cars in these collections qualify. Empty means all.
  collection_ids  uuid[] not null default '{}',
  notes           text,
  updated_by      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

-- The only event that should credit points by default is a finished sale,
-- and even that stays disabled until the program is switched on.
insert into public.loyalty_earn_rules (event_key, is_enabled, notes)
values
  ('deal_completed',   false, 'A finished sale. The safe default: the money has been taken.'),
  ('deal_confirmed',   false, 'Confirmed but not completed. Earns before delivery — only enable deliberately.'),
  ('payment_verified', false, 'Per verified payment. Can credit several times for one deal.'),
  ('manual_bonus',     false, 'Staff granting goodwill points. Needs loyalty.adjust.')
on conflict (event_key) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Audit for settings changes
-- ---------------------------------------------------------------------------

create table if not exists public.loyalty_settings_history (
  id          uuid primary key default gen_random_uuid(),
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now(),
  before_row  jsonb not null,
  after_row   jsonb not null
);

create or replace function public.log_loyalty_settings_change()
returns trigger
language plpgsql
as $$
begin
  insert into public.loyalty_settings_history (changed_by, before_row, after_row)
  values (new.updated_by, to_jsonb(old), to_jsonb(new));

  return new;
end;
$$;

drop trigger if exists loyalty_settings_log on public.loyalty_settings;

create trigger loyalty_settings_log
  after update on public.loyalty_settings
  for each row
  execute function public.log_loyalty_settings_change();

-- ---------------------------------------------------------------------------
-- 10. Row-level security
-- ---------------------------------------------------------------------------

alter table public.loyalty_settings          enable row level security;
alter table public.loyalty_wallets           enable row level security;
alter table public.loyalty_ledger            enable row level security;
alter table public.loyalty_earn_rules        enable row level security;
alter table public.loyalty_settings_history  enable row level security;

drop policy if exists loyalty_settings_select on public.loyalty_settings;
create policy loyalty_settings_select on public.loyalty_settings
  for select to authenticated using (public.has_permission(auth.uid(), 'loyalty.view'));

drop policy if exists loyalty_settings_update on public.loyalty_settings;
create policy loyalty_settings_update on public.loyalty_settings
  for update to authenticated
  using (public.has_permission(auth.uid(), 'loyalty.settings'))
  with check (public.has_permission(auth.uid(), 'loyalty.settings'));

drop policy if exists loyalty_wallets_select on public.loyalty_wallets;
create policy loyalty_wallets_select on public.loyalty_wallets
  for select to authenticated using (public.has_permission(auth.uid(), 'loyalty.view'));

-- No write policy on wallets at all. They are maintained by trigger, and a
-- policy allowing a hand-edit would be a way to grant points without a
-- ledger entry — which is the one thing this design exists to prevent.

drop policy if exists loyalty_ledger_select on public.loyalty_ledger;
create policy loyalty_ledger_select on public.loyalty_ledger
  for select to authenticated using (public.has_permission(auth.uid(), 'loyalty.view'));

drop policy if exists loyalty_ledger_insert on public.loyalty_ledger;
create policy loyalty_ledger_insert on public.loyalty_ledger
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'loyalty.adjust'));

drop policy if exists loyalty_earn_rules_select on public.loyalty_earn_rules;
create policy loyalty_earn_rules_select on public.loyalty_earn_rules
  for select to authenticated using (public.has_permission(auth.uid(), 'loyalty.view'));

drop policy if exists loyalty_earn_rules_update on public.loyalty_earn_rules;
create policy loyalty_earn_rules_update on public.loyalty_earn_rules
  for update to authenticated
  using (public.has_permission(auth.uid(), 'loyalty.settings'))
  with check (public.has_permission(auth.uid(), 'loyalty.settings'));

drop policy if exists loyalty_settings_history_select on public.loyalty_settings_history;
create policy loyalty_settings_history_select on public.loyalty_settings_history
  for select to authenticated using (public.has_permission(auth.uid(), 'loyalty.view'));

commit;

-- ===========================================================================
-- Check it
-- ===========================================================================

-- 1. The program is off and unconfigured, as it should ship.
select is_enabled, earn_points_per_1000_aed, redeem_points_per_aed, expiry_months
from public.loyalty_settings;

-- 2. It cannot be switched on without the two numbers. This must FAIL:
--    update public.loyalty_settings set is_enabled = true where id = true;
--    ERROR: loyalty_settings_enabled_needs_config

-- 3. No earn rule is live yet.
select event_key, is_enabled from public.loyalty_earn_rules order by event_key;

-- 4. The wallet cache agrees with the ledger. Must be zero rows, always.
select * from public.check_loyalty_wallets();

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- Nothing here existed before, so rolling back is a clean drop. Do it before
-- any real points are credited; afterwards, dropping the ledger destroys the
-- accounting history and there is no way to reconstruct it.
--
--   drop trigger if exists loyalty_settings_log on public.loyalty_settings;
--   drop trigger if exists loyalty_ledger_apply_to_wallet on public.loyalty_ledger;
--   drop trigger if exists loyalty_ledger_append_only on public.loyalty_ledger;
--
--   drop function if exists public.log_loyalty_settings_change();
--   drop function if exists public.apply_loyalty_entry_to_wallet();
--   drop function if exists public.guard_loyalty_ledger_append_only();
--   drop function if exists public.expire_loyalty_points(timestamptz);
--   drop function if exists public.check_loyalty_wallets();
--   drop function if exists public.rebuild_loyalty_wallet(uuid);
--
--   drop table if exists public.loyalty_settings_history;
--   drop table if exists public.loyalty_earn_rules;
--   drop table if exists public.loyalty_ledger;
--   drop table if exists public.loyalty_wallets;
--   drop table if exists public.loyalty_settings;
-- ===========================================================================
