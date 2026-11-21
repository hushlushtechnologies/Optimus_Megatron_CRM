-- ===========================================================================
-- Sprint 8 — Phase 13
-- Promotion activity: an audit trail for campaign edits
-- ===========================================================================
--
-- Phase 13 asks the detail page for an Audit section. Phase 2 gave us
-- promotion_status_history, which covers draft → active → paused, and the
-- redemption rows carry a `terms` snapshot so editing a campaign cannot
-- rewrite what a customer was already given.
--
-- What is missing is the middle: somebody changing the discount from 10% to
-- 15%, or moving the end date, or raising the usage limit. Those are the
-- changes that matter most for "protect existing transactions and committed
-- pricing", because they are invisible otherwise — the row just looks
-- different than it did yesterday and nothing says who or when.
--
-- WHY A TRIGGER AND NOT THE SERVER ACTION
--
-- An action-based log records what that action knows it changed. A trigger
-- records what actually changed, whoever changed it — including a fix made
-- by hand in the Supabase SQL editor at 2am, which is exactly the change
-- somebody will want to look up later. It also cannot drift from the code
-- that writes the row, because it IS the write.
--
-- This follows the enquiry_activity pattern from Sprint 7 so there is one
-- shape of audit row in the app, not two.
--
-- Everything here is additive. Safe to run more than once.
--
-- ROLLBACK: see the end of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.promotion_activity (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.promotions (id) on delete cascade,

  -- 'created' | 'updated' | 'archived' | 'restored'
  activity_type text not null,

  -- Which column, for an update. Null for created/archived.
  field_name    text,

  -- Rendered as text rather than kept typed: this is a record for a person
  -- to read, not a value to compute with. The authoritative value is the
  -- column itself.
  old_value     text,
  new_value     text,

  description   text,

  changed_by    uuid references public.profiles (id) on delete set null,
  changed_at    timestamptz not null default now()
);

create index if not exists promotion_activity_promotion_idx
  on public.promotion_activity (promotion_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 2. Which columns are worth logging
-- ---------------------------------------------------------------------------
--
-- Not every column. `redemption_count` changes on every redemption and
-- `is_active` is derived by a trigger, so logging those would bury the
-- changes a person actually made under ones the system made.
--
-- `status` is excluded too: promotion_status_history already covers it, in
-- more detail, with the reason attached.

create or replace function public.log_promotion_activity()
returns trigger
language plpgsql
as $$
declare
  v_actor uuid;
  v_field text;
  v_old   text;
  v_new   text;
begin
  -- updated_by if the writer set it, otherwise whoever is connected.
  v_actor := coalesce(new.updated_by, auth.uid());

  if tg_op = 'INSERT' then
    insert into public.promotion_activity
      (promotion_id, activity_type, description, changed_by)
    values
      (new.id, 'created', format('Campaign "%s" created', new.name), coalesce(new.created_by, v_actor));

    return new;
  end if;

  -- Archiving and restoring are their own events, not field edits.
  if old.archived_at is null and new.archived_at is not null then
    insert into public.promotion_activity
      (promotion_id, activity_type, description, changed_by)
    values (new.id, 'archived', 'Campaign archived', v_actor);
    return new;
  end if;

  if old.archived_at is not null and new.archived_at is null then
    insert into public.promotion_activity
      (promotion_id, activity_type, description, changed_by)
    values (new.id, 'restored', 'Campaign restored from the archive', v_actor);
    return new;
  end if;

  -- One row per changed column, so the Audit section reads as a list of
  -- facts rather than a diff somebody has to interpret.
  foreach v_field in array array[
    'name', 'reference', 'description',
    'promotion_type', 'discount_type', 'discount_value',
    'starts_at', 'ends_at', 'priority',
    'max_redemptions', 'max_per_customer',
    'min_purchase_fils', 'max_discount_fils',
    'points_multiplier', 'stacking_policy',
    'internal_notes', 'banner_url'
  ]
  loop
    execute format('select ($1).%I::text, ($2).%I::text', v_field, v_field)
      into v_old, v_new
      using old, new;

    if v_old is distinct from v_new then
      insert into public.promotion_activity
        (promotion_id, activity_type, field_name, old_value, new_value, changed_by)
      values (new.id, 'updated', v_field, v_old, v_new, v_actor);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists promotions_log_activity on public.promotions;

create trigger promotions_log_activity
  after insert or update on public.promotions
  for each row
  execute function public.log_promotion_activity();

-- ---------------------------------------------------------------------------
-- 3. Row-level security
-- ---------------------------------------------------------------------------
--
-- Readable by anyone who can see offers. Not writable from the client at
-- all: the trigger writes it, and an audit trail somebody can insert into
-- by hand is not an audit trail.

alter table public.promotion_activity enable row level security;

drop policy if exists promotion_activity_select on public.promotion_activity;

create policy promotion_activity_select on public.promotion_activity
  for select to authenticated
  using (public.has_permission(auth.uid(), 'offers.view'));

-- No insert, update or delete policy. Deliberate.

commit;

-- ===========================================================================
-- Check it
-- ===========================================================================

-- 1. The table and trigger exist.
select tgname from pg_trigger
where tgrelid = 'public.promotions'::regclass and not tgisinternal
order by tgname;

-- 2. Editing a campaign logs one row per changed field.
--
--    update public.promotions
--    set discount_value = 20, priority = 5
--    where id = '<some id>';
--
--    select field_name, old_value, new_value
--    from public.promotion_activity
--    where promotion_id = '<some id>'
--    order by changed_at desc;
--
--    -> two rows: discount_value 15 → 20, priority 10 → 5

-- 3. Nobody can write to it directly.
select polname, polcmd from pg_policy
where polrelid = 'public.promotion_activity'::regclass;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
--   drop trigger if exists promotions_log_activity on public.promotions;
--   drop function if exists public.log_promotion_activity();
--   drop table if exists public.promotion_activity;
--
-- Dropping the table loses the trail. The trigger alone can be dropped if
-- you want to stop logging without losing what is already there.
-- ===========================================================================
