-- ===========================================================================
-- Sprint 10 — Phase 18
-- Notification preferences
-- ===========================================================================
--
-- The only genuinely new table in this sprint. Everything else already had
-- one.
--
--
-- WHAT IT IS FOR
--
-- Today every notification goes to whoever the creation helper picked, and
-- there is no way for anyone to say "stop telling me about lead stage
-- changes". This table is that way.
--
--
-- THE DESIGN DECISION THAT MATTERS: ABSENT MEANS ON
--
-- A row here is a person having turned something OFF. No row means on.
--
-- The other way round — a row per person per preference, defaulting to
-- enabled — would mean a new staff member receives nothing until rows are
-- created for them, and a newly added notification type reaches nobody until
-- a backfill runs. Both are silent failures: the notification is simply never
-- sent and nothing reports it.
--
-- This way the failure mode is the safe one. A person who has never touched
-- the page gets everything; the worst a missing row can do is send a
-- notification somebody did not want.
--
--
-- MANDATORY NOTIFICATIONS
--
-- Sprint 10: "ordinary staff must not be able to disable mandatory security
-- or financial notifications."
--
-- Two are mandatory, listed in notification-catalog.ts:
--
--   points_adjusted                 somebody changed a balance by hand
--   payment_verification_required   money recorded that nobody has verified
--
-- Those are enforced in two places and neither is the screen:
--
--   1. a CHECK constraint here refuses the row outright
--   2. the gate in create-notification.ts ignores preferences for them
--
-- The constraint lists the keys literally rather than joining to anything,
-- because this is the kind of rule that should fail loudly at the moment of
-- the write. check-notification-mandatory.py keeps the list in step with the
-- catalog.
--
--
-- COMPANY-WIDE RULES ARE NOT IN THIS TABLE
--
-- Phase 18 asks to distinguish personal preferences, company-wide rules and
-- mandatory notifications. Personal preferences are here. Mandatory ones are
-- the constraint above. Company-wide rules — "nobody gets lead stage changes"
-- — are NOT built, because there is nothing to enforce them with: every
-- notification is created by application code, and a company rule that only
-- the settings page knows about is a rule a future helper will not consult.
--
-- The page says so rather than offering a toggle that does nothing. Doing it
-- properly means the gate consulting a second table, which is a small change
-- once somebody actually wants it.
--
--
-- Safe to run more than once. Requires sql/11 and sql/12.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    raise exception 'public.profiles does not exist. This table references it.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications'
  ) then
    raise exception
      'public.notifications does not exist. Preferences without notifications would have nothing to govern.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  -- A preferenceKey from notification-catalog.ts, not a notification type:
  -- several types share one toggle, so that staff are offered ten switches
  -- rather than seventeen.
  preference_key text not null,
  -- Always false in practice: a row exists because somebody switched
  -- something off. Kept as a column rather than implied by the row so that
  -- re-enabling can be an update, and so the table reads honestly to anybody
  -- querying it directly.
  enabled        boolean not null default false,
  updated_at     timestamptz not null default now(),

  primary key (user_id, preference_key),

  -- Mandatory notifications cannot be switched off. Refused here as well as
  -- in the application, because the application is not the only thing that
  -- can write to this table.
  constraint notification_preferences_not_mandatory check (
    preference_key not in ('loyalty_adjustment', 'payment_verification')
  )
);

comment on table public.notification_preferences is
  'A row means this person has switched this group of notifications OFF. No row means on, so a new staff member and a newly added notification type both default to receiving.';

comment on column public.notification_preferences.preference_key is
  'A preferenceKey from src/lib/types/notification-catalog.ts. Mandatory keys are refused by a check constraint.';

-- ---------------------------------------------------------------------------
-- 2. Row level security
-- ---------------------------------------------------------------------------
--
-- Your own preferences, and nobody else's. There is no administrative
-- override policy on purpose: an admin changing what notifications somebody
-- else receives, silently, is not a feature anybody asked for, and the
-- mandatory ones are already protected by the constraint.

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own
  on public.notification_preferences for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Who should receive a payment verification notification
-- ---------------------------------------------------------------------------
--
-- Every existing helper sends to one named individual. This event cannot:
-- the people who should hear about it are whoever holds payments.verify, and
-- that is a role question.
--
-- Returning ids rather than having the application query roles keeps the
-- definition of "can verify a payment" in one place — the same
-- role_permission_grants the rest of the app authorises against.
--
-- The person who recorded the payment is excluded. Under the separate-verifier
-- rule they are specifically the one who must not verify it, so telling them
-- it needs verifying is at best noise and at worst an invitation.

create or replace function public.payment_verifier_ids(p_exclude uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct pr.id
  from public.profiles pr
  join public.role_permission_grants g on g.role_id = pr.role_id
  where g.permission = 'payments.verify'
    and (p_exclude is null or pr.id <> p_exclude);
$$;

revoke all on function public.payment_verifier_ids(uuid) from public;
revoke all on function public.payment_verifier_ids(uuid) from anon;
grant execute on function public.payment_verifier_ids(uuid) to authenticated;

comment on function public.payment_verifier_ids is
  'The staff who hold payments.verify, optionally excluding one person — normally whoever recorded the payment, since the separate-verifier rule means they must not verify it.';

commit;

-- ===========================================================================
-- Check it
-- ===========================================================================
--
-- 1. A mandatory key is refused:
--
--      insert into public.notification_preferences (user_id, preference_key)
--      values ('<a profile id>', 'payment_verification');
--
--    -> ERROR: violates check constraint
--             "notification_preferences_not_mandatory"
--
-- 2. An ordinary key is accepted:
--
--      insert into public.notification_preferences (user_id, preference_key)
--      values ('<a profile id>', 'lead_stage');
--
-- 3. You cannot see or change somebody else's:
--
--      select * from public.notification_preferences;
--
--    -> only your own rows, whatever is in the table.
--
-- 4. Who would be told about a payment needing verification:
--
--      select * from public.payment_verifier_ids();
--
--    If this returns nothing, no role holds payments.verify and that
--    notification would reach nobody. Worth knowing before relying on it.
-- ===========================================================================
