-- ---------------------------------------------------------------------------
-- Sprint 7 — Phase 19
-- Let enquiry_activity record the three events the application writes
-- ---------------------------------------------------------------------------
--
-- Phase 19 adds audit rows that no trigger can write, because the
-- interesting part is not visible in the row that changed:
--
--   valuation   whether a figure was a first opinion or a revision
--   edited      priority, a linked customer, a linked record
--   archived    taken off the lists, or put back
--
-- enquiry_activity came with Sprint 6. If its activity_type column carries a
-- CHECK constraint listing the values it accepts, those three inserts would
-- be rejected at runtime — and the enquiry itself would still save, so the
-- only symptom would be a history quietly missing entries.
--
-- This script makes room for them without being able to lose anything:
--
--   * It does nothing at all if there is no such constraint.
--   * If there is one, the replacement allows every value already present in
--     the table, plus every value this sprint's code writes. A value in use
--     cannot be dropped, because the list is built from the table's own
--     contents.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

begin;

do $$
declare
  constraint_name text;
  allowed text[];
  value_list text;
begin
  -- Any CHECK on this table that mentions activity_type.
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'enquiry_activity'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%activity_type%'
  limit 1;

  if constraint_name is null then
    raise notice 'No check constraint on enquiry_activity.activity_type — nothing to change.';
    return;
  end if;

  -- Everything already recorded, so nothing in use can be excluded.
  select coalesce(array_agg(distinct activity_type), '{}')
    into allowed
  from public.enquiry_activity
  where activity_type is not null;

  -- Plus everything this sprint's triggers and actions write.
  allowed := allowed || array[
    'created',
    'converted',
    'valuation',
    'edited',
    'archived'
  ];

  -- De-duplicate and quote for the new constraint body.
  select string_agg(distinct quote_literal(value), ', ' order by quote_literal(value))
    into value_list
  from unnest(allowed) as value;

  execute format(
    'alter table public.enquiry_activity drop constraint %I',
    constraint_name
  );

  execute format(
    'alter table public.enquiry_activity add constraint %I check (activity_type in (%s))',
    constraint_name,
    value_list
  );

  raise notice 'Rebuilt % to allow: %', constraint_name, value_list;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Check it
-- ---------------------------------------------------------------------------

-- What activity_type will now accept. No rows means no constraint, which is
-- also fine: the column takes any text.
select pg_get_constraintdef(con.oid) as activity_type_rule
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'enquiry_activity'
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%activity_type%';
