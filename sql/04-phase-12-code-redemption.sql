-- ===========================================================================
-- Sprint 8 — Phase 12
-- Promotional codes: validation and race-safe redemption
-- ===========================================================================
--
-- The tables came with Phase 2. What was missing is the part the brief is
-- explicit about:
--
--   "Validate codes server-side."
--   "Do not allow race conditions to exceed redemption limits."
--
-- The second one cannot be done in application code. Checking used_count and
-- then inserting is two statements, and two sessions can both pass the check
-- before either inserts — so a code limited to 50 uses gets used 52 times,
-- and nothing in the logs looks wrong.
--
-- So redemption is one function, and it takes a row lock on the code before
-- it counts anything. A second session asking for the same code waits at
-- that lock, then counts a total that already includes the first session's
-- insert, and is refused.
--
-- Everything here is additive. No existing table or column is changed.
-- Safe to run more than once.
--
-- ROLLBACK: see the end of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-customer code usage
-- ---------------------------------------------------------------------------
-- promotion_codes.used_count is the total. A per-customer limit needs to know
-- how many times THIS customer used THIS code, which is a count over
-- redemptions. Indexed because it is read on every validation.

create index if not exists offer_redemptions_code_customer_idx
  on public.offer_redemptions (code_id, customer_id)
  where status = 'applied';

-- ---------------------------------------------------------------------------
-- 2. Why a code was refused
-- ---------------------------------------------------------------------------
-- A code is refused for one of a known set of reasons, and the person at the
-- desk needs to be told which — "that code has already been used the maximum
-- number of times" is actionable, "invalid code" is not.
--
-- These strings match REJECTION_REASONS in src/lib/types/offers.ts. If you
-- add one here, add it there.

create or replace function public.promotion_code_rejection(
  p_code              text,
  p_customer_id       uuid,
  p_at                timestamptz default now()
)
returns text
language plpgsql
stable
as $$
declare
  v_code   public.promotion_codes;
  v_promo  public.promotions;
  v_mine   integer;
begin
  if p_code is null or btrim(p_code) = '' then
    return 'code_missing';
  end if;

  select * into v_code
  from public.promotion_codes
  where upper(code) = upper(btrim(p_code));

  if not found then
    return 'code_unknown';
  end if;

  if not v_code.is_active then
    return 'code_inactive';
  end if;

  select * into v_promo
  from public.promotions
  where id = v_code.promotion_id;

  if not found then
    return 'code_unknown';
  end if;

  if v_promo.archived_at is not null then
    return 'promotion_archived';
  end if;

  if v_promo.status <> 'active' then
    return case v_promo.status
      when 'draft'     then 'promotion_not_published'
      when 'scheduled' then 'promotion_not_started'
      when 'paused'    then 'promotion_paused'
      when 'expired'   then 'promotion_expired'
      when 'cancelled' then 'promotion_cancelled'
      else 'promotion_not_active'
    end;
  end if;

  -- The campaign's own window. promotion_is_live covers status and dates
  -- together, but the reason has to be specific about which failed.
  if v_promo.starts_at is not null and v_promo.starts_at > p_at then
    return 'promotion_not_started';
  end if;

  if v_promo.ends_at is not null and v_promo.ends_at <= p_at then
    return 'promotion_expired';
  end if;

  -- Total uses of the code.
  if v_code.usage_limit is not null and v_code.used_count >= v_code.usage_limit then
    return 'code_exhausted';
  end if;

  -- Total uses of the campaign, across every route into it.
  if v_promo.max_redemptions is not null
     and v_promo.redemption_count >= v_promo.max_redemptions then
    return 'promotion_exhausted';
  end if;

  if p_customer_id is not null then
    -- This customer's uses of this code.
    if v_code.per_customer_limit is not null then
      select count(*) into v_mine
      from public.offer_redemptions
      where code_id = v_code.id
        and customer_id = p_customer_id
        and status = 'applied';

      if v_mine >= v_code.per_customer_limit then
        return 'code_customer_limit';
      end if;
    end if;

    -- This customer's uses of the campaign.
    if v_promo.max_per_customer is not null then
      select count(*) into v_mine
      from public.offer_redemptions
      where promotion_id = v_promo.id
        and customer_id = p_customer_id
        and status = 'applied';

      if v_mine >= v_promo.max_per_customer then
        return 'promotion_customer_limit';
      end if;
    end if;
  end if;

  return null;  -- null means the code is good
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Redeeming a code
-- ---------------------------------------------------------------------------
--
-- THE LOCK IS THE POINT.
--
--   select ... for update  on the code row, before any counting.
--
-- Two sessions redeeming the same code serialise there. The second one
-- re-reads used_count after the first has committed, so it sees the real
-- total and is refused. Without the lock both would read the same stale
-- count and both would insert.
--
-- Returns the redemption id on success, or raises with a reason code the
-- application maps to a sentence.
--
-- The caller passes the discount it calculated. That is deliberate: this
-- function enforces limits, it does not price deals. Pricing lives in
-- Phase 15/16 and is validated there. What this guarantees is that a
-- redemption row cannot exist beyond the configured limits.

