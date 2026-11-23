-- ---------------------------------------------------------------------------
-- Sprint 9 — Phase 3
-- One new permission: reports.financial
-- ---------------------------------------------------------------------------
--
-- Sprint 9 adds reports across eleven domains. Each section is opened by the
-- read permission its own module already uses, so this sprint adds no
-- per-section keys.
--
-- It adds exactly one key, which gates every MONEY figure in every report:
--
--   reports.financial
--
-- WHY THIS ONE IS SEPARATE
--
-- A report aggregates. The Sales list shows a person the deals they are
-- allowed to open, one page at a time; a sales report tells them what the
-- business took last quarter. Those are different exposures, and row-level
-- security does not distinguish them — it decides which rows, not whether
-- the total of those rows should be on a card.
--
-- Keeping money behind its own key makes a genuinely useful middle state
-- possible: a showroom host can see that fourteen cars sold and eleven test
-- drives completed, without seeing what any of it was worth.
--
-- WHAT THIS SCRIPT DOES NOT DO
--
-- It does not grant the key to anybody except the role you name in section 3.
-- Money figures stay hidden until you say who may see them, which is the
-- right default for the one key in this sprint that exposes company revenue.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Where we are starting from
-- ---------------------------------------------------------------------------

do $$
declare
  v_exists   boolean;
  v_defined  boolean;
  v_grants   integer;
begin
  select to_regclass('public.app_permissions') is not null into v_exists;

  raise notice '--------------------------------------------------';
  raise notice 'app_permissions exists:        %', v_exists;

  if not v_exists then
    raise exception 'public.app_permissions is missing. Run sql/00-FIX-permissions-table.sql first.'
      using hint = 'Sprint 8''s migration creates and repairs this table.';
  end if;

  select exists (select 1 from public.app_permissions where key = 'reports.financial')
    into v_defined;

  select count(*) into v_grants
  from public.role_permission_grants
  where permission = 'reports.financial';

  raise notice 'reports.financial defined:     %', v_defined;
  raise notice 'roles already holding it:      %', v_grants;
  raise notice '--------------------------------------------------';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Define the key
-- ---------------------------------------------------------------------------
--
-- Same column shape as docs/sprint-7-migration.sql and
-- sql/00-FIX-permissions-table.sql. The sort_order puts it after the
-- Sprint 8 offers and loyalty keys.

insert into public.app_permissions (key, module, label, description, sort_order)
select
  'reports.financial',
  'Reports',
  'See money in reports',
  'View revenue, collections, outstanding balances and discount totals in reports. Without this, reports show counts and operational figures only.',
  10
where not exists (
  select 1 from public.app_permissions p where p.key = 'reports.financial'
);

-- ---------------------------------------------------------------------------
-- 3. Grant it
-- ---------------------------------------------------------------------------
--
-- >>> EDIT THE ROLE NAME BELOW if yours differs. <<<
--
-- Check what you have first:
--
--     select id, name from public.roles order by name;
--
-- Deliberately not auto-granted to everybody holding sales.view, the way
-- Sprint 8 auto-granted its five everyday keys. This key shows what the
-- business earned; it should be a decision, not a side effect.

insert into public.role_permission_grants (role_id, permission)
select r.id, 'reports.financial'
from public.roles r
where r.name in ('Super Admin', 'Admin', 'Manager')   -- <<< edit this list
  and not exists (
    select 1
    from public.role_permission_grants g
    where g.role_id = r.id
      and g.permission = 'reports.financial'
  );

-- ---------------------------------------------------------------------------
-- 4. Confirm
-- ---------------------------------------------------------------------------

do $$
declare
  v_defined integer;
  v_grants  integer;
begin
  select count(*) into v_defined
  from public.app_permissions where key = 'reports.financial';

  select count(*) into v_grants
  from public.role_permission_grants where permission = 'reports.financial';

  raise notice '--------------------------------------------------';
  raise notice 'reports.financial defined:     % (expected 1)', v_defined;
  raise notice 'roles granted it:              %', v_grants;

  if v_grants = 0 then
    raise notice '';
    raise notice '>>> NOBODY can see money in reports yet.';
    raise notice '>>> Section 3 matched no role. Check your role names:';
    raise notice '>>>   select id, name from public.roles order by name;';
  end if;
  raise notice '--------------------------------------------------';
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Check it
-- ---------------------------------------------------------------------------

-- Which roles may see money in reports.
select r.name as role, 'reports.financial' as permission
from public.role_permission_grants g
join public.roles r on r.id = g.role_id
where g.permission = 'reports.financial'
order by r.name;

-- And confirm it reaches you. 'reports.financial' should be in this list.
select unnest(public.get_my_permissions()) as permission order by 1;
