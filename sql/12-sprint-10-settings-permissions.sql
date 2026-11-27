-- ---------------------------------------------------------------------------
-- Sprint 10 — Phase 3
-- Five settings permission keys, one per category
-- ---------------------------------------------------------------------------
--
-- WHY FIVE, AND NOT TWENTY-FOUR
--
-- The settings registry has twenty-three pages. A key per page would be a
-- permissions matrix nobody maintains: by the third sprint half of them are
-- granted to everyone because it was easier than working out which mattered.
--
-- So the keys follow the five categories:
--
--   settings.organization    company profile, branding, showrooms
--   settings.operations      the eight operations pages
--   settings.marketing       offers, loyalty, segments
--   settings.communications  notification rules, reminders, integrations
--   settings.system          security, health, configuration history
--
-- READ AND EDIT ARE DIFFERENT QUESTIONS
--
-- These five are EDIT keys. Reading a settings page uses the module's own
-- existing read key — sales.view, loyalty.view, enquiries.view — because
-- somebody who can work in a module usually needs to see the rules that
-- govern it. A sales manager should be able to read the discount approval
-- threshold without being able to move it.
--
-- Three modules have no read key: inventory, customers and leads authorise
-- through hardcoded role-name arrays rather than permission keys. Their
-- settings pages therefore read on the category key below, which is
-- stricter rather than looser. Unifying the two systems is Sprint 11's job.
--
-- OPENING A PAGE AND CHANGING IT
--
-- Opening a settings page takes EITHER its category key below OR the module's
-- own key. Changing what is on it takes the module's own key, which the
-- database enforces through RLS exactly as it did before Sprint 10.
--
--   open the sales settings page     settings.operations OR sales.settings
--   move the discount threshold      sales.settings
--
-- The OR matters on the day this deploys. A sales manager holding
-- sales.settings and not the brand-new settings.operations would otherwise
-- open the app to find settings they changed yesterday now invisible, with
-- the UI unable to explain why. Sprint 10 reorganises where settings live; it
-- must not be the sprint that silently took access away, any more than the
-- sprint that silently widened it.
--
-- So the category keys add a way to grant settings access to someone who has
-- no module permissions — an office manager who maintains showrooms, say.
-- They take nothing away from anybody. Nobody gains the ability to change a
-- financial safeguard unless you grant it in section 3.
--
-- Showrooms are the exception, because `locations` has never had a module key:
-- both opening and changing use settings.organization. sql/13 adds a matching
-- database policy so that is enforced below the screen too.
--
-- RUNNING THIS AGAINST YOUR LIVE DATABASE
--
-- Safe. Every insert is guarded by `where not exists`, and nothing is granted
-- unless you edit and uncomment section 3. Running it twice changes nothing
-- the second time.
--
-- Requires sql/11 from Sprint 9 (which creates the permission tables).
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_permissions'
  ) then
    raise exception
      'public.app_permissions does not exist. Run sql/11-sprint-9-backfill-permission-keys.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The keys
-- ---------------------------------------------------------------------------

insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Settings', v.label, v.description, v.sort_order
from (values
  ('settings.organization', 'Edit organization settings',
   'Change the company profile, branding and showroom records. These appear on quotations, invoices and receipts.', 10),
  ('settings.operations', 'Edit operations settings',
   'Change how the inventory, CRM, booking, sales, payment and report modules behave. High-risk values still need the module''s own permission as well.', 20),
  ('settings.marketing', 'Edit marketing settings',
   'Change promotion policy and the loyalty programme. Loyalty values also need the loyalty settings permission.', 30),
  ('settings.communications', 'Edit communication settings',
   'Change company-wide notification rules, scheduled reminders and provider connections. Personal notification preferences need no permission.', 40),
  ('settings.system', 'Edit system settings',
   'View security policy, system health and the configuration change history. Staff and role management is separate.', 50)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- ---------------------------------------------------------------------------
-- 2. What happened
-- ---------------------------------------------------------------------------

do $$
declare
  v_expected text[] := array[
    'settings.organization', 'settings.operations', 'settings.marketing',
    'settings.communications', 'settings.system'
  ];
  v_missing text[];
  v_granted integer;
begin
  select array_agg(k order by k) into v_missing
  from unnest(v_expected) as k
  where not exists (select 1 from public.app_permissions p where p.key = k);

  if v_missing is not null then
    raise exception 'Not every settings key was defined. Missing: %', v_missing;
  end if;

  select count(*) into v_granted
  from public.role_permission_grants
  where permission = any(v_expected);

  raise notice '----------------------------------------------------------';
  raise notice 'All 5 settings keys are defined.';
  raise notice 'Roles currently granted one of them: %', v_granted;

  if v_granted = 0 then
    raise notice '';
    raise notice 'Nobody can edit settings centrally yet. That is deliberate —';
    raise notice 'section 3 is commented out. Until you run it, the Settings';
    raise notice 'pages open read-only for whoever can already read the module,';
    raise notice 'and the existing /admin/sales/settings permissions are';
    raise notice 'unchanged, so nothing that worked yesterday has stopped.';
  end if;

  raise notice '----------------------------------------------------------';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Grants — EDIT BEFORE USING, then uncomment
-- ---------------------------------------------------------------------------
--
-- Check your role names first:
--
--   select id, name from public.roles order by name;
--
-- The suggestion below mirrors who can change these things today:
-- sales.settings is currently what gates the Sales settings page, and
-- loyalty.settings the loyalty one. So whoever holds those is the natural
-- holder of the matching category key.
--
-- Worth a moment's thought on settings.operations in particular: it covers
-- the discount approval threshold and the separate-verifier rule. Those are
-- financial controls, and the category key plus sales.settings is what stands
-- in front of them.

/*
-- Everything, for the role that administers the system.
insert into public.role_permission_grants (role_id, permission)
select r.id, p.key
from public.roles r
cross join public.app_permissions p
where r.name = 'Super Admin'
  and p.module = 'Settings'
  and not exists (
    select 1 from public.role_permission_grants g
    where g.role_id = r.id and g.permission = p.key
  );

-- A manager: the business configuration, not the system internals.
insert into public.role_permission_grants (role_id, permission)
select r.id, k
from public.roles r
cross join unnest(array[
  'settings.organization',
  'settings.operations',
  'settings.marketing'
]) as k
where r.name = 'Sales Manager'
  and not exists (
    select 1 from public.role_permission_grants g
    where g.role_id = r.id and g.permission = k
  );
*/

commit;

-- ---------------------------------------------------------------------------
-- Afterwards
-- ---------------------------------------------------------------------------
--
-- Who can edit which category:
--
--   select r.name, p.key, p.label
--   from public.roles r
--   join public.role_permission_grants g on g.role_id = r.id
--   join public.app_permissions p on p.key = g.permission
--   where p.module = 'Settings'
--   order by r.name, p.sort_order;
--
-- And the pairing worth checking by eye — anybody holding a category key
-- WITHOUT the module key it guards will find the page opens but the
-- high-risk controls stay disabled. That is working as intended, but it is
-- confusing if it was not what you meant:
--
--   select r.name,
--          bool_or(g.permission = 'settings.operations') as can_open_operations,
--          bool_or(g.permission = 'sales.settings')      as can_change_sales_values
--   from public.roles r
--   join public.role_permission_grants g on g.role_id = r.id
--   group by r.name
--   having bool_or(g.permission = 'settings.operations')
--      and not bool_or(g.permission = 'sales.settings');
-- ---------------------------------------------------------------------------
