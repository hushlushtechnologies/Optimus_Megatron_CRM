-- ---------------------------------------------------------------------------
-- Sprint 9 — Phase 14
-- Backfill the 30 permission keys that the code checks but no migration defines
-- ---------------------------------------------------------------------------
--
-- WHAT THIS IS FOR
--
-- Your live database already has these keys. They were created directly in
-- Supabase during Sprints 6 and 7, and they work — the Sales, Test Drives,
-- Reservations and Payments screens all gate on them today.
--
-- What is missing is the migration. Nothing in this repository creates them,
-- so a fresh environment — a staging copy, a new developer's machine, a
-- rebuild after an incident — comes up with the keys absent. Every screen
-- that gates on one then refuses everybody, including Super Admin, and the
-- cause is invisible: the permission check simply returns false for a key
-- that does not exist.
--
-- That is the same failure you hit in Sprint 8, when a migration referenced
-- `public.permissions` instead of `public.app_permissions` and the whole
-- transaction rolled back. The lesson there was that a migration which
-- cannot be re-run from scratch is not a migration.
--
-- RUNNING THIS AGAINST YOUR LIVE DATABASE IS A NO-OP
--
-- Every insert is guarded by `where not exists`. A key you already have keeps
-- its current label, description, module and sort order — this script will
-- not touch a row that is already there, and it grants nothing unless you
-- edit section 3. If all 29 already exist, section 1 inserts zero rows and
-- the summary says so.
--
-- So it is safe to run now, and it is what makes a rebuild possible later.
--
-- WHAT IT DOES NOT DO
--
-- It does not grant anything by default. Grants are your role mapping and I
-- do not have it — guessing would be worse than leaving it to you, because a
-- wrong grant on `sales.approve_discount` or `payments.verify` hands somebody
-- a financial control rather than merely inconveniencing them.
--
-- Section 3 is a commented block. Uncomment it, name your roles, and run it
-- again. On a fresh environment you will need it; on your live database you
-- almost certainly will not, because the grants are already there.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 0. Check we are talking to the right table
-- ---------------------------------------------------------------------------
--
-- The table is public.app_permissions, joined to roles through
-- role_permission_grants. There is no public.permissions. Sprint 8 lost a
-- whole migration to that assumption, so this script refuses up front rather
-- than failing halfway.

-- A SECOND, LARGER GAP, FOUND WHILE TESTING THIS SCRIPT
--
-- I ran this against an empty database to check it, and it stopped here. So
-- did sql/00-base-permissions.sql. The reason is that **nothing in this
-- repository creates public.app_permissions, public.role_permission_grants
-- or public.roles.** They were made directly in Supabase, like the sales
-- views.
--
-- So the missing keys were the smaller half of the problem. The tables
-- they live in are missing too, which means the permission system cannot be
-- stood up from this repository at all — and that is what actually blocks a
-- rebuild.
--
-- The definitions below are INFERRED from how the code and the existing
-- migrations use these tables, not copied from your live schema, which I
-- cannot read. They are enough to make a fresh environment work. Your live
-- database is the authority: `create table if not exists` means this section
-- does nothing there, and does not alter a column, constraint or index.
--
-- Worth doing once, when you have a moment: dump the real definitions and
-- replace this section with them, so the repository and the database agree
-- exactly rather than approximately.
--
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name in ('roles','app_permissions','role_permission_grants')
--   order by table_name, ordinal_position;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permissions (
  key text primary key,
  module text not null,
  label text not null,
  description text,
  sort_order integer not null default 0
);

create table if not exists public.role_permission_grants (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission text not null references public.app_permissions (key) on delete cascade,
  primary key (role_id, permission)
);

create index if not exists role_permission_grants_role_idx
  on public.role_permission_grants (role_id);

-- Now the original guard, which should no longer be reachable but stays in
-- case somebody runs the sections out of order.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_permissions'
  ) then
    raise exception 'public.app_permissions still does not exist.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'role_permission_grants'
  ) then
    raise exception 'public.role_permission_grants still does not exist.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The keys
-- ---------------------------------------------------------------------------
--
-- Labels and descriptions are written from how each key is actually used in
-- the code, so the permissions screen reads as something a manager can set
-- without having to ask an engineer what it does.
--
-- Sort orders leave gaps of 10 so a key can be inserted later without
-- renumbering the module.

