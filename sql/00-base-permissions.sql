-- ===========================================================================
-- SPRINT 7 · SQL 00 — the three base enquiry permissions
-- ===========================================================================
--
-- RUN THIS ONLY IF you get "You don't have permission to view enquiries"
-- after everything else is in place.
--
-- You already ran this in an earlier session, so on your current database it
-- will find the rows present and change nothing. It is here so a fresh
-- database (a staging copy, a rebuild) can be brought up without hunting for
-- it, and so you can re-run it safely at any time.
--
-- What it does:
--   1. Adds enquiries.view / .manage / .delete to the permission catalogue.
--   2. Grants all three to the role of whoever's email you put below.
--
-- There is no roles admin screen in the app yet, so role changes are SQL.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The catalogue entries
--
-- app_permissions.module and .label are both NOT NULL, which is what made an
-- earlier version of this script fail. Every column it needs is supplied.
-- ---------------------------------------------------------------------------

insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Enquiries', v.label, v.description, v.sort_order
from (values
  ('enquiries.view',   'View enquiries',
   'See enquiry requests and the contact details on them.', 10),
  ('enquiries.manage', 'Manage enquiries',
   'Add enquiries, change their status, assign them and convert them.', 20),
  ('enquiries.delete', 'Delete enquiries',
   'Permanently remove an enquiry.', 30)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- ---------------------------------------------------------------------------
-- 2. Grant them to your own role
--
-- CHANGE THE EMAIL ON THE NEXT LINE to the account you sign in with.
-- ---------------------------------------------------------------------------

insert into public.role_permission_grants (role_id, permission)
select p.role_id, v.key
from public.profiles p
join auth.users u on u.id = p.id
cross join (values
  ('enquiries.view'), ('enquiries.manage'), ('enquiries.delete')
) as v (key)
where u.email = 'change-me@hushlushtechnologies.com'   -- <<< YOUR EMAIL HERE
  and p.role_id is not null
  and not exists (
    select 1 from public.role_permission_grants g
    where g.role_id = p.role_id and g.permission = v.key
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked. Three rows means you are done.
-- ---------------------------------------------------------------------------

select g.permission
from public.role_permission_grants g
join public.profiles p on p.role_id = g.role_id
join auth.users u on u.id = p.id
where u.email = 'change-me@hushlushtechnologies.com'   -- <<< YOUR EMAIL HERE
  and g.permission like 'enquiries.%'
order by g.permission;
