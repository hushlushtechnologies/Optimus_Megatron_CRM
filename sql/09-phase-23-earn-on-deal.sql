-- ---------------------------------------------------------------------------
-- Sprint 8 — Phase 23
-- Credit points when a sale actually finishes
-- ---------------------------------------------------------------------------
--
-- Phase 19 built earn_loyalty_points(). Nothing called it. The function was
-- defined, granted and idempotent, and no customer could ever accrue a point,
-- because no code path invoked it. This closes that gap.
--
-- earn_loyalty_for_deal() is the only way the application credits points for
-- a sale. It takes a deal and an event, and decides everything else itself:
--
--   * the customer comes from the deal, never from the caller, so no caller
--     can direct points at an account of their choosing
--   * the deal's status must actually match the event, so a Draft deal
--     cannot be made to pay out by asking nicely
--   * the idempotency key is derived, not supplied, so a retry, a double
--     click and two concurrent workers all produce one credit
--   * 'manual_bonus' is refused outright — that event is a staff member
--     granting goodwill points, which needs loyalty.adjust and goes through
--     adjust_loyalty_points() instead. Without this refusal, anyone who can
--     reach this function could grant points without holding that permission.
--
-- Returns the points credited and the customer, so the caller can notify the
-- right person. Zero points is a normal answer: the programme may be off, the
-- rule disabled, or the credit already made.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.earn_loyalty_for_deal(
  p_deal_id    uuid,
  p_event_key  text,
  p_actor_id   uuid default null
)
returns table (points integer, customer_id uuid)
language plpgsql
as $$
declare
  v_deal     record;
  v_points   integer;
  v_required text[];
  v_key      text;
begin
  -- Two notes on style, both of them load-bearing.
  --
  -- Every column below is qualified, and the result is handed back with
  -- `return query` rather than by assigning to the OUT parameters.
  -- `customer_id` is both an OUT parameter and a sales_deals column, and an
  -- unqualified reference to it is ambiguous — which plpgsql reports only
  -- when the function runs, not when it is created.
  --
  -- And every path returns exactly one row. It would be easy to let the
  -- early exits return nothing, but then "nothing happened" arrives at the
  -- caller in two different shapes: no row at all when the deal is in the
  -- wrong state, and one row of zero when the programme is switched off.
  -- A caller that handles only one of those reads `points` as undefined and
  -- carries on. One row, always, with zero meaning nothing was credited.

  -- ---- The event must be one a deal transition can legitimately raise ----
  --
  -- Deliberately a whitelist. 'manual_bonus' is absent on purpose: see the
  -- header. An unknown key is a programming error, not a no-op, so it raises
  -- rather than quietly crediting nothing.
  if p_event_key not in ('deal_completed', 'deal_confirmed', 'payment_verified') then
    raise exception 'event_not_allowed_here'
      using errcode = 'check_violation',
            hint = 'Use adjust_loyalty_points() for manual grants.';
  end if;

  select d.id, d.customer_id as owner_id, d.status
    into v_deal
  from public.sales_deals d
  where d.id = p_deal_id;

  if not found then
    return query select 0, null::uuid;
    return;
  end if;

  if v_deal.owner_id is null then
    return query select 0, null::uuid;
    return;
  end if;

  -- ---- The deal must really be in the state the event claims ----
  v_required := case p_event_key
    when 'deal_completed'   then array['Completed']
    when 'deal_confirmed'   then array['Confirmed', 'Completed']
    when 'payment_verified' then array['Reserved', 'Confirmed', 'Completed']
  end;

  if not (v_deal.status = any (v_required)) then
    return query select 0, v_deal.owner_id;
    return;
  end if;

  -- ---- Credit, idempotently ----
  --
  -- The key is the event and the deal, so the same sale finishing twice (a
  -- retry, a re-entered transition) credits once. payment_verified is the one
  -- event that may legitimately credit more than once for a deal, so its key
  -- carries the ledger's own count of prior credits for this pair rather than
  -- collapsing them all into one.
  if p_event_key = 'payment_verified' then
    select p_event_key || ':' || p_deal_id::text || ':' || count(*)::text
      into v_key
    from public.loyalty_ledger l
    where l.deal_id = p_deal_id
      and l.idempotency_key like 'payment_verified:' || p_deal_id::text || ':%';
  else
    v_key := p_event_key || ':' || p_deal_id::text;
  end if;

  v_points := public.earn_loyalty_points(
    v_deal.owner_id,
    p_deal_id,
    p_event_key,
    v_key,
    p_actor_id
  );

  return query select coalesce(v_points, 0), v_deal.owner_id;
end;
$$;

-- Same posture as the rest of the loyalty functions: not reachable by an
-- anonymous visitor, callable by a signed-in user, with the guards above
-- doing the deciding.
revoke all on function public.earn_loyalty_for_deal(uuid, text, uuid) from public;
grant execute on function public.earn_loyalty_for_deal(uuid, text, uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it
-- ---------------------------------------------------------------------------

-- 1. It exists.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'earn_loyalty_for_deal';

-- 2. A manual bonus is refused. Expected: ERROR event_not_allowed_here.
--
--    select * from public.earn_loyalty_for_deal(
--      '00000000-0000-0000-0000-000000000000', 'manual_bonus');

-- 3. With loyalty off, a completed deal credits nothing and says so.
--    Expected: points = 0.
--
--    select * from public.earn_loyalty_for_deal(
--      '<a completed deal id>', 'deal_completed');
