-- ===========================================================================
-- Sprint 6 Phase 15 — Leads & Test Drive Integration
-- Run once in the Supabase SQL editor. Safe to re-run: every statement is
-- idempotent, and nothing existing is dropped or replaced.
--
-- sales_deal_list and the functions transition_sales_deal / complete_delivery
-- are deliberately NOT touched. Lead synchronisation is done by a trigger on
-- sales_deals instead, so Phase 1-14 logic is left exactly as it is.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Provenance: which test drive a deal was started from
-- ---------------------------------------------------------------------------

alter table public.sales_deals
  add column if not exists source_test_drive_id uuid
    references public.test_drives (id) on delete set null;

create index if not exists sales_deals_source_test_drive_id_idx
  on public.sales_deals (source_test_drive_id)
  where source_test_drive_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Duplicate prevention (Feature 8)
--
-- A deal is "live" while it is Draft, Negotiation, Reserved or Confirmed.
-- Completed and Cancelled deals are ignored, so a customer who genuinely buys
-- a second vehicle from the same lead can once the first deal is finished.
-- ---------------------------------------------------------------------------

create unique index if not exists sales_deals_one_active_per_lead
  on public.sales_deals (lead_id)
  where lead_id is not null
    and status in ('Draft', 'Negotiation', 'Reserved', 'Confirmed');

create unique index if not exists sales_deals_one_active_per_test_drive
  on public.sales_deals (source_test_drive_id)
  where source_test_drive_id is not null
    and status in ('Draft', 'Negotiation', 'Reserved', 'Confirmed');

-- ---------------------------------------------------------------------------
-- 3. Lead synchronisation settings (Feature 4)
--
-- Both default to off. Out of the box, no deal event changes a lead's stage.
-- ---------------------------------------------------------------------------

alter table public.sales_settings
  add column if not exists lead_auto_won_on_complete boolean not null default false;

alter table public.sales_settings
  add column if not exists lead_stage_on_negotiation uuid
    references public.lead_stages (id) on delete set null;

comment on column public.sales_settings.lead_auto_won_on_complete is
  'When true, completing a deal marks its open lead as Won. Never overrides a manually closed lead.';

comment on column public.sales_settings.lead_stage_on_negotiation is
  'When set, a deal reaching Negotiation advances its open lead to this stage, forwards only.';

-- ---------------------------------------------------------------------------
-- 4. Link an existing deal to a lead (Feature 2)
--
-- security definer because it writes lead_activities, which a sales user may
-- not be allowed to insert directly. The permission the app uses is checked
-- explicitly first, and the function only ever touches the two rows named.
-- ---------------------------------------------------------------------------

