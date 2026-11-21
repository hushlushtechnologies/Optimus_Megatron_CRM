-- ===========================================================================
-- Sprint 8 — Phases 19, 20 and 21
-- Earning, redeeming and adjusting loyalty points
-- ===========================================================================
--
-- Phase 3 built the tables: loyalty_settings, loyalty_wallets (a cache),
-- loyalty_ledger (append-only, with an idempotency index), loyalty_earn_rules
-- and expire_loyalty_points.
--
-- This adds the operations. Every one of them is a database function, for the
-- same reason code redemption is: the checks and the write have to happen
-- under one lock, and application code cannot hold a lock across two
-- statements.
--
-- WHAT THESE FUNCTIONS DO NOT TOUCH
--
-- loyalty_ledger_apply_to_wallet already maintains available_points,
-- lifetime_earned, lifetime_redeemed and expired_points on every insert, and
-- raises if a balance would go negative. So nothing here writes those
-- columns. The only wallet column these functions own is reserved_points,
-- which the trigger does not maintain.
--
-- That division is deliberate and it is the bug that bit Phase 12: the first
-- version of redeem_promotion_code bumped a counter the trigger already
-- bumped, so one redemption counted as two. One owner per counter.
--
-- Additive and idempotent. Safe to run more than once.
-- ROLLBACK: see the end of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Reservations — the reserve / commit / release mechanism
-- ---------------------------------------------------------------------------
--
-- Phase 20 asks for "a reserve/commit/release mechanism if required by the
-- sales process" and "one-time use of redemption references".
--
-- It is required here. Points are spent against a deal that is still being
-- negotiated, so there is a gap between "the customer agrees to spend 5,000
-- points" and "the deal is confirmed". Without a reservation, the same 5,000
-- points could be promised on two deals at once; the balance only goes down
-- when one of them commits.
--
-- The unique index is what makes a redemption reference one-time: one live
-- reservation per deal, so a retried request finds the existing one instead
-- of creating a second.

create table if not exists public.loyalty_reservations (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customer_profiles (id) on delete restrict,
  deal_id       uuid not null references public.sales_deals (id) on delete cascade,

  points        integer not null check (points > 0),

  -- The conversion at the moment of reserving, so a settings change between
  -- reserve and commit cannot alter what the customer was promised.
  points_per_aed integer not null check (points_per_aed > 0),
  discount_fils  bigint not null check (discount_fils > 0),

  status        text not null default 'held'
                  check (status in ('held','committed','released','expired')),

  -- A hold does not last forever. An abandoned deal must not keep points
  -- locked up, so a hold past this is fair game for the sweep below.
  expires_at    timestamptz not null default now() + interval '7 days',

  ledger_id     uuid references public.loyalty_ledger (id) on delete set null,

  released_reason text,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  settled_at    timestamptz
);

-- One live hold per deal. This is the one-time-use guarantee.
create unique index if not exists loyalty_reservations_one_live_per_deal
  on public.loyalty_reservations (deal_id)
  where status = 'held';

create index if not exists loyalty_reservations_customer_idx
  on public.loyalty_reservations (customer_id, status);

alter table public.loyalty_reservations enable row level security;

drop policy if exists loyalty_reservations_select on public.loyalty_reservations;

create policy loyalty_reservations_select on public.loyalty_reservations
  for select to authenticated
  using (public.has_permission(auth.uid(), 'loyalty.view'));

-- No insert, update or delete policy: the functions below own this table.

-- ---------------------------------------------------------------------------
-- 2. What a deal's qualifying spend is
-- ---------------------------------------------------------------------------
--
-- "Use actual verified deal/payment data." The basis is configurable, so
-- this reads it from settings rather than picking a column.

create or replace function public.loyalty_qualifying_fils(p_deal_id uuid)
returns bigint
language plpgsql
stable
as $$
declare
  v_basis text;
  v_deal  record;
  v_amount numeric;