-- Sales -----------------------------------------------------------------
insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Sales', v.label, v.description, v.sort_order
from (values
  ('sales.view', 'View sales',
   'Open the Sales list and see the deals this person is allowed to see.', 10),
  ('sales.view_all', 'View all sales',
   'See every deal in the business, not only the ones this person owns.', 20),
  ('sales.create', 'Create deals',
   'Start a new deal and set its vehicle, customer and pricing.', 30),
  -- Found by tightening checks/check-permission-keys.py: beginSalesAction("edit")
  -- gates deal pricing and deal notes, and nothing defined the key. The old,
  -- looser check had been counting a mention elsewhere in the repo as a
  -- definition, so this one never appeared in the 29.
  ('sales.edit', 'Edit deals',
   'Change a deal''s pricing, terms and notes after it has been created.', 35),
  ('sales.assign', 'Assign deals',
   'Change which salesperson owns a deal.', 40),
  ('sales.confirm', 'Confirm deals',
   'Move a deal to Confirmed once its terms are agreed.', 50),
  ('sales.complete', 'Complete deals',
   'Move a deal to Completed. A completed deal counts toward revenue.', 60),
  ('sales.cancel', 'Cancel deals',
   'Cancel a deal and release the vehicle it was holding.', 70),
  ('sales.approve_discount', 'Approve discounts',
   'Approve a discount beyond the limit a salesperson may give on their own.', 80),
  ('sales.documents', 'Issue sales documents',
   'Issue quotations, invoices, receipts and reservation confirmations.', 90),
  ('sales.export', 'Export sales',
   'Download deal and payment data as a file.', 100),
  ('sales.settings', 'Sales settings',
   'Change currency, VAT rate, numbering and the sales workflow rules.', 110)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- Payments --------------------------------------------------------------
--
-- These three are the separation-of-duties controls. Whoever may record a
-- payment should generally not be the person who may verify it — that is the
-- point of having two keys rather than one, and the application enforces it
-- through the separate-verifier rule in payment settings.
insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Payments', v.label, v.description, v.sort_order
from (values
  ('payments.record', 'Record payments',
   'Enter a payment that has been received. Recording is a claim that money arrived; it does not confirm it.', 10),
  ('payments.verify', 'Verify payments',
   'Confirm or reject a recorded payment. Only verified payments count toward what a customer has paid.', 20),
  ('payments.reverse', 'Reverse payments',
   'Reverse a payment that was already verified, and record refunds. The original record is kept.', 30)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- Reservations ----------------------------------------------------------
insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Reservations', v.label, v.description, v.sort_order
from (values
  ('reservations.view', 'View reservations',
   'Open the Reservations list and see vehicle holds and their deposits.', 10),
  ('reservations.request', 'Request a reservation',
   'Place a hold on a vehicle for a customer.', 20),
  ('reservations.confirm', 'Confirm reservations',
   'Confirm a requested hold, which takes the vehicle off general availability.', 30),
  ('reservations.cancel', 'Cancel reservations',
   'Release a held vehicle back to available.', 40)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- Test drives -----------------------------------------------------------
insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Test Drives', v.label, v.description, v.sort_order
from (values
  ('test_drives.create', 'Book test drives',
   'Book a test drive for a customer.', 10),
  ('test_drives.edit', 'Edit test drives',
   'Change the details of a booked test drive.', 20),
  ('test_drives.assign', 'Assign test drives',
   'Change which staff member is hosting a test drive.', 30),
  ('test_drives.host', 'Host test drives',
   'Be assigned as the host who takes the customer out.', 40),
  ('test_drives.approve', 'Approve test drives',
   'Approve a test drive request that needs sign-off before it goes ahead.', 50),
  ('test_drives.reschedule', 'Reschedule test drives',
   'Move a booked test drive to a different time.', 60),
  ('test_drives.check_in', 'Check in test drives',
   'Record that the customer has arrived and the drive is starting.', 70),
  ('test_drives.complete', 'Complete test drives',
   'Record that a test drive finished, with its outcome.', 80),
  ('test_drives.cancel', 'Cancel test drives',
   'Cancel a booked test drive.', 90),
  ('test_drives.export', 'Export test drives',
   'Download test drive data as a file.', 100),
  ('test_drives.settings', 'Test drive settings',
   'Change durations, approval requirements and the test drive workflow rules.', 110)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- ---------------------------------------------------------------------------
-- 2. What happened
-- ---------------------------------------------------------------------------

do $$
declare
  v_expected text[] := array[
    'sales.view','sales.view_all','sales.create','sales.edit','sales.assign','sales.confirm',
    'sales.complete','sales.cancel','sales.approve_discount','sales.documents',
    'sales.export','sales.settings',
    'payments.record','payments.verify','payments.reverse',
    'reservations.view','reservations.request','reservations.confirm',
    'reservations.cancel',
    'test_drives.create','test_drives.edit','test_drives.assign','test_drives.host',
    'test_drives.approve','test_drives.reschedule','test_drives.check_in',
    'test_drives.complete','test_drives.cancel','test_drives.export',
    'test_drives.settings'
  ];
  v_present integer;
  v_missing text[];
begin
  select count(*) into v_present
  from public.app_permissions
  where key = any(v_expected);

  select array_agg(k order by k) into v_missing
  from unnest(v_expected) as k
  where not exists (select 1 from public.app_permissions p where p.key = k);

  raise notice '----------------------------------------------------------';
  raise notice 'Expected keys : %', array_length(v_expected, 1);
  raise notice 'Now defined   : %', v_present;

  if v_missing is null then
    raise notice 'All 30 keys are defined. A fresh environment can now be';
    raise notice 'provisioned from this repository.';
  else
    raise notice 'STILL MISSING : %', v_missing;
    raise exception 'Backfill did not define every key — see the list above.';
  end if;

  raise notice '----------------------------------------------------------';
  raise notice 'Defining a key does not grant it. Section 3 does that, and';
  raise notice 'is commented out on purpose — see the header.';
  raise notice '----------------------------------------------------------';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Grants — EDIT BEFORE USING, then uncomment
-- ---------------------------------------------------------------------------
--
-- On your live database you almost certainly do not need this: the grants are
-- already in place, which is why the screens work.
--
-- On a fresh environment you do. Decide which roles get what, then uncomment
-- the block and run the file again. It only ever adds grants that are not
-- already there, so it is safe to run repeatedly.
--
-- Spelled out per role rather than as one loop, because that is the form in
-- which somebody can read it and disagree with a specific line.
--
-- The role names below are examples. Replace them with yours — check with:
--
--   select id, name from public.roles order by name;

/*
-- Everything, for the role that administers the system.
insert into public.role_permission_grants (role_id, permission)
select r.id, p.key
from public.roles r
cross join public.app_permissions p
where r.name = 'Super Admin'
  and p.module in ('Sales', 'Payments', 'Reservations', 'Test Drives')
  and not exists (
    select 1 from public.role_permission_grants g
    where g.role_id = r.id and g.permission = p.key
  );

-- A sales manager: everything in Sales, plus the financial controls.
insert into public.role_permission_grants (role_id, permission)
select r.id, k
from public.roles r
cross join unnest(array[
  'sales.view','sales.view_all','sales.create','sales.edit','sales.assign',
  'sales.confirm','sales.complete','sales.cancel','sales.approve_discount',
  'sales.documents','sales.export',
  'payments.verify','payments.reverse',
  'reservations.view','reservations.confirm','reservations.cancel',
  'test_drives.approve','test_drives.assign'
]) as k
where r.name = 'Sales Manager'
  and not exists (
    select 1 from public.role_permission_grants g
    where g.role_id = r.id and g.permission = k
  );

-- A salesperson: their own deals, and recording payments but NOT verifying
-- them. Recording and verifying in the same pair of hands removes the only
-- control on whether a payment really arrived.
insert into public.role_permission_grants (role_id, permission)
select r.id, k
from public.roles r
cross join unnest(array[
  'sales.view','sales.create','sales.edit','sales.confirm','sales.documents',
  'payments.record',
  'reservations.view','reservations.request',
  'test_drives.create','test_drives.edit','test_drives.host',
  'test_drives.reschedule','test_drives.check_in','test_drives.complete'
]) as k
where r.name = 'Salesperson'
  and not exists (
    select 1 from public.role_permission_grants g
    where g.role_id = r.id and g.permission = k
  );

-- A showroom host: test drives and read-only everywhere else.
insert into public.role_permission_grants (role_id, permission)
select r.id, k
from public.roles r
cross join unnest(array[
  'sales.view',
  'reservations.view',
  'test_drives.create','test_drives.host','test_drives.check_in',
  'test_drives.complete','test_drives.reschedule'
]) as k
where r.name = 'Showroom Host'
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
-- What each role can now do:
--
--   select r.name, p.module, p.key, p.label
--   from public.roles r
--   join public.role_permission_grants g on g.role_id = r.id
--   join public.app_permissions p on p.key = g.permission
--   where p.module in ('Sales','Payments','Reservations','Test Drives')
--   order by r.name, p.module, p.sort_order;
--
-- And the control worth checking by eye — anybody who can both record and
-- verify a payment, which defeats the separate-verifier rule:
--
--   select r.name
--   from public.roles r
--   where exists (select 1 from public.role_permission_grants g
--                 where g.role_id = r.id and g.permission = 'payments.record')
--     and exists (select 1 from public.role_permission_grants g
--                 where g.role_id = r.id and g.permission = 'payments.verify');
--
-- A role appearing there is not necessarily wrong — a small dealership may
-- have no choice — but it should be a decision somebody made rather than one
-- that happened.
-- ---------------------------------------------------------------------------
