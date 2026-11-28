-- ---------------------------------------------------------------------------
-- Sprint 11 — Phase 10
-- Preflight: is it safe to remove the role-name fallbacks?
-- ---------------------------------------------------------------------------
--
-- WHAT THIS IS FOR
--
-- Batch 2 moved inventory, customers and leads onto permission keys, and left
-- a fallback: if a key is absent from app_permissions, the helper drops back to
-- the old role-name array. That fallback exists so that deploying the code
-- before running sql/17 degrades to the previous behaviour instead of locking
-- every member of staff out of three modules.
--
-- Batch 5 removes it. Removing it is only safe if the keys are really there and
-- really granted — and I cannot see your database. So rather than ask you a
-- question and hope, this file answers it.
--
-- RUN THIS, READ THE ONE ROW IT RETURNS, AND ONLY THEN APPLY THE REMOVAL FILES
-- in fallback-removal/ from the Batch 5 zip.
--
-- It is READ-ONLY. It changes nothing, so it is safe to run at any time, on
-- production, as often as you like.
-- ---------------------------------------------------------------------------

with required (permission, expected_roles) as (
  values
    ('inventory.manage',       array['Super Admin', 'Admin', 'Manager', 'Inventory Manager']),
    ('customers.manage',       array['Super Admin', 'Admin', 'Manager', 'Sales Executive']),
    ('leads.manage',           array['Super Admin', 'Admin', 'Manager', 'Sales Executive']),
    ('customers.delete',       array['Super Admin', 'Admin', 'Manager']),
    ('leads.delete',           array['Super Admin', 'Admin', 'Manager']),
    ('customers.notes_manage', array['Super Admin', 'Admin', 'Manager']),
    ('leads.notes_manage',     array['Super Admin', 'Admin', 'Manager'])
),

key_exists as (
  select r.permission,
         r.expected_roles,
         exists (select 1 from public.app_permissions p where p.key = r.permission) as defined
  from required r
),

granted as (
  select k.permission,
         k.expected_roles,
         k.defined,
         coalesce(array_agg(ro.name order by ro.name) filter (where ro.name is not null), array[]::text[]) as actual_roles
  from key_exists k
  left join public.role_permission_grants g on g.permission = k.permission
  left join public.roles ro on ro.id = g.role_id
  group by k.permission, k.expected_roles, k.defined
),

assessed as (
  select permission,
         defined,
         expected_roles,
         actual_roles,
         -- Every role the array used to allow must hold the key. EXTRA holders
         -- are fine and are not a reason to stop: you may have granted more
         -- deliberately from the Phase 9 matrix since.
         (select count(*) from unnest(expected_roles) e where not (e = any (actual_roles))) as missing_count,
         (select string_agg(e, ', ') from unnest(expected_roles) e where not (e = any (actual_roles))) as missing_roles
  from granted
)

select
  case
    when count(*) filter (where not defined) > 0 then 'STOP'
    when count(*) filter (where missing_count > 0) > 0 then 'STOP'
    else 'SAFE TO REMOVE THE FALLBACKS'
  end                                                             as verdict,
  count(*)                                                        as keys_checked,
  count(*) filter (where not defined)                             as keys_missing_entirely,
  count(*) filter (where missing_count > 0)                       as keys_missing_a_role,
  coalesce(
    string_agg(
      permission || case
        when not defined then ' (NOT DEFINED — run sql/17)'
        when missing_count > 0 then ' (not granted to: ' || missing_roles || ')'
        else ''
      end,
      '; ' order by permission
    ) filter (where not defined or missing_count > 0),
    'nothing missing'
  )                                                               as problems
from assessed;

-- ---------------------------------------------------------------------------
-- HOW TO READ THE RESULT
-- ---------------------------------------------------------------------------
--
-- verdict = 'SAFE TO REMOVE THE FALLBACKS'
--     Every key exists and every role that the old arrays allowed holds it.
--     Apply the files in fallback-removal/ and deploy.
--
-- verdict = 'STOP'
--     The `problems` column says which key and which role. Either sql/17 has
--     not run, or a role has been renamed since — a rename is the likely one,
--     because sql/17 matched roles by name and Phase 8 now lets you change
--     them.
--
--     If a role was renamed, grant the key to the new name from the Phase 9
--     matrix and run this again. DO NOT remove the fallbacks while this says
--     STOP: the fallback is the only thing keeping that role working, and
--     removing it takes their access away the moment the code deploys.
--
-- A note on what this cannot tell you: it checks the grants, not whether
-- get_my_permissions() returns them. If that function filters by something
-- this query cannot see, a SAFE verdict could still be optimistic. The one
-- cheap way to be sure is to open /admin/users/roles after running sql/19 —
-- the matrix reads your own keys through that function, so if your role's
-- boxes are ticked there, the function is returning them.
-- ---------------------------------------------------------------------------