begin
  select earn_basis into v_basis from public.loyalty_settings where id = true;

  select agreed_price, proposed_price, discount_amount
    into v_deal
  from public.sales_deals
  where id = p_deal_id;

  if not found then
    return 0;
  end if;

  v_amount := case v_basis
    when 'agreed_price'   then v_deal.agreed_price
    when 'proposed_price' then v_deal.proposed_price
    when 'net_price'      then coalesce(v_deal.proposed_price, 0) - coalesce(v_deal.discount_amount, 0)
    else v_deal.agreed_price
  end;

  if v_amount is null or v_amount <= 0 then
    return 0;
  end if;

  -- Decimal dirhams to fils. round() not trunc(): a half fil belongs to
  -- whoever the rounding favours consistently, and every other money path
  -- in this app rounds half-up.
  return (round(v_amount * 100))::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Earning (Phase 19)
-- ---------------------------------------------------------------------------
--
-- The rules, from the plan, each enforced below:
--
--   No points for a lead, an enquiry, or an unpaid reservation. Only the
--   four event keys in loyalty_earn_rules can credit, and each is disabled
--   until switched on. There is no code path from a lead or an enquiry to
--   this function.
--
--   No duplicate points when an event is retried. The caller passes an
--   idempotency key; a repeat collides on the unique index and returns the
--   points already credited rather than crediting again.
--
--   Multipliers through promotions where eligible. A promotion applied to
--   the deal with a points_multiplier set multiplies the credit, and the
--   largest multiplier wins if there are several.
--
--   Concurrent processing cannot credit twice. The wallet row is locked
--   before anything is counted, so two workers handling the same event
--   serialise and the second sees the first's entry.

