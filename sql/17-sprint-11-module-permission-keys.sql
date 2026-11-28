-- ---------------------------------------------------------------------------
-- Sprint 11 — Phase 10, brought forward
-- Permission keys for inventory, customers and leads
-- ---------------------------------------------------------------------------
--
-- WHY THIS RUNS BEFORE THE ROLE EDITOR IS BUILT
--
-- This database has two authorisation systems. Fifty permission keys across
-- nine modules are granted through role_permission_grants and read through
-- get_my_permissions(). Three modules — inventory, customers and leads — are
-- not among them: they authorise by comparing roles.name against a hardcoded
-- array in TypeScript, in six arrays across eight files.
--
-- Phase 8 of this sprint gives administrators a role editor, including the
-- ability to rename a role. The moment somebody renames "Inventory Manager"
-- to "Stock Manager", every one of those arrays stops matching and inventory
-- management silently becomes Super-Admin-and-Admin-only. Nothing throws;
-- the feature just quietly stops working for the person whose job it is.
--
-- So the keys have to exist before the rename button does. That is the whole
-- reason this file is numbered ahead of its phase.
--
-- THE RULE THIS FILE OBEYS: NOBODY'S ACCESS CHANGES TODAY
--
-- Every grant below is a transcription of the array it replaces. Not an
-- improvement on it, not a tightening of it — a transcription. If Sales
-- Executive can edit a customer this morning, Sales Executive holds
-- customers.manage this afternoon. Deciding whether that is the RIGHT answer
-- is Phase 9's job, done in the open with the matrix in front of you. Doing
-- it here, invisibly, inside a migration, is how people lose access on a
-- Tuesday and nobody can say why.
--
--   array                      file                             becomes
--   ------------------------------------------------------------------------
--   INVENTORY_MANAGER_ROLES    inventory-permissions.ts         inventory.manage
--   CUSTOMER_MANAGER_ROLES     customer-permissions.ts          customers.manage
--                                                           +  leads.manage
--   ELEVATED_CUSTOMER_ROLES    customer-permissions.ts          customers.delete
--   ELEVATED_LEAD_ROLES        lead-permissions.ts              leads.delete
--   ELEVATED_ROLES             lead-notes-queries.ts            leads.notes_manage
--   ELEVATED_ROLES             leads/[id]/notes-actions.ts      leads.notes_manage
--   ELEVATED_ROLES             customers/[id]/notes-actions.ts  customers.notes_manage
--
-- CUSTOMER_MANAGER_ROLES BECOMES TWO KEYS, NOT ONE
--
-- That array has nineteen call sites and they are not all about customers.
-- Every lead action — create, edit, tag, export, follow up, note — calls
-- assertCanManageCustomers() too. One array has been doing two jobs.
--
-- Splitting it into customers.manage and leads.manage with IDENTICAL grants
-- changes nothing today and makes the two separable later, which is what you
-- will want the first time somebody should work leads without being able to
-- open the customer record behind them.
--
-- THE VIEW KEYS ARE GRANTED TO EVERY ROLE, DELIBERATELY
--
-- Today these three modules have no read check at all: any profile with any
-- role can read inventory, customers and leads. So the view keys go to every
-- role, because that is what "no check" means in practice. They exist so
-- Phase 9's matrix is not missing three of its twelve modules, and so the
-- settings pages for these modules can stop borrowing a category key to
-- answer a question about reading.
--
-- RUN ORDER: after sql/16. Run this BEFORE deploying the Batch 2 code.
-- Safe to re-run. See §4 for what happens if you deploy in the other order.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. The keys
-- ---------------------------------------------------------------------------

insert into public.app_permissions (key, module, label, description, sort_order)
values
  ('inventory.view',          'Inventory', 'See inventory',
   'View cars, stock levels and vehicle history.', 10),
  ('inventory.manage',        'Inventory', 'Manage inventory',
   'Add, edit, price, archive and restore cars.', 20),

  ('customers.view',          'Customers', 'See customers',
   'View customer records, vehicles and history.', 10),
  ('customers.manage',        'Customers', 'Manage customers',
   'Create and edit customers, tags, vehicles and communication log.', 20),
  ('customers.notes_manage',  'Customers', 'Manage all customer notes',
   'Edit and delete notes written by other members of staff.', 30),
  ('customers.delete',        'Customers', 'Delete customers',
   'Permanently delete a customer record.', 40),

  ('leads.view',              'Leads',     'See leads',
   'View leads, sources and follow-up history.', 10),
  ('leads.manage',            'Leads',     'Manage leads',
   'Create and edit leads, tags, follow-ups and communication log.', 20),
  ('leads.notes_manage',      'Leads',     'Manage all lead notes',
   'Edit and delete notes written by other members of staff.', 30),
  ('leads.delete',            'Leads',     'Delete leads',
   'Permanently delete a lead record.', 40)
on conflict (key) do update
  set module      = excluded.module,
      label       = excluded.label,
      description = excluded.description,
      sort_order  = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 2. The grants — transcribed from the arrays, role by role
-- ---------------------------------------------------------------------------
--
-- Unlike sql/12, this grant block is NOT commented out. sql/12 left its
-- grants for you to decide because those were new powers over financial
-- settings that nobody held before. These grants are different: they are the
-- powers people already have. Leaving them commented out would not be
-- cautious, it would take inventory management away from the Inventory
-- Manager the moment the code deployed.

-- The grants are written as (role name, key) pairs and resolved through
-- roles.name. This is the last time role names appear in an authorisation
-- decision anywhere in this system: after this file runs, the application
-- asks about keys and this table answers.

