-- ---------------------------------------------------------------------------
-- Sprint 11 — Phases 3 and 4
-- Permission keys for staff administration
-- ---------------------------------------------------------------------------
--
-- WHY THE GRANTS ARE COMMENTED OUT
--
-- sql/17's grants were a transcription: those powers already existed, held by
-- named roles, and writing them down changed nobody's access. These are the
-- opposite. Nothing in this system can currently invite a member of staff,
-- suspend one, or edit a role's permissions, because there has been no screen
-- to do it from. So every grant below would be a NEW power, and the most
-- consequential kind — the power to change who else can do what.
--
-- Deciding that inside a migration, on my judgement, is how an organisation
-- ends up with four people who can suspend each other and no record of who
-- agreed to it. So the keys are created and the grants are left for you, in
-- the same shape sql/12 used for the settings keys.
--
-- Until you uncomment a grant, /admin/users is reachable only by a holder of
-- the protected role: app/admin/users/page.tsx falls back to the role rank
-- from sql/16 when nobody holds users.view at all, so the screen is never
-- locked away from everybody at once.
--
-- WHAT I WOULD SUGGEST, FOR YOU TO ACCEPT OR CHANGE
--
--   users.view      Super Admin, Admin, Manager   seeing the staff list is
--                                                 useful for assignment work
--   users.manage    Super Admin, Admin            editing, suspending
--   users.invite    Super Admin, Admin            creating accounts
--   roles.manage    Super Admin                   editing permissions is the
--                                                 power to grant every other
--                                                 power; it belongs with one
--                                                 role, not two
--
-- Manager appears on users.view and nothing else on purpose: a manager needs
-- to know who works here and who is available, which is a reading question.
--
-- RUN ORDER: after sql/17.
-- ---------------------------------------------------------------------------

begin;

insert into public.app_permissions (key, module, label, description, sort_order)
values
  ('users.view',   'Staff & Users', 'See staff',
   'View the staff list, roles and status.', 10),
  ('users.invite', 'Staff & Users', 'Invite staff',
   'Create staff accounts and send invitations.', 20),
  ('users.manage', 'Staff & Users', 'Manage staff',
   'Edit staff details, suspend, reactivate and offboard.', 30),
  ('roles.manage', 'Staff & Users', 'Manage roles and permissions',
   'Create and rename roles, and change which permissions each role holds.', 40)
on conflict (key) do update
  set module      = excluded.module,
      label       = excluded.label,
      description = excluded.description,
      sort_order  = excluded.sort_order;

commit;

-- ---------------------------------------------------------------------------
-- The grants. Uncomment the lines you agree with, then run this file again.
-- ---------------------------------------------------------------------------
--
-- with wanted (role_name, permission) as (
--   values
--     ('Super Admin', 'users.view'),
--     ('Admin',       'users.view'),
--     ('Manager',     'users.view'),
--
--     ('Super Admin', 'users.invite'),
--     ('Admin',       'users.invite'),
--
--     ('Super Admin', 'users.manage'),
--     ('Admin',       'users.manage'),
--
--     ('Super Admin', 'roles.manage')
-- )
-- insert into public.role_permission_grants (role_id, permission)
-- select r.id, w.permission
-- from wanted w
-- join public.roles r on r.name = w.role_name
-- on conflict (role_id, permission) do nothing;
--
-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--
--   select r.name, g.permission
--   from public.role_permission_grants g
--   join public.roles r on r.id = g.role_id
--   where g.permission in ('users.view','users.invite','users.manage','roles.manage')
--   order by g.permission, r.name;
--
-- Before you uncomment the block above this returns zero rows, and the screen
-- falls back to the protected role. After, it should match what you chose and
-- nothing else. In particular roles.manage should be a very short list: it is
-- the one key whose holder can give themselves every other key.
-- ---------------------------------------------------------------------------