create or replace function public.earn_loyalty_points(
  p_customer_id     uuid,
  p_deal_id         uuid,
  p_event_key       text,
  p_idempotency_key text,
  p_actor_id        uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_settings   public.loyalty_settings;
  v_rule       public.loyalty_earn_rules;
  v_existing   public.loyalty_ledger;
  v_car_coll   uuid;
  v_fils       bigint;
  v_multiplier numeric;
  v_points     integer;
  v_expires    timestamptz;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key_required' using errcode = 'check_violation';
  end if;

  -- ---- Already done? ----
  --
  -- Checked first and returned plainly, so a retry is a no-op rather than an
  -- error the caller has to interpret.
  select * into v_existing
  from public.loyalty_ledger
  where idempotency_key = btrim(p_idempotency_key);

  if found then
    return v_existing.points;
  end if;

  select * into v_settings from public.loyalty_settings where id = true;

  if not v_settings.is_enabled then
    return 0;
  end if;

  if v_settings.earn_points_per_1000_aed is null then
    return 0;
  end if;

  select * into v_rule
  from public.loyalty_earn_rules
  where event_key = p_event_key;

  if not found or not v_rule.is_enabled then
    return 0;
  end if;

  -- ---- Collection restriction ----
  if array_length(v_rule.collection_ids, 1) is not null then
    select c.collection_id into v_car_coll
    from public.sales_deals d
    join public.cars c on c.id = d.car_id
    where d.id = p_deal_id;

    if v_car_coll is null or not (v_car_coll = any (v_rule.collection_ids)) then
      return 0;
    end if;
  end if;

  v_fils := public.loyalty_qualifying_fils(p_deal_id);

  if v_fils <= 0 then
    return 0;
  end if;

  -- ---- The multiplier ----
  --
  -- The rule's own multiplier, times the best promotion multiplier applied
  -- to this deal. Promotions are read from the redemptions actually recorded
  -- against the deal, so a campaign that was never applied cannot inflate
  -- the credit.
  v_multiplier := v_rule.multiplier;

  select coalesce(max(p.points_multiplier), 1)
    into strict v_multiplier
  from (select v_multiplier as base) b
  cross join lateral (
    select coalesce(max(pr.points_multiplier), 1) as points_multiplier
    from public.offer_redemptions r
    join public.promotions pr on pr.id = r.promotion_id
    where r.deal_id = p_deal_id
      and r.status = 'applied'
      and pr.points_multiplier is not null
  ) p;

  v_multiplier := v_rule.multiplier * v_multiplier;

  -- ---- The points ----
  --
  -- Rate is per AED 1,000, so per 100,000 fils. floor(), not round(): a
  -- part-earned point is not earned. Rounding up would hand out a point for
  -- AED 1 of spend at a rate of one point per thousand.
  v_points := floor((v_fils::numeric / 100000) * v_settings.earn_points_per_1000_aed * v_multiplier);

  if v_points <= 0 then
    return 0;
  end if;

  if v_settings.expiry_months is not null then
    v_expires := now() + make_interval(months => v_settings.expiry_months);
  end if;

  -- ---- The lock ----
  --
  -- Taken before the insert, so two workers processing the same event
  -- serialise here. The second one's insert then collides on the
  -- idempotency index.
  perform 1 from public.loyalty_wallets where customer_id = p_customer_id for update;

  insert into public.loyalty_ledger (
    customer_id, entry_type, points, source,
    deal_id, actor_id, idempotency_key, expires_at
  )
  values (
    p_customer_id, 'earn', v_points, 'sale',
    p_deal_id, p_actor_id, btrim(p_idempotency_key), v_expires
  );

  return v_points;

exception
  -- A concurrent worker won the race. Not an error: the points exist.
  when unique_violation then
    select points into v_points
    from public.loyalty_ledger
    where idempotency_key = btrim(p_idempotency_key);

    return coalesce(v_points, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reserving points (Phase 20, step one)
-- ---------------------------------------------------------------------------

create or replace function public.reserve_loyalty_points(
  p_customer_id uuid,
  p_deal_id     uuid,
  p_points      integer,
  p_actor_id    uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_settings  public.loyalty_settings;
  v_wallet    public.loyalty_wallets;
  v_available integer;
  v_deal_fils bigint;
  v_fils      bigint;
  v_max_fils  bigint;
  v_id        uuid;
begin
  select * into v_settings from public.loyalty_settings where id = true;

  if not v_settings.is_enabled then
    raise exception 'loyalty_disabled' using errcode = 'check_violation';
  end if;

  if v_settings.redeem_points_per_aed is null then
    raise exception 'conversion_not_configured' using errcode = 'check_violation';
  end if;

  if p_points is null or p_points <= 0 then
    raise exception 'points_must_be_positive' using errcode = 'check_violation';
  end if;

  if v_settings.min_redeem_points is not null and p_points < v_settings.min_redeem_points then
    raise exception 'below_minimum_redemption' using errcode = 'check_violation';
  end if;

  if v_settings.max_redeem_points is not null and p_points > v_settings.max_redeem_points then
    raise exception 'above_maximum_redemption' using errcode = 'check_violation';
  end if;

  -- ---- The lock, before counting ----
  select * into v_wallet
  from public.loyalty_wallets
  where customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'no_wallet' using errcode = 'no_data_found';
  end if;

  -- Reserved points are already promised elsewhere, so they are not
  -- available. This is the whole point of the column.
  v_available := v_wallet.available_points - v_wallet.reserved_points;

  if v_available < p_points then
    raise exception 'insufficient_points' using errcode = 'check_violation';
  end if;

  -- ---- What the points are worth ----
  --
  -- points_per_aed is how many points buy AED 1, so fils = points * 100 / rate.
  v_fils := (p_points::numeric * 100 / v_settings.redeem_points_per_aed)::bigint;

  if v_fils <= 0 then
    raise exception 'worth_nothing' using errcode = 'check_violation';
  end if;

  -- ---- The ceiling on one deal ----
  if v_settings.max_redeem_bps_of_deal is not null then
    v_deal_fils := public.loyalty_qualifying_fils(p_deal_id);

    if v_deal_fils > 0 then
      v_max_fils := (v_deal_fils::numeric * v_settings.max_redeem_bps_of_deal / 10000)::bigint;

      if v_fils > v_max_fils then
        raise exception 'above_deal_ceiling' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- ---- The hold ----
  --
  -- The conversion is copied in, so a settings change before commit cannot
  -- change what this customer was promised.
  insert into public.loyalty_reservations (
    customer_id, deal_id, points, points_per_aed, discount_fils, created_by
  )
  values (
    p_customer_id, p_deal_id, p_points, v_settings.redeem_points_per_aed, v_fils, p_actor_id
  )
  returning id into v_id;

  -- reserved_points is the one wallet column these functions own. The
  -- trigger does not maintain it.
  update public.loyalty_wallets
  set reserved_points = reserved_points + p_points,
      updated_at = now()
  where customer_id = p_customer_id;

  return v_id;

exception
  when unique_violation then
    raise exception 'deal_already_has_a_hold' using errcode = 'check_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Committing (Phase 20, step two)
-- ---------------------------------------------------------------------------
--
-- Turns a hold into a ledger entry. FIFO allocation against earn entries so
-- expire_loyalty_points can age out what is genuinely left, oldest first.

create or replace function public.commit_loyalty_redemption(
  p_reservation_id uuid,
  p_actor_id       uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_res       public.loyalty_reservations;
  v_ledger_id uuid;
  v_remaining integer;
  v_entry     record;
  v_take      integer;
begin
  select * into v_res
  from public.loyalty_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation_unknown' using errcode = 'no_data_found';
  end if;

  if v_res.status <> 'held' then
    raise exception 'reservation_not_held' using errcode = 'check_violation';
  end if;

  perform 1 from public.loyalty_wallets where customer_id = v_res.customer_id for update;

  -- The ledger entry. The trigger moves available_points and
  -- lifetime_redeemed, and raises if this would go negative.
  insert into public.loyalty_ledger (
    customer_id, entry_type, points, source, deal_id, actor_id
  )
  values (
    v_res.customer_id, 'redeem', -v_res.points, 'sale', v_res.deal_id, p_actor_id
  )
  returning id into v_ledger_id;

  -- ---- FIFO allocation ----
  --
  -- Mark the oldest unconsumed earn credits as spent, so expiry has an
  -- accurate picture of what is left. Without this, expiry would age out
  -- points that were already redeemed.
  v_remaining := v_res.points;

  for v_entry in
    select id, points, consumed_points
    from public.loyalty_ledger
    where customer_id = v_res.customer_id
      and entry_type = 'earn'
      and consumed_points < points
    order by created_at, id
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_remaining, v_entry.points - v_entry.consumed_points);

    update public.loyalty_ledger
    set consumed_points = consumed_points + v_take
    where id = v_entry.id;

    v_remaining := v_remaining - v_take;
  end loop;

  -- The hold is settled.
  update public.loyalty_reservations
  set status = 'committed',
      ledger_id = v_ledger_id,
      settled_at = now()
  where id = p_reservation_id;

  update public.loyalty_wallets
  set reserved_points = greatest(reserved_points - v_res.points, 0),
      updated_at = now()
  where customer_id = v_res.customer_id;

  return v_ledger_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Releasing (Phase 20, step three)
-- ---------------------------------------------------------------------------

create or replace function public.release_loyalty_reservation(
  p_reservation_id uuid,
  p_reason         text default null
)
returns void
language plpgsql
as $$
declare
  v_res public.loyalty_reservations;
begin
  select * into v_res
  from public.loyalty_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation_unknown' using errcode = 'no_data_found';
  end if;

  if v_res.status <> 'held' then
    -- Releasing an already-settled hold is a no-op rather than an error: a
    -- retried release must not fail.
    return;
  end if;

  update public.loyalty_reservations
  set status = 'released',
      released_reason = p_reason,
      settled_at = now()
  where id = p_reservation_id;

  update public.loyalty_wallets
  set reserved_points = greatest(reserved_points - v_res.points, 0),
      updated_at = now()
  where customer_id = v_res.customer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Expiring abandoned holds
-- ---------------------------------------------------------------------------
--
-- A deal that goes quiet must not keep points locked up forever. Run on the
-- same schedule as the promotion sweep.

create or replace function public.sweep_loyalty_reservations()
returns integer
language plpgsql
as $$
declare
  v_res   record;
  v_count integer := 0;
begin
  for v_res in
    select id, customer_id, points
    from public.loyalty_reservations
    where status = 'held' and expires_at <= now()
    for update
  loop
    update public.loyalty_reservations
    set status = 'expired', settled_at = now(),
        released_reason = 'The hold expired without the deal being completed.'
    where id = v_res.id;

    update public.loyalty_wallets
    set reserved_points = greatest(reserved_points - v_res.points, 0),
        updated_at = now()
    where customer_id = v_res.customer_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Adjustments (Phase 21)
-- ---------------------------------------------------------------------------
--
-- "Every adjustment needs a reason. Every adjustment records the actor."
-- Both are enforced here and by the table's own constraint, so neither a
-- careless caller nor a hand-written INSERT can get past them.

create or replace function public.adjust_loyalty_points(
  p_customer_id uuid,
  p_points      integer,
  p_reason      text,
  p_actor_id    uuid,
  p_entry_type  text default 'adjust'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_points is null or p_points = 0 then
    raise exception 'points_must_be_non_zero' using errcode = 'check_violation';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;

  if p_actor_id is null then
    raise exception 'actor_required' using errcode = 'check_violation';
  end if;

  if p_entry_type not in ('adjust', 'correction') then
    raise exception 'bad_entry_type' using errcode = 'check_violation';
  end if;

  insert into public.loyalty_wallets (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  perform 1 from public.loyalty_wallets where customer_id = p_customer_id for update;

  -- The trigger refuses this if it would take the balance negative and the
  -- policy does not allow it.
  insert into public.loyalty_ledger (
    customer_id, entry_type, points, source, reason, actor_id,
    expires_at
  )
  values (
    p_customer_id, p_entry_type, p_points, 'manual', btrim(p_reason), p_actor_id,
    -- A positive manual credit expires like an earned one, so a goodwill
    -- gesture does not sit on the books forever.
    case when p_points > 0 then
      (select case when expiry_months is null then null
                   else now() + make_interval(months => expiry_months) end
       from public.loyalty_settings where id = true)
    end
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Reversals on a refunded or cancelled sale (Phase 21)
-- ---------------------------------------------------------------------------
--
-- "Clearly define behavior for expired points and sale refunds."
--
-- The policy comes from settings, and all three options are honoured:
--
--   reverse_earned                -- take back what the sale earned
--   keep_earned                   -- leave it; the customer keeps the points
--   reverse_and_restore_redeemed  -- take back the earn AND give back
--                                    anything they spent on this deal
--
-- Nothing is deleted. A reversal is a new entry pointing at the one it
-- undoes, and loyalty_ledger_reverses_key allows only one per entry, so a
-- retried refund cannot reverse twice.
--
-- Points that have since EXPIRED are not restored. They aged out on their
-- own schedule, and restoring them would hand back value that had already
-- lapsed — see the note in the result.

create or replace function public.reverse_loyalty_for_deal(
  p_deal_id  uuid,
  p_reason   text,
  p_actor_id uuid
)
returns table (reversed_points integer, restored_points integer, note text)
language plpgsql
as $$
declare
  v_policy         text;
  v_reversed       integer := 0;
  v_restored       integer := 0;
  v_shortfall      integer := 0;
  v_unreached      integer := 0;
  v_available      integer;
  v_capacity       integer;
  v_take           integer;
  v_allow_negative boolean;
  v_entry          record;
  v_customer       uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;

  if p_actor_id is null then
    raise exception 'actor_required' using errcode = 'check_violation';
  end if;

  select refund_policy into v_policy from public.loyalty_settings where id = true;

  if v_policy = 'keep_earned' then
    return query select 0, 0,
      'The refund policy is to let customers keep points from a refunded sale, so nothing changed.'::text;
    return;
  end if;

  select customer_id into v_customer from public.sales_deals where id = p_deal_id;

  if v_customer is null then
    return query select 0, 0, 'That deal has no customer, so there was nothing to reverse.'::text;
    return;
  end if;

  perform 1 from public.loyalty_wallets where customer_id = v_customer for update;

  -- ---- Take back what this deal earned ----
  --
  -- The total is read back FROM THE INSERTED ROWS, not accumulated in a
  -- counter as the loop goes. A counter is a second place the truth lives,
  -- and it can report a reversal that an exclusion or a constraint stopped
  -- from happening. This way the number returned is, by construction,
  -- exactly what landed in the ledger.
  --
  -- The `not exists` skips an earn entry that something already reverses —
  -- including an `expire` entry, because expire_loyalty_points points at the
  -- credit it aged. Points that already expired must not be taken away
  -- twice; they were gone before the refund.
  -- ---- How much can actually be taken back ----
  --
  -- THIS IS THE CASE THAT ONLY SHOWS UP WHEN YOU RUN IT.
  --
  -- A customer earns 1,000 points on a sale, spends 100 of them on another
  -- deal, and then the first sale is refunded. Taking back the full 1,000
  -- would leave them at -100, which allow_negative_balance = false refuses —
  -- and because the refusal is an exception, THE WHOLE REFUND FAILS. The
  -- refund cannot be processed at all until somebody changes a policy.
  --
  -- That is not an acceptable outcome, and the plan asks for the opposite:
  -- "clearly define behavior for expired points and sale refunds".
  --
  -- So the defined behaviour is: claw back what is there, never more.
  -- Points the customer has already spent are gone — the benefit was taken
  -- and cannot be un-taken — and the shortfall is reported rather than
  -- hidden. If negative balances ARE allowed by policy, the full amount is
  -- reversed and the balance goes negative, which is what that policy means.

  select coalesce(allow_negative_balance, false) into v_allow_negative
  from public.loyalty_settings where id = true;

  select coalesce(available_points, 0) into v_available
  from public.loyalty_wallets where customer_id = v_customer;

  v_capacity := case when v_allow_negative then null else greatest(v_available, 0) end;

  for v_entry in
    select l.id, l.points, l.customer_id
    from public.loyalty_ledger l
    where l.deal_id = p_deal_id
      and l.entry_type = 'earn'
      and not exists (
        select 1 from public.loyalty_ledger r where r.reverses_entry_id = l.id
      )
    order by l.created_at, l.id
    for update
  loop
    -- null capacity means no ceiling, because negatives are allowed.
    if v_capacity is null then
      v_take := v_entry.points;
    else
      v_take := least(v_entry.points, v_capacity);
    end if;

    exit when v_take <= 0;

    insert into public.loyalty_ledger (
      customer_id, entry_type, points, source, deal_id,
      reason, actor_id, reverses_entry_id
    )
    values (
      v_entry.customer_id, 'refund_reversal', -v_take, 'refund', p_deal_id,
      btrim(p_reason)
        || case when v_take < v_entry.points
                then format(' (partial: %s of %s points; the rest had already been spent)',
                            v_take, v_entry.points)
                else '' end,
      p_actor_id, v_entry.id
    );

    v_reversed := v_reversed + v_take;
    v_shortfall := v_shortfall + (v_entry.points - v_take);

    if v_capacity is not null then
      v_capacity := v_capacity - v_take;
    end if;
  end loop;

  -- Anything the loop never reached, because capacity ran out first.
  select coalesce(sum(l.points), 0) into v_unreached
  from public.loyalty_ledger l
  where l.deal_id = p_deal_id
    and l.entry_type = 'earn'
    and not exists (
      select 1 from public.loyalty_ledger r where r.reverses_entry_id = l.id
    );

  v_shortfall := v_shortfall + v_unreached;

  -- ---- Give back what they spent on it ----
  if v_policy = 'reverse_and_restore_redeemed' then
    -- Same shape, same reason: the figure comes from what was written.
    with restorable as (
      select l.id, l.points, l.customer_id
      from public.loyalty_ledger l
      where l.deal_id = p_deal_id
        and l.entry_type = 'redeem'
        and not exists (
          select 1 from public.loyalty_ledger r where r.reverses_entry_id = l.id
        )
      for update
    ),
    written as (
      insert into public.loyalty_ledger (
        customer_id, entry_type, points, source, deal_id,
        reason, actor_id, reverses_entry_id, expires_at
      )
      select
        r.customer_id, 'correction', -r.points, 'refund', p_deal_id,
        btrim(p_reason), p_actor_id, r.id,
        (select case when expiry_months is null then null
                     else now() + make_interval(months => expiry_months) end
         from public.loyalty_settings where id = true)
      from restorable r
      returning points
    )
    select coalesce(sum(points), 0) into v_restored from written;
  end if;

  select available_points into v_available
  from public.loyalty_wallets where customer_id = v_customer;

  return query select
    v_reversed,
    v_restored,
    case
      when v_reversed = 0 and v_restored = 0 and v_shortfall = 0 then
        'This deal had no loyalty activity to reverse.'

      when v_shortfall > 0 then
        format(
          'Reversed %s points and restored %s. %s points could not be taken back because the '
          || 'customer had already spent them — those stay with the customer. The balance is now %s.',
          v_reversed, v_restored, v_shortfall, v_available)

      when v_available < 0 then
        format('Reversed %s points and restored %s. The balance is now %s, which is negative '
               || 'because the policy allows it.', v_reversed, v_restored, v_available)

      else
        format('Reversed %s points and restored %s. The balance is now %s.',
               v_reversed, v_restored, v_available)
    end::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Permissions
-- ---------------------------------------------------------------------------

revoke all on function public.earn_loyalty_points(uuid, uuid, text, text, uuid) from public;
revoke all on function public.reserve_loyalty_points(uuid, uuid, integer, uuid) from public;
revoke all on function public.commit_loyalty_redemption(uuid, uuid) from public;
revoke all on function public.release_loyalty_reservation(uuid, text) from public;
revoke all on function public.adjust_loyalty_points(uuid, integer, text, uuid, text) from public;
revoke all on function public.reverse_loyalty_for_deal(uuid, text, uuid) from public;
revoke all on function public.sweep_loyalty_reservations() from public;

grant execute on function public.loyalty_qualifying_fils(uuid) to authenticated;
grant execute on function public.earn_loyalty_points(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.reserve_loyalty_points(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.commit_loyalty_redemption(uuid, uuid) to authenticated;
grant execute on function public.release_loyalty_reservation(uuid, text) to authenticated;
grant execute on function public.adjust_loyalty_points(uuid, integer, text, uuid, text) to authenticated;
grant execute on function public.reverse_loyalty_for_deal(uuid, text, uuid) to authenticated;
grant execute on function public.sweep_loyalty_reservations() to authenticated;

commit;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
--   drop function if exists public.sweep_loyalty_reservations();
--   drop function if exists public.reverse_loyalty_for_deal(uuid, text, uuid);
--   drop function if exists public.adjust_loyalty_points(uuid, integer, text, uuid, text);
--   drop function if exists public.release_loyalty_reservation(uuid, text);
--   drop function if exists public.commit_loyalty_redemption(uuid, uuid);
--   drop function if exists public.reserve_loyalty_points(uuid, uuid, integer, uuid);
--   drop function if exists public.earn_loyalty_points(uuid, uuid, text, text, uuid);
--   drop function if exists public.loyalty_qualifying_fils(uuid);
--   drop table if exists public.loyalty_reservations;
--
-- No existing table, column or trigger is altered by this script.
-- ===========================================================================
