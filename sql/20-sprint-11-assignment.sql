-- ---------------------------------------------------------------------------
-- Sprint 11 — Phase 11
-- Reservation assignment history, and who may be assigned work
-- ---------------------------------------------------------------------------
--
-- A CORRECTION TO MY OWN PHASE 1 AUDIT
--
-- That audit said sales and reservations both lacked assignment history. That
-- was wrong about sales: public.sales_deal_assignments exists and has been
-- recording owner changes all along. I missed it because I grepped for tables
-- named *_assignment_history and that one is not named that way.
--
-- So the real picture, module by module:
--
--   customers     customer_staff_assignment_history      exists
--   enquiries     enquiry_staff_assignment_history        exists, trigger-written
--   leads         lead_staff_assignment_history           exists
--   test drives   test_drive_staff_assignment_history     exists
--   sales         sales_deal_assignments                  exists
--   reservations  — nothing —                             THIS FILE
--
-- vehicle_reservations.owner_id exists and the list page filters on it, so a
-- reservation can be owned and handed over with no record of either.
--
-- WHY A TRIGGER AND NOT AN ACTION
--
-- Because the thing that changes owner_id today is not visible from this
-- repository. Sales reassignment goes through reassign_sales_deal(), a
-- live-database-only function, and reservations may well have something
-- similar. A trigger records the change whatever path it arrives through — an
-- action, an RPC I cannot read, a bulk update, somebody in the SQL editor at
-- midnight. An action-side insert only records the changes made through that
-- action, and silently misses the rest.
--
-- That is also how the enquiry history works (enquiries_log_history in
-- sql/01), so this follows the pattern the project already set.
--
-- RUN ORDER: after sql/19. Safe to re-run.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Reservation assignment history
-- ---------------------------------------------------------------------------
--
-- Column names mirror enquiry_staff_assignment_history exactly, so the
-- existing query and timeline code can be pointed at it without translation.

create table if not exists public.reservation_staff_assignment_history (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null,
  previous_staff_id uuid references public.profiles (id) on delete set null,
  new_staff_id      uuid references public.profiles (id) on delete set null,
  assigned_by       uuid references public.profiles (id) on delete set null,
  reason            text,
  assigned_at       timestamptz not null default now()
);

create index if not exists reservation_staff_assignment_history_idx
  on public.reservation_staff_assignment_history (reservation_id, assigned_at desc);

comment on table public.reservation_staff_assignment_history is
  'Every change of vehicle_reservations.owner_id, written by trigger so that '
  'changes made outside the application are recorded too.';

-- reservation_id is a plain uuid rather than a foreign key on purpose: the
-- table it points at is not created by any migration in this repo, so a
-- references clause here would fail on a database where it is named
-- differently. §3 adds the constraint once you have confirmed the table name.

-- ---------------------------------------------------------------------------
-- 2. The trigger
-- ---------------------------------------------------------------------------

create or replace function public.log_reservation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  insert into public.reservation_staff_assignment_history
    (reservation_id, previous_staff_id, new_staff_id, assigned_by)
  values (old.id, old.owner_id, new.owner_id, auth.uid());

  return new;
end
$$;

-- Attached only if the table and the column are actually there, so this file
-- applies cleanly on a database where reservations are named differently or
-- not present yet. §5 tells you whether it attached.
do $attach$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicle_reservations' and column_name = 'owner_id'
  ) then
    execute 'drop trigger if exists vehicle_reservations_log_assignment on public.vehicle_reservations';
    execute '
      create trigger vehicle_reservations_log_assignment
        after update of owner_id on public.vehicle_reservations
        for each row execute function public.log_reservation_assignment()';
  else
    raise notice
      'public.vehicle_reservations.owner_id was not found — the assignment trigger was NOT attached. See section 5.';
  end if;
end
$attach$;

-- ---------------------------------------------------------------------------
-- 3. Who may be assigned work
-- ---------------------------------------------------------------------------
--
-- Today any role can appear in an assignment picker, so a Finance user shows
-- up in the list of people to hand a sales deal to. This narrows each picker
-- to staff who hold the permission for that module's work.
--
-- TWO THINGS IT DELIBERATELY DOES NOT DO
--
-- It does not change any EXISTING assignment. Somebody who no longer qualifies
-- stays assigned to the work they already have — taking it away as a side
-- effect of tightening a dropdown would silently orphan live deals.
--
-- It does not replace list_deal_owner_candidates() or list_test_drive_hosts(),
-- which already exist in your database and which I cannot read. Those two keep
-- deciding for sales and test drives. This is for reservations, which has no
-- such function, and is available to the others if you later want them
-- consistent.

create or replace function public.list_assignable_staff(p_permission text)
returns table (id uuid, full_name text, department text, staff_code text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), p.staff_code, 'Unnamed account') as full_name,
         p.department,
         p.staff_code
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.status = 'active'
    and r.is_active
    and (
      -- holds the key through their role
      exists (
        select 1 from public.role_permission_grants g
        where g.role_id = p.role_id and g.permission = p_permission
      )
      -- or holds the protected role, which can always be given work
      or coalesce(r.protected, false)
    )
  order by full_name;
$$;

comment on function public.list_assignable_staff(text) is
  'Active staff who hold a permission, for an assignment picker. Does not '
  'include anybody already assigned who no longer qualifies — the caller adds '
  'the current assignee so existing work is never orphaned.';

revoke all on function public.list_assignable_staff(text) from public;
grant execute on function public.list_assignable_staff(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------

alter table public.reservation_staff_assignment_history enable row level security;

drop policy if exists reservation_staff_assignment_history_read
  on public.reservation_staff_assignment_history;

create policy reservation_staff_assignment_history_read
  on public.reservation_staff_assignment_history
  for select to authenticated
  using (public.is_active_staff(auth.uid()));

-- Writes come from the trigger, which is security definer. There is no insert
-- policy, so a client with a valid session cannot forge an assignment record.
grant select on public.reservation_staff_assignment_history to authenticated;
revoke insert, update, delete on public.reservation_staff_assignment_history from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- 5. Verification
-- ---------------------------------------------------------------------------
--
-- 5a. Did the trigger attach? This is the one that matters — if it did not,
-- reservations still have no assignment history and this file did nothing.
--
--   select tgname, tgenabled
--   from pg_trigger
--   where tgrelid = 'public.vehicle_reservations'::regclass and not tgisinternal;
--
-- Expected: vehicle_reservations_log_assignment with tgenabled = 'O'. If it is
-- absent, the notice in §2 fired — send me the output of:
--
--   select table_name, column_name from information_schema.columns
--   where table_schema='public' and column_name in ('owner_id','assigned_to','assigned_staff_id')
--   order by table_name;
--
-- 5b. Add the foreign key, once you have confirmed the table name.
--
--   alter table public.reservation_staff_assignment_history
--     add constraint reservation_staff_assignment_history_reservation_id_fkey
--     foreign key (reservation_id) references public.vehicle_reservations (id) on delete cascade;
--
-- Left for you rather than guessed, because a wrong table name here fails the
-- whole migration and the table is not in this repository.
--
-- 5c. Does the assignable-staff list return anybody?
--
--   select * from public.list_assignable_staff('sales.assign');
--   select * from public.list_assignable_staff('test_drives.assign');
--
-- If a call returns nothing, no active role holds that key — which is worth
-- knowing on its own, because it means that picker would be empty.
-- ---------------------------------------------------------------------------
