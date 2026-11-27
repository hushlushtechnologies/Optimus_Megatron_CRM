-- ---------------------------------------------------------------------------
-- Sprint 10 — Phase 6
-- Showroom addresses, and a write policy for public.locations
-- ---------------------------------------------------------------------------
--
-- WHAT THIS IS FOR
--
-- Nine modules read public.locations — inventory, customers, leads, test
-- drives, reservations, enquiries, sales, delivery and reports all filter or
-- file records by showroom. Nothing in the application could ever write it.
-- The rows that exist were created by hand, and adding a showroom meant
-- opening the SQL editor.
--
-- Sprint 10 adds the editor at /admin/settings/organization/locations. This
-- file gives it the two things it needs from the database.
--
--
-- SECTION 1 — the address column
--
-- Every query in the repo reads only `id, name` from locations, so whether it
-- already has an address column is not knowable from the code. This adds one
-- if it is missing and leaves it alone if it is not.
--
-- The page works either way. It asks for the wide row first and falls back to
-- the narrow one on a 42703 (undefined column), hiding the address field and
-- saying to run this file. So you can skip section 1 and the editor still
-- works for names, display order and switching a showroom on and off.
--
--
-- SECTION 2 — who may write
--
-- This is the part worth reading before you run it.
--
-- public.locations predates every migration in this repo, so whatever RLS it
-- has lives in your Supabase project and cannot be seen from the code. I have
-- therefore written this to ADD a policy and drop nothing: a policy I cannot
-- read is a policy I must not replace, and Postgres combines permissive
-- policies with OR, so adding one cannot take away access that already works.
--
-- The policy grants insert and update to holders of settings.organization,
-- which is the same key the server action checks. Until you run it, that
-- server action is the only thing standing between a signed-in user and this
-- table — the action is a real gate, since every write goes through it, but it
-- is one gate rather than two.
--
-- It does NOT grant delete, and the editor has no delete. Cars, deals, test
-- drives, reservations and enquiries reference locations.id with
-- `on delete set null`, so deleting a showroom would succeed quietly and blank
-- the location on every historical record pointing at it: a car sold last
-- March would forget which showroom sold it, and those deals would move into
-- "no showroom" in the sales report. Switching a showroom off keeps all of
-- that and removes it from every picker.
--
--
-- RUNNING THIS AGAINST YOUR LIVE DATABASE
--
-- Safe to run, and safe to run twice. Section 1 is `add column if not
-- exists`. Section 2 creates a policy only if no policy of that name exists.
-- Nothing is dropped, no data is touched, and no existing policy is modified.
--
-- Requires sql/11 (permission tables) and sql/12 (the settings keys).
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'locations'
  ) then
    raise exception
      'public.locations does not exist. This file expects the showrooms table that the inventory, test drive and sales modules already read.';
  end if;

  -- The table has to be checked before it is queried, or a database without
  -- sql/11 gets a bare "relation public.app_permissions does not exist"
  -- instead of being told which file to run.
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_permissions'
  ) then
    raise exception
      'public.app_permissions does not exist. Run sql/11-sprint-9-backfill-permission-keys.sql, then sql/12-sprint-10-settings-permissions.sql, then this file.';
  end if;

  if not exists (
    select 1 from public.app_permissions where key = 'settings.organization'
  ) then
    raise exception
      'settings.organization is not defined. Run sql/12-sprint-10-settings-permissions.sql first.';
  end if;

  -- get_my_permissions() is what the policies below call. If it is missing the
  -- policies would be created and then fail at runtime on every write, which
  -- is a worse outcome than refusing now.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_permissions'
  ) then
    raise exception
      'public.get_my_permissions() does not exist. It is what the policies in section 2 authorise against; creating them without it would make every showroom write fail. Run sql/11 first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Address column
-- ---------------------------------------------------------------------------

alter table public.locations
  add column if not exists address text;

comment on column public.locations.address is
  'Street address of the showroom. Added in Sprint 10 for the showrooms settings page. Nullable: showrooms created before this have no address and the page shows them as "No address".';

-- ---------------------------------------------------------------------------
-- 2. Write policy — added, never replacing
-- ---------------------------------------------------------------------------
--
-- `get_my_permissions()` is the function the rest of the app authorises
-- through; reusing it keeps one definition of what a permission means.

do $$
begin
  -- Insert
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'omc_locations_settings_insert'
  ) then
    execute $policy$
      create policy omc_locations_settings_insert
        on public.locations
        for insert
        to authenticated
        with check ('settings.organization' = any (public.get_my_permissions()))
    $policy$;
    raise notice 'Created policy omc_locations_settings_insert.';
  else
    raise notice 'Policy omc_locations_settings_insert already exists; left alone.';
  end if;

  -- Update
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'omc_locations_settings_update'
  ) then
    execute $policy$
      create policy omc_locations_settings_update
        on public.locations
        for update
        to authenticated
        using ('settings.organization' = any (public.get_my_permissions()))
        with check ('settings.organization' = any (public.get_my_permissions()))
    $policy$;
    raise notice 'Created policy omc_locations_settings_update.';
  else
    raise notice 'Policy omc_locations_settings_update already exists; left alone.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. What this did
-- ---------------------------------------------------------------------------

do $$
declare
  has_address boolean;
  policy_count integer;
  rls_on boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'locations' and column_name = 'address'
  ) into has_address;

  select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'locations'
  into policy_count;

  select relrowsecurity from pg_class
  where oid = 'public.locations'::regclass
  into rls_on;

  raise notice 'locations.address present: %', has_address;
  raise notice 'policies on public.locations: %', policy_count;
  raise notice 'row level security enabled on public.locations: %', rls_on;

  if not has_address then
    raise exception 'locations.address was not created. Nothing has been committed.';
  end if;

  -- Worth saying out loud rather than leaving in a count: if RLS is off, the
  -- policies added above are inert and the server action is the only gate.
  if not rls_on then
    raise notice '-----------------------------------------------------------';
    raise notice 'RLS is NOT enabled on public.locations, so the policies';
    raise notice 'above do nothing yet. The settings page still checks the';
    raise notice 'permission before writing, but the database is not';
    raise notice 'enforcing it. Enabling RLS on a table nine modules read is';
    raise notice 'not something to do blind — every read path needs a select';
    raise notice 'policy first, or showroom names disappear across the app.';
    raise notice 'Left for you to decide.';
    raise notice '-----------------------------------------------------------';
  end if;
end $$;

commit;