with wanted (role_name, permission) as (
  values
    -- INVENTORY_MANAGER_ROLES = Super Admin, Admin, Manager, Inventory Manager
    ('Super Admin',       'inventory.manage'),
    ('Admin',             'inventory.manage'),
    ('Manager',           'inventory.manage'),
    ('Inventory Manager', 'inventory.manage'),

    -- CUSTOMER_MANAGER_ROLES = Super Admin, Admin, Manager, Sales Executive
    ('Super Admin',       'customers.manage'),
    ('Admin',             'customers.manage'),
    ('Manager',           'customers.manage'),
    ('Sales Executive',   'customers.manage'),

    -- the same array, its second job
    ('Super Admin',       'leads.manage'),
    ('Admin',             'leads.manage'),
    ('Manager',           'leads.manage'),
    ('Sales Executive',   'leads.manage'),

    -- ELEVATED_CUSTOMER_ROLES = Super Admin, Admin, Manager
    ('Super Admin',       'customers.delete'),
    ('Admin',             'customers.delete'),
    ('Manager',           'customers.delete'),

    -- ELEVATED_LEAD_ROLES = Super Admin, Admin, Manager
    ('Super Admin',       'leads.delete'),
    ('Admin',             'leads.delete'),
    ('Manager',           'leads.delete'),

    -- ELEVATED_ROLES, notes, all three sites = Super Admin, Admin, Manager
    ('Super Admin',       'customers.notes_manage'),
    ('Admin',             'customers.notes_manage'),
    ('Manager',           'customers.notes_manage'),
    ('Super Admin',       'leads.notes_manage'),
    ('Admin',             'leads.notes_manage'),
    ('Manager',           'leads.notes_manage')
)
insert into public.role_permission_grants (role_id, permission)
select r.id, w.permission
from wanted w
join public.roles r on r.name = w.role_name
on conflict (role_id, permission) do nothing;

-- The three view keys go to every role that exists, matching "no read check".
insert into public.role_permission_grants (role_id, permission)
select r.id, k.permission
from public.roles r
cross join (values ('inventory.view'), ('customers.view'), ('leads.view')) as k(permission)
on conflict (role_id, permission) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 3. Verification — run this and read it before deploying the code
-- ---------------------------------------------------------------------------
--
-- 3a. Does every role hold exactly what its array gave it?
--
-- This query prints the new grants beside the arrays they came from. Every
-- row should read 'match'. A 'MISSING' row means a role name in this file
-- does not exist in your roles table — likely renamed already — and the
-- people in that role are about to lose access.
--
--   with expected (role_name, permission) as (
--     values
--       ('Super Admin','inventory.manage'),('Admin','inventory.manage'),
--       ('Manager','inventory.manage'),('Inventory Manager','inventory.manage'),
--       ('Super Admin','customers.manage'),('Admin','customers.manage'),
--       ('Manager','customers.manage'),('Sales Executive','customers.manage'),
--       ('Super Admin','leads.manage'),('Admin','leads.manage'),
--       ('Manager','leads.manage'),('Sales Executive','leads.manage'),
--       ('Super Admin','customers.delete'),('Admin','customers.delete'),
--       ('Manager','customers.delete'),
--       ('Super Admin','leads.delete'),('Admin','leads.delete'),
--       ('Manager','leads.delete'),
--       ('Super Admin','customers.notes_manage'),('Admin','customers.notes_manage'),
--       ('Manager','customers.notes_manage'),
--       ('Super Admin','leads.notes_manage'),('Admin','leads.notes_manage'),
--       ('Manager','leads.notes_manage')
--   )
--   select e.role_name, e.permission,
--          case when g.role_id is null then 'MISSING' else 'match' end as state
--   from expected e
--   left join public.roles r on r.name = e.role_name
--   left join public.role_permission_grants g
--          on g.role_id = r.id and g.permission = e.permission
--   order by state, e.role_name, e.permission;
--
-- 3b. The whole picture, as Phase 9's matrix will show it.
--
--   select p.module, count(distinct p.key) as keys,
--          count(distinct g.role_id) as roles_with_any
--   from public.app_permissions p
--   left join public.role_permission_grants g on g.permission = p.key
--   group by p.module order by p.module;
--
-- Expected: twelve modules. Before this file there were nine, and inventory,
-- customers and leads were invisible to anything permission-shaped.
--
-- 3c. Did anybody gain a power they did not have?
--
--   select r.name, g.permission
--   from public.role_permission_grants g
--   join public.roles r on r.id = g.role_id
--   where g.permission in ('inventory.manage','customers.manage','leads.manage',
--                          'customers.delete','leads.delete',
--                          'customers.notes_manage','leads.notes_manage')
--   order by g.permission, r.name;
--
-- Read this against the array table in the header. Viewer, Finance and
-- Content Manager should appear nowhere in it. If one of them does, stop and
-- send me the output before deploying.
--
-- ---------------------------------------------------------------------------
-- 4. If the code is deployed before this file runs
-- ---------------------------------------------------------------------------
--
-- The Batch 2 helpers ask for a key first and fall back to the old role array
-- when the key is absent from app_permissions, so deploying in the wrong
-- order degrades to today's behaviour rather than locking everyone out of
-- three modules. The fallback writes one line to the server log each time it
-- fires, naming the missing key, so the situation is visible rather than
-- silent.
--
-- That fallback is a migration step with an expiry date, not a second
-- authorisation system. Once 3a reads 'match' on every row, it should come
-- out — that removal is part of Batch 5's enforcement sweep. Until then
-- checks/check-permission-keys.py fails the build if a NEW module is added
-- with a role-name array instead of a key, so the pattern cannot spread
-- while the transition is in progress.
-- ---------------------------------------------------------------------------