create or replace function public.link_deal_to_lead(p_deal_id uuid, p_lead_id uuid)
returns table (out_deal_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal  public.sales_deals;
  v_lead  public.leads;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'You must be signed in to do this.' using errcode = '42501';
  end if;

  if not public.has_permission(v_actor, 'sales.edit') then
    raise exception 'You do not have permission to change deals.' using errcode = '42501';
  end if;

  select * into v_deal from public.sales_deals where id = p_deal_id for update;
  if not found then
    raise exception 'That deal could not be found.';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead could not be found.';
  end if;

  if v_lead.archived_at is not null then
    raise exception 'That lead is archived and cannot be changed.';
  end if;

  -- Cross-customer links are the error this guard exists for.
  if v_deal.customer_id <> v_lead.customer_id then
    raise exception 'That deal belongs to a different customer.';
  end if;

  if v_deal.lead_id = p_lead_id then
    raise exception 'That deal is already linked to this lead.';
  end if;

  -- Never silently move a deal off another lead: that would rewrite its history.
  if v_deal.lead_id is not null then
    raise exception 'That deal is already linked to another lead. Unlink it there first.';
  end if;

  update public.sales_deals set lead_id = p_lead_id where id = p_deal_id;

  insert into public.lead_activities
    (lead_id, activity_type, description, new_value, changed_by)
  values
    (p_lead_id, 'deal_linked',
     'Deal ' || v_deal.deal_number || ' linked to this lead',
     p_deal_id::text, v_actor);

  return query select v_deal.deal_number::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Detach a deal from a lead
-- ---------------------------------------------------------------------------

create or replace function public.unlink_deal_from_lead(p_deal_id uuid, p_lead_id uuid)
returns table (out_deal_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal  public.sales_deals;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'You must be signed in to do this.' using errcode = '42501';
  end if;

  if not public.has_permission(v_actor, 'sales.edit') then
    raise exception 'You do not have permission to change deals.' using errcode = '42501';
  end if;

  select * into v_deal from public.sales_deals where id = p_deal_id for update;
  if not found then
    raise exception 'That deal could not be found.';
  end if;

  if v_deal.lead_id is distinct from p_lead_id then
    raise exception 'That deal is not linked to this lead.';
  end if;

  update public.sales_deals set lead_id = null where id = p_deal_id;

  insert into public.lead_activities
    (lead_id, activity_type, description, old_value, changed_by)
  values
    (p_lead_id, 'deal_unlinked',
     'Deal ' || v_deal.deal_number || ' unlinked from this lead',
     p_deal_id::text, v_actor);

  return query select v_deal.deal_number::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lead status synchronisation (Feature 4)
--
-- An AFTER UPDATE trigger rather than an edit to transition_sales_deal, so
-- it runs in the same transaction, catches every path that changes a deal,
-- and leaves the existing functions untouched.
--
-- Guards that always apply:
--   * only the lead named by sales_deals.lead_id is ever touched
--   * an archived lead is never changed
--   * a lead already won or lost is never re-staged by automation
--   * a cancelled deal never loses a lead
--   * every status change writes a lead_activities row
-- ---------------------------------------------------------------------------

create or replace function public.sync_lead_from_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead       public.leads;
  v_stage_type text;
  v_settings   public.sales_settings;
  v_won_stage  uuid;
  v_target     public.lead_stages;
  v_current    public.lead_stages;
  v_actor      uuid := auth.uid();
begin
  -- Only a real status change is of interest.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.lead_id is null then
    return new;
  end if;

  select * into v_lead from public.leads where id = new.lead_id;
  if not found or v_lead.archived_at is not null then
    return new;
  end if;

  select stage_type into v_stage_type
  from public.lead_stages
  where id = v_lead.stage_id;

  -- The audit entry is written whether or not the stage changes.
  insert into public.lead_activities
    (lead_id, activity_type, description, old_value, new_value, changed_by)
  values
    (new.lead_id, 'deal_status_changed',
     'Deal ' || new.deal_number || ' moved from ' || coalesce(old.status, 'new')
       || ' to ' || new.status,
     old.status, new.status, v_actor);

  -- Automation never re-stages a lead a person has already closed.
  if v_stage_type is distinct from 'open' then
    return new;
  end if;

  select * into v_settings from public.sales_settings limit 1;

  -- Deal completed -> mark the lead Won, if that rule is switched on.
  if new.status = 'Completed' and coalesce(v_settings.lead_auto_won_on_complete, false) then
    select id into v_won_stage
    from public.lead_stages
    where stage_type = 'won' and is_active
    order by sort_order
    limit 1;

    if v_won_stage is not null then
      update public.leads
         set stage_id  = v_won_stage,
             won_at    = now(),
             won_by    = v_actor,
             won_notes = coalesce(won_notes, 'Deal ' || new.deal_number || ' completed')
       where id = new.lead_id;

      insert into public.lead_activities
        (lead_id, activity_type, description, new_value, changed_by)
      values
        (new.lead_id, 'won',
         'Lead marked as Won because deal ' || new.deal_number || ' completed',
         new.deal_number, v_actor);
    end if;

    return new;
  end if;

  -- Deal reached Negotiation -> advance the lead, forwards only, if configured.
  if new.status = 'Negotiation' and v_settings.lead_stage_on_negotiation is not null then
    select * into v_target  from public.lead_stages where id = v_settings.lead_stage_on_negotiation;
    select * into v_current from public.lead_stages where id = v_lead.stage_id;

    if v_target.id is not null
       and v_target.stage_type = 'open'
       and v_current.id is not null
       and v_target.sort_order > v_current.sort_order then

      update public.leads set stage_id = v_target.id where id = new.lead_id;

      insert into public.lead_activities
        (lead_id, activity_type, description, old_value, new_value, changed_by)
      values
        (new.lead_id, 'stage_changed',
         'Stage moved to ' || v_target.name || ' because deal ' || new.deal_number
           || ' entered Negotiation',
         v_current.name, v_target.name, v_actor);
    end if;
  end if;

  -- Cancelled deals deliberately fall through: a lead is never auto-lost.
  return new;
end;
$$;

drop trigger if exists sales_deals_sync_lead on public.sales_deals;

create trigger sales_deals_sync_lead
after update of status on public.sales_deals
for each row
execute function public.sync_lead_from_deal();

commit;