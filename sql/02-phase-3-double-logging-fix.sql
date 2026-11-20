begin;

-- ---------------------------------------------------------------------------
-- Stop the double-logging introduced when Phase 1 added the history tables
--
-- Sprint 6's activity trigger recorded status and assignment changes in
-- enquiry_activity. Phase 1 gave both their own tables, written by
-- log_enquiry_status_change, and left the old branches in place — so every
-- change has been recorded twice, and a timeline reading both would show it
-- twice.
--
-- The old rows are moved into the history tables rather than deleted, so
-- nothing recorded before Phase 1 is lost.
-- ---------------------------------------------------------------------------

-- 1. Carry the old status rows across. from_status is dropped when it names a
--    status that no longer exists ("Closed"), because the column has a
--    foreign key and a half-migrated value would fail the insert.

insert into public.enquiry_status_history (enquiry_id, from_status, to_status, changed_by, changed_at)
select
  a.enquiry_id,
  (select s.key from public.enquiry_statuses s where s.key = a.old_value),
  a.new_value,
  a.changed_by,
  a.changed_at
from public.enquiry_activity a
where a.activity_type = 'status'
  and a.new_value is not null
  and exists (select 1 from public.enquiry_statuses s where s.key = a.new_value)
  and not exists (
    select 1 from public.enquiry_status_history h
    where h.enquiry_id = a.enquiry_id and h.changed_at = a.changed_at
  );

-- 2. And the old assignment rows.

insert into public.enquiry_staff_assignment_history
  (enquiry_id, previous_staff_id, new_staff_id, assigned_by, assigned_at)
select
  a.enquiry_id,
  nullif(a.old_value, '')::uuid,
  nullif(a.new_value, '')::uuid,
  a.changed_by,
  a.changed_at
from public.enquiry_activity a
where a.activity_type = 'assignment'
  and not exists (
    select 1 from public.enquiry_staff_assignment_history h
    where h.enquiry_id = a.enquiry_id and h.assigned_at = a.changed_at
  );

-- 3. Now the duplicates can go.

delete from public.enquiry_activity where activity_type in ('status', 'assignment');

-- 4. And the trigger stops writing them.

create or replace function public.log_enquiry_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enquiry_activity (enquiry_id, activity_type, description, changed_by)
    values (
      new.id,
      'created',
      case when new.created_by is null
        then 'Enquiry received from ' || new.source
        else 'Enquiry entered by hand'
      end,
      new.created_by
    );

    return new;
  end if;

  /*
   * Status and assignment changes are recorded by log_enquiry_status_change,
   * in tables of their own. Writing them here as well is what made every
   * change appear twice.
   */
  if new.lead_id is distinct from old.lead_id and new.lead_id is not null then
    insert into public.enquiry_activity
      (enquiry_id, activity_type, description, new_value, changed_by)
    values (new.id, 'converted', 'Converted to a lead', new.lead_id::text, auth.uid());
  end if;

  return new;
end;
$$;

commit;