create or replace function public.redeem_promotion_code(
  p_code          text,
  p_customer_id   uuid,
  p_deal_id       uuid,
  p_discount_fils bigint,
  p_terms         jsonb,
  p_redeemed_by   uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_code      public.promotion_codes;
  v_promo     public.promotions;
  v_reason    text;
  v_mine      integer;
  v_id        uuid;
begin
  if p_customer_id is null then
    raise exception 'customer_missing' using errcode = 'check_violation';
  end if;

  if p_discount_fils is null or p_discount_fils < 0 then
    raise exception 'discount_invalid' using errcode = 'check_violation';
  end if;

  -- ---- The lock ----
  --
  -- Taken before anything is counted, and held to the end of the
  -- transaction. A concurrent redemption of the same code waits here.
  select * into v_code
  from public.promotion_codes
  where upper(code) = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found then
    raise exception 'code_unknown' using errcode = 'no_data_found';
  end if;

  -- The campaign row too: max_redemptions is checked against a counter the
  -- insert trigger bumps, so two redemptions of two different codes on the
  -- same campaign must serialise as well.
  select * into v_promo
  from public.promotions
  where id = v_code.promotion_id
  for update;

  if not found then
    raise exception 'code_unknown' using errcode = 'no_data_found';
  end if;

  -- ---- Everything the read-only check does, now under the lock ----
  --
  -- Re-checked rather than trusted: the UI called promotion_code_rejection
  -- a moment ago without a lock, and a moment is long enough.

  if not v_code.is_active then
    raise exception 'code_inactive' using errcode = 'check_violation';
  end if;

  if v_promo.archived_at is not null then
    raise exception 'promotion_archived' using errcode = 'check_violation';
  end if;

  if v_promo.status <> 'active' then
    raise exception 'promotion_not_active' using errcode = 'check_violation';
  end if;

  if v_promo.starts_at is not null and v_promo.starts_at > now() then
    raise exception 'promotion_not_started' using errcode = 'check_violation';
  end if;

  if v_promo.ends_at is not null and v_promo.ends_at <= now() then
    raise exception 'promotion_expired' using errcode = 'check_violation';
  end if;

  if v_code.usage_limit is not null and v_code.used_count >= v_code.usage_limit then
    raise exception 'code_exhausted' using errcode = 'check_violation';
  end if;

  if v_promo.max_redemptions is not null
     and v_promo.redemption_count >= v_promo.max_redemptions then
    raise exception 'promotion_exhausted' using errcode = 'check_violation';
  end if;

  if v_code.per_customer_limit is not null then
    select count(*) into v_mine
    from public.offer_redemptions
    where code_id = v_code.id and customer_id = p_customer_id and status = 'applied';

    if v_mine >= v_code.per_customer_limit then
      raise exception 'code_customer_limit' using errcode = 'check_violation';
    end if;
  end if;

  if v_promo.max_per_customer is not null then
    select count(*) into v_mine
    from public.offer_redemptions
    where promotion_id = v_promo.id and customer_id = p_customer_id and status = 'applied';

    if v_mine >= v_promo.max_per_customer then
      raise exception 'promotion_customer_limit' using errcode = 'check_violation';
    end if;
  end if;

  -- ---- The insert ----
  --
  -- terms is a snapshot of what the campaign said at this moment. Editing
  -- the campaign later must not change what this customer was given, which
  -- is why the terms are copied rather than referenced.

  insert into public.offer_redemptions (
    promotion_id, customer_id, deal_id, code_id,
    discount_fils, terms, status, redeemed_by
  )
  values (
    v_promo.id, p_customer_id, p_deal_id, v_code.id,
    p_discount_fils,
    coalesce(p_terms, '{}'::jsonb) || jsonb_build_object(
      'code', v_code.code,
      'promotion_name', v_promo.name,
      'discount_type', v_promo.discount_type,
      'discount_value', v_promo.discount_value,
      'stacking_policy', v_promo.stacking_policy,
      'captured_at', now()
    ),
    'applied',
    p_redeemed_by
  )
  returning id into v_id;

  -- NO MANUAL COUNTER BUMP HERE.
  --
  -- The Phase 2 trigger offer_redemptions_bump_counts already increments
  -- BOTH promotions.redemption_count AND promotion_codes.used_count on
  -- insert. Bumping used_count here as well made one redemption count as
  -- two, so a code limited to 2 uses was exhausted after 1 — caught by
  -- racing three sessions at it and seeing the second refused.
  --
  -- One place owns each counter, and that place is the trigger.

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reversing a redemption
-- ---------------------------------------------------------------------------
--
-- A reversal is a status change plus a reason, never a delete: "Do not
-- delete ledger transactions." The counters come back down via the Phase 2
-- trigger, and the row stays as the record that it happened.

create or replace function public.reverse_offer_redemption(
  p_redemption_id uuid,
  p_reason        text,
  p_reversed_by   uuid default null
)
returns void
language plpgsql
as $$
declare
  v_row public.offer_redemptions;
begin
  select * into v_row
  from public.offer_redemptions
  where id = p_redemption_id
  for update;

  if not found then
    raise exception 'redemption_unknown' using errcode = 'no_data_found';
  end if;

  if v_row.status = 'reversed' then
    raise exception 'already_reversed' using errcode = 'check_violation';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;

  -- The same trigger decrements both counters when status becomes
  -- 'reversed', so this update is all that is needed. Decrementing
  -- used_count here too would give a code back two uses for one reversal.
  update public.offer_redemptions
  set status = 'reversed',
      reversed_at = now(),
      reversal_reason = btrim(p_reason)
  where id = p_redemption_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------------

revoke all on function public.redeem_promotion_code(text, uuid, uuid, bigint, jsonb, uuid) from public;
revoke all on function public.reverse_offer_redemption(uuid, text, uuid) from public;

grant execute on function public.promotion_code_rejection(text, uuid, timestamptz) to authenticated;
grant execute on function public.redeem_promotion_code(text, uuid, uuid, bigint, jsonb, uuid) to authenticated;
grant execute on function public.reverse_offer_redemption(uuid, text, uuid) to authenticated;

commit;

-- ===========================================================================
-- Check it
-- ===========================================================================

-- 1. The functions exist.
select proname, pronargs
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('promotion_code_rejection', 'redeem_promotion_code', 'reverse_offer_redemption')
order by proname;

-- 2. A good code returns null (no rejection).
--    select public.promotion_code_rejection('YOURCODE', '<customer uuid>');

-- 3. The index for per-customer limits is there.
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'offer_redemptions'
order by indexname;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
--   drop function if exists public.reverse_offer_redemption(uuid, text, uuid);
--   drop function if exists public.redeem_promotion_code(text, uuid, uuid, bigint, jsonb, uuid);
--   drop function if exists public.promotion_code_rejection(text, uuid, timestamptz);
--   drop index if exists public.offer_redemptions_code_customer_idx;
--
-- No table or column is touched by this script, so nothing else to undo.
-- ===========================================================================
