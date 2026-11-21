-- ===========================================================================
-- Sprint 8 — FIX: the permissions table name was wrong
-- ===========================================================================
--
-- WHAT WENT WRONG
--
-- 01-phase-2-promotions.sql inserted the eight new permission keys into
-- `public.permissions`. That table does not exist in this database — the
-- real one is `public.app_permissions`, with columns
-- (key, module, label, description, sort_order), as sprint-7-migration.sql
-- uses.
--
-- I wrote that insert from memory instead of checking the existing
-- migrations, which is the same mistake that produced the wrong permission
-- names in Batch 2's README. It should have been caught by reading
-- docs/sprint-7-migration.sql, which was in the repo the whole time.
--
-- WHAT IT MEANS
--
-- 01 is wrapped in begin/commit, so when that insert failed the WHOLE
-- migration rolled back. If it failed for you, none of the Sprint 8 tables
-- exist, and every batch of code since has been sitting on nothing — which
-- is exactly what "you don't have permission to view" is telling you: the
-- permission keys were never created, so get_my_permissions() cannot return
-- them.
--
-- The failure was total and clean. Nothing was half-applied.
--
-- WHAT TO DO
--
--   1. Run THIS script first. It reports what state you are in and creates
--      the permissions and grants correctly.
--   2. Then run 01, 02, 04, 05, 06, 07 in order. 01 has been corrected, so
--      it will now commit.
--   3. Sign out and back in — permissions are read at session start.
--
-- This script is safe to run whether or not 01 ever succeeded, and safe to
-- run more than once.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tell me what state this database is in
-- ---------------------------------------------------------------------------

do $$
declare
  has_app_perms  boolean;
  has_old_perms  boolean;
  has_promotions boolean;
  has_sprint8    boolean;
  sales_edit_roles int;
begin
  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='app_permissions')
    into has_app_perms;

  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='permissions')
    into has_old_perms;

  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='promotions')
    into has_promotions;

  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='promotion_targets')
    into has_sprint8;

  select count(distinct role_id) into sales_edit_roles
  from public.role_permission_grants where permission = 'sales.edit';

  raise notice '--- state ---';
  raise notice 'app_permissions exists:      %', has_app_perms;
  raise notice 'a stray `permissions` table: %', has_old_perms;
  raise notice 'promotions table exists:     %', has_promotions;
  raise notice 'Sprint 8 tables applied:     %', has_sprint8;
  raise notice 'roles holding sales.edit:    %', sales_edit_roles;

  if not has_app_perms then
    raise exception 'public.app_permissions does not exist. Stop and tell me — this database is not shaped the way the repo''s migrations expect.';
  end if;

  if not has_sprint8 then
    raise notice '';
    raise notice '>>> Sprint 8 tables are NOT applied. 01 rolled back, as expected.';
    raise notice '>>> Run this script, then 01, 02, 04, 05, 06, 07 in order.';
  else
    raise notice '';
    raise notice '>>> Sprint 8 tables ARE applied, so 01 did commit. This script only';
    raise notice '>>> adds the missing permission keys and grants.';
  end if;

  if sales_edit_roles = 0 then
    raise notice '';
    raise notice '>>> WARNING: no role holds sales.edit, so the automatic grant below';
    raise notice '>>> will grant nothing. Use section 4 to grant by role name instead.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The permission keys, in the right table
-- ---------------------------------------------------------------------------
--
-- Same shape as sprint-7-migration.sql uses: module, label, description and
-- a sort order, so they appear grouped and in a sensible order wherever
-- permissions are listed for a role.

insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Offers & Loyalty', v.label, v.description, v.sort_order
from (values
  ('offers.view',      'View offers',
   'See promotions, personalised offers and redemption history.', 10),
  ('offers.manage',    'Manage offers',
   'Create and edit promotions, their targeting and their codes.', 20),
  ('offers.publish',   'Publish offers',
   'Activate, pause, expire and archive promotions. Changes what customers are charged.', 30),
  ('offers.assign',    'Assign private offers',
   'Give a specific customer an exclusive offer.', 40),
  ('offers.export',    'Export offers',
   'Download promotion and redemption data.', 50),
  ('loyalty.view',     'View loyalty',
   'See customer point balances and ledger history.', 60),
  ('loyalty.adjust',   'Adjust loyalty points',
   'Manually credit, deduct or reverse points. Changes what customers hold.', 70),
  ('loyalty.settings', 'Loyalty settings',
   'Change the earn rate and what points are worth.', 80)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- ---------------------------------------------------------------------------
-- 3. Grant the viewing keys to whoever can already work on sales
-- ---------------------------------------------------------------------------
--
-- The same reasoning and the same shape as Sprint 7's grant: nobody should
-- lose access the moment a migration lands, and the keys that change money
-- are granted deliberately rather than inherited.
--
-- publish, loyalty.adjust and loyalty.settings are NOT granted here. See
-- section 4.

insert into public.role_permission_grants (role_id, permission)
select g.role_id, v.key
from public.role_permission_grants g
cross join (values
  ('offers.view'), ('offers.manage'), ('offers.assign'),
  ('offers.export'), ('loyalty.view')
) as v (key)
where g.permission = 'sales.edit'
  and not exists (
    select 1 from public.role_permission_grants x
    where x.role_id = g.role_id and x.permission = v.key
  );

-- ---------------------------------------------------------------------------
-- 4. Grant everything to one named role
-- ---------------------------------------------------------------------------
--
-- Section 3 grants nothing if no role holds sales.edit. This covers that,
-- and it is also how you give yourself the three deliberate keys.
--
-- EDIT THE ROLE NAME on the `where` line if yours is not 'Super Admin'.
-- Run `select id, name from public.roles order by name;` to see them.

insert into public.role_permission_grants (role_id, permission)
select r.id, v.key
from public.roles r
cross join (values
  ('offers.view'), ('offers.manage'), ('offers.publish'),
  ('offers.assign'), ('offers.export'),
  ('loyalty.view'), ('loyalty.adjust'), ('loyalty.settings')
) as v (key)
where r.name = 'Super Admin'          -- <<< change this if your role differs
  and not exists (
    select 1 from public.role_permission_grants x
    where x.role_id = r.id and x.permission = v.key
  );

-- ---------------------------------------------------------------------------
-- 5. Confirm
-- ---------------------------------------------------------------------------

do $$
declare
  keys_created int;
  grants_made  int;
begin
  select count(*) into keys_created
  from public.app_permissions
  where key like 'offers.%' or key like 'loyalty.%';

  select count(*) into grants_made
  from public.role_permission_grants
  where permission like 'offers.%' or permission like 'loyalty.%';

  raise notice '--- result ---';
  raise notice 'permission keys now defined: % (expected 8)', keys_created;
  raise notice 'grants now in place:         %', grants_made;

  if keys_created < 8 then
    raise exception 'Only % of the 8 keys exist. Stop and tell me.', keys_created;
  end if;

  if grants_made = 0 then
    raise exception 'The keys exist but nothing is granted. Edit the role name in section 4 and run this again.';
  end if;
end;
$$;

commit;

-- ===========================================================================
-- Check it yourself
-- ===========================================================================

-- What the eight keys are:
select key, module, label from public.app_permissions
where key like 'offers.%' or key like 'loyalty.%'
order by sort_order;

-- Who holds what:
select r.name as role, rp.permission
from public.role_permission_grants rp
join public.roles r on r.id = rp.role_id
where rp.permission like 'offers.%' or rp.permission like 'loyalty.%'
order by r.name, rp.permission;

-- What YOUR account holds — this is the one that decides whether the page
-- loads. Run it while signed in as yourself:
select unnest(public.get_my_permissions()) as my_permission
except
select key from public.app_permissions where key not like 'offers.%' and key not like 'loyalty.%';

-- ===========================================================================
-- If there is a stray `public.permissions` table
-- ===========================================================================
--
-- There will not be unless something else created it — my insert would have
-- failed rather than created one. If one does exist and is empty, it is not
-- mine to drop, so it is left alone. Check before removing anything:
--
--   select * from public.permissions;
--
-- ROLLBACK
--
--   delete from public.role_permission_grants
--   where permission like 'offers.%' or permission like 'loyalty.%';
--
--   delete from public.app_permissions
--   where key like 'offers.%' or key like 'loyalty.%';
-- ===========================================================================
