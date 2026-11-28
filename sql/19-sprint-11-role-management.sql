-- ---------------------------------------------------------------------------
-- Sprint 11 — Phases 8 and 9
-- Role management and the permissions matrix
-- ---------------------------------------------------------------------------
--
-- WHAT MAKES THIS SAFE TO DO NOW AND NOT EARLIER
--
-- Phase 8 lets an administrator rename a role. Before sql/17, six hardcoded
-- arrays of role NAMES decided who could manage inventory, customers and
-- leads — so the first rename would have silently taken inventory management
-- away from the Inventory Manager, with no error anywhere. sql/17 moved those
-- three modules onto permission keys. That is the only reason a rename button
-- is a feature rather than a trap.
--
-- NO DELETION, ONLY DEACTIVATION
--
-- "Never remove existing role IDs" from the sprint brief, and the brief is
-- right: roles are referenced by profiles, by staff_invitations, by
-- role_permission_grants and by every history row that recorded what somebody
-- used to be. Deleting one would blank or break all of it.
--
-- So roles.is_active is added and deletion is refused by a trigger. An
-- inactive role cannot be assigned to anybody new; the people already in it
-- keep working exactly as before. Deactivating a role is "stop using this",
-- not "revoke everybody at once" — the second thing is a mass lockout
-- disguised as a tidy-up, so a role with members cannot be deactivated at all
-- until they are moved.
--
-- WHO MAY DO ANY OF THIS, AND THE RULE THAT STOPS ESCALATION
--
-- Granting permissions is the power to grant every other power, so it has the
-- narrowest rule in this system: an actor may only grant a permission they
-- hold themselves. An Admin with roles.manage can therefore build a role for
-- the showroom team, but cannot invent one that outranks them, and cannot hand
-- out a key they were never given. Holders of the protected role are exempt —
-- somebody has to be able to bootstrap.
--
-- CRITICAL PERMISSIONS CANNOT BE REVOKED TO ZERO
--
-- app_permissions.is_critical marks the keys that, if nobody holds them, leave
-- the system unadministrable: roles.manage and users.manage. The last active
-- holder of either cannot be revoked, for the same reason the last active
-- Super Admin cannot be demoted. "Unreviewed removal of critical permission
-- grants" from the brief, enforced rather than documented.
--
-- RUN ORDER: after sql/18. Safe to re-run.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Role metadata
-- ---------------------------------------------------------------------------

alter table public.roles
  add column if not exists description text,
  add column if not exists is_active   boolean not null default true,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists created_by  uuid references public.profiles (id) on delete set null,
  add column if not exists updated_by  uuid references public.profiles (id) on delete set null;

comment on column public.roles.is_active is
  'False means the role cannot be assigned to anybody new. People already in '
  'it keep working — deactivating is "stop using this", not "revoke everyone".';

create index if not exists roles_is_active_idx on public.roles (is_active);

-- A role with no name is unusable in every picker in the application.
do $role_name_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.roles'::regclass and conname = 'roles_name_not_blank'
  ) then
    alter table public.roles
      add constraint roles_name_not_blank check (length(btrim(name)) > 0);
  end if;
end
$role_name_check$;

-- ---------------------------------------------------------------------------
-- 2. Critical permissions
-- ---------------------------------------------------------------------------

alter table public.app_permissions
  add column if not exists is_critical boolean not null default false;

comment on column public.app_permissions.is_critical is
  'True for keys that leave the system unadministrable if nobody holds them. '
  'The last active holder of one cannot be revoked.';

-- Exactly two, and deliberately only two. A long list of "critical"
-- permissions makes the matrix unusable and teaches people to work around the
-- guard; these are the two that lock you out of fixing anything else.
update public.app_permissions
   set is_critical = true
 where key in ('roles.manage', 'users.manage');

-- ---------------------------------------------------------------------------
-- 3. Role history
-- ---------------------------------------------------------------------------
--
-- One row per field changed, rather than a snapshot, so "who renamed this and
-- when" is one query. Grants have their own history already — sql/16 added
-- role_permission_grant_history with a trigger that fires however the change
-- was made.

create table if not exists public.role_history (
  id         uuid primary key default gen_random_uuid(),
  role_id    uuid,
  role_name  text,
  field      text not null check (field in ('name', 'rank', 'is_active', 'description', 'created')),
  from_value text,
  to_value   text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists role_history_role_idx on public.role_history (role_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 4. Invariants, as triggers
-- ---------------------------------------------------------------------------

-- 4a. No deletion, ever, by any route.

create or replace function public.guard_role_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Roles are never deleted — "%" is referenced by staff records, invitations and history. Deactivate it instead.',
    old.name
    using errcode = 'check_violation',
          hint = 'update public.roles set is_active = false where id = ...';
end
$$;

drop trigger if exists roles_guard_delete on public.roles;
create trigger roles_guard_delete
  before delete on public.roles
  for each row execute function public.guard_role_delete();

-- 4b. The protected role, and roles that still have people in them.

create or replace function public.guard_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
begin
  if coalesce(old.protected, false) then
    if new.is_active = false then
      raise exception 'The % role cannot be deactivated — it is the one that must always be available.', old.name
        using errcode = 'check_violation';
    end if;

    if new.protected = false then
      raise exception 'The % role cannot stop being the protected role.', old.name
        using errcode = 'check_violation',
              hint = 'Mark another role protected first, in a deliberate migration.';
    end if;

    -- Its rank is what every authority check measures against. Moving it would
    -- reorder the whole system silently.
    if new.rank is distinct from old.rank then
      raise exception 'The % role''s authority rank cannot be changed.', old.name
        using errcode = 'check_violation';
    end if;
  end if;

  -- Deactivating a role that still has people in it would take their access
  -- away as a side effect of a tidy-up. Move them first.
  if old.is_active and new.is_active = false then
    select count(*) into member_count
    from public.profiles p
    where p.role_id = old.id and p.status in ('active', 'invited', 'suspended');

    if member_count > 0 then
      raise exception
        'The % role still has % staff member(s). Move them to another role before deactivating it.',
        old.name, member_count
        using errcode = 'check_violation';
    end if;
  end if;

  -- Log every field that changed, one row each.
  if new.name is distinct from old.name then
    insert into public.role_history (role_id, role_name, field, from_value, to_value, changed_by)
    values (old.id, new.name, 'name', old.name, new.name, coalesce(new.updated_by, auth.uid()));
  end if;

  if new.rank is distinct from old.rank then
    insert into public.role_history (role_id, role_name, field, from_value, to_value, changed_by)
    values (old.id, new.name, 'rank', old.rank::text, new.rank::text, coalesce(new.updated_by, auth.uid()));
  end if;

  if new.is_active is distinct from old.is_active then
    insert into public.role_history (role_id, role_name, field, from_value, to_value, changed_by)
    values (old.id, new.name, 'is_active', old.is_active::text, new.is_active::text,
            coalesce(new.updated_by, auth.uid()));
  end if;

  if new.description is distinct from old.description then
    insert into public.role_history (role_id, role_name, field, from_value, to_value, changed_by)
    values (old.id, new.name, 'description', old.description, new.description,
            coalesce(new.updated_by, auth.uid()));
  end if;

  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists roles_guard_update on public.roles;
create trigger roles_guard_update
  before update on public.roles
  for each row execute function public.guard_role_update();

-- 4c. A new role is recorded too, so the history starts at the beginning.

create or replace function public.log_role_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.role_history (role_id, role_name, field, from_value, to_value, changed_by)
  values (new.id, new.name, 'created', null, new.name, coalesce(new.created_by, auth.uid()));
  return new;
end
$$;

drop trigger if exists roles_log_created on public.roles;
create trigger roles_log_created
  after insert on public.roles
  for each row execute function public.log_role_created();

-- 4d. A role cannot be assigned to somebody if it is inactive.
--
-- The staff functions in sql/16 check authority, not whether the role is still
-- in use. This closes that gap at the table, so it holds for every write path
-- including a direct update.

create or replace function public.guard_profile_role_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_active boolean;
  target_name   text;
begin
  if new.role_id is null or new.role_id is not distinct from old.role_id then
    return new;
  end if;

  select is_active, name into target_active, target_name
  from public.roles where id = new.role_id;

  if target_active = false then
    raise exception 'The % role is no longer in use and cannot be assigned.', target_name
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists profiles_guard_role_active on public.profiles;
create trigger profiles_guard_role_active
  before update on public.profiles
  for each row execute function public.guard_profile_role_active();

-- 4e. A critical permission must always have an active holder.

create or replace function public.guard_critical_grant_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_critical boolean;
  was_protected boolean;
  remaining integer;
begin
  select p.is_critical into is_critical
  from public.app_permissions p where p.key = old.permission;

  if not coalesce(is_critical, false) then
    return old;
  end if;

  select coalesce(r.protected, false) into was_protected
  from public.roles r where r.id = old.role_id;

  if was_protected then
    raise exception
      'The protected role cannot lose "%" — it is the role that has to be able to put things right.',
      old.permission
      using errcode = 'check_violation';
  end if;

  select count(*) into remaining
  from public.role_permission_grants g
  join public.roles r on r.id = g.role_id
  where g.permission = old.permission
    and r.is_active
    and not (g.role_id = old.role_id and g.permission = old.permission);

  if remaining = 0 then
    raise exception
      'No active role would hold "%" any more, which would leave nobody able to administer the system.',
      old.permission
      using errcode = 'check_violation',
            hint = 'Grant it to another role first.';
  end if;

  return old;
end
$$;

drop trigger if exists role_permission_grants_guard_critical on public.role_permission_grants;
create trigger role_permission_grants_guard_critical
  before delete on public.role_permission_grants
  for each row execute function public.guard_critical_grant_revoke();

-- ---------------------------------------------------------------------------
-- 5. Actor-aware operations
-- ---------------------------------------------------------------------------
--
-- As in sql/16, the actor is an argument rather than auth.uid(), because these
-- are called with the service-role client and auth.uid() is null there. The
-- server action reads the actor from the session and passes it; the functions
-- are not reachable from a browser (see the revokes at the end of this file).

/*
| Does this actor hold this permission?
|
| Reads role_permission_grants directly rather than calling
| get_my_permissions(), which depends on auth.uid() and would return nothing
| under a service-role connection. Same table, same answer, no session needed.
*/
create or replace function public.actor_holds(p_actor uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    join public.role_permission_grants g on g.role_id = p.role_id
    where p.id = p_actor
      and p.status = 'active'
      and r.is_active
      and g.permission = p_permission
  );
$$;

create or replace function public.actor_is_protected(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = p_actor and p.status = 'active' and coalesce(r.protected, false)
  );
$$;

create or replace function public.actor_rank(p_actor uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(r.rank), 32767)::smallint
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_actor and p.status = 'active';
$$;

/*
| The shared gate for every operation below.
|
| Raises rather than returning a boolean, so a caller cannot forget to check
| the result — the most common way a permission check becomes decorative.
*/
create or replace function public.assert_can_manage_roles(p_actor uuid, p_target_rank integer default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a_rank integer;
begin
  if not public.actor_is_protected(p_actor) then
    if not public.actor_holds(p_actor, 'roles.manage') then
      raise exception 'You do not have permission to manage roles.'
        using errcode = 'insufficient_privilege';
    end if;

    a_rank := public.actor_rank(p_actor);

    if p_target_rank is not null and p_target_rank <= a_rank then
      raise exception 'That role is at or above your own authority.'
        using errcode = 'insufficient_privilege',
              hint = 'You can only work on roles ranked below your own.';
    end if;
  end if;
end
$$;

/*
| p_rank is integer, not smallint, on purpose.
|
| Postgres will not implicitly cast integer to smallint while resolving which
| function to call, so `role_create(actor, 'Showroom Lead', 25, null)` fails
| with "function does not exist". That error looks identical to a refusal to
| any caller that only checks whether an error came back — which is how three
| of this file's own safeguard tests passed for the wrong reason before the
| signature was fixed.
*/
create or replace function public.role_create(
  p_actor       uuid,
  p_name        text,
  p_rank        integer,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.assert_can_manage_roles(p_actor, p_rank);

  insert into public.roles (name, rank, description, protected, is_active, created_by, updated_by)
  values (btrim(p_name), p_rank::smallint, p_description, false, true, p_actor, p_actor)
  returning id into new_id;

  return new_id;
end
$$;

create or replace function public.role_update(
  p_actor       uuid,
  p_role_id     uuid,
  p_name        text,
  p_rank        integer,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rank integer;
begin
  select rank into current_rank from public.roles where id = p_role_id;

  if current_rank is null then
    raise exception 'That role does not exist.' using errcode = 'no_data_found';
  end if;

  -- Both the role as it stands AND the rank it is moving to must be below the
  -- actor. Checking only one of them would let somebody promote a role they
  -- can edit into one they cannot.
  perform public.assert_can_manage_roles(p_actor, current_rank);
  perform public.assert_can_manage_roles(p_actor, p_rank);

  update public.roles
     set name        = btrim(p_name),
         rank        = p_rank::smallint,
         description = p_description,
         updated_by  = p_actor
   where id = p_role_id;
end
$$;

create or replace function public.role_set_active(
  p_actor   uuid,
  p_role_id uuid,
  p_active  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rank integer;
begin
  select rank into current_rank from public.roles where id = p_role_id;

  if current_rank is null then
    raise exception 'That role does not exist.' using errcode = 'no_data_found';
  end if;

  perform public.assert_can_manage_roles(p_actor, current_rank);

  update public.roles
     set is_active = p_active, updated_by = p_actor
   where id = p_role_id;
end
$$;

/*
| Grant or revoke one permission on one role.
|
| THE ANTI-ESCALATION RULE IS THE SECOND CHECK BELOW
|
| An actor may only grant a permission they hold themselves. Without it,
| roles.manage would be the only permission anybody ever needed: hold it, build
| a role with every key in the system, assign yourself to it. With it,
| roles.manage lets you distribute the authority you already have and nothing
| more.
|
| Holders of the protected role are exempt, because somebody has to be able to
| grant the first of everything.
*/
create or replace function public.role_set_permission(
  p_actor      uuid,
  p_role_id    uuid,
  p_permission text,
  p_granted    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_rank integer;
begin
  select rank into target_rank from public.roles where id = p_role_id;

  if target_rank is null then
    raise exception 'That role does not exist.' using errcode = 'no_data_found';
  end if;

  perform public.assert_can_manage_roles(p_actor, target_rank);

  if not exists (select 1 from public.app_permissions where key = p_permission) then
    raise exception 'There is no permission called "%".', p_permission
      using errcode = 'foreign_key_violation';
  end if;

  if not public.actor_is_protected(p_actor) and not public.actor_holds(p_actor, p_permission) then
    raise exception 'You cannot grant "%" because you do not hold it yourself.', p_permission
      using errcode = 'insufficient_privilege',
            hint = 'Ask a Super Admin, or have it granted to your own role first.';
  end if;

  if p_granted then
    insert into public.role_permission_grants (role_id, permission)
    values (p_role_id, p_permission)
    on conflict (role_id, permission) do nothing;
  else
    delete from public.role_permission_grants
     where role_id = p_role_id and permission = p_permission;
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
--
-- The operations are server-only: revoked from PUBLIC, which takes
-- `authenticated` with it, so a browser session cannot call them whatever its
-- JWT says. The read helpers stay available because RLS policies need them.

revoke all on function public.role_create(uuid, text, integer, text) from public;
revoke all on function public.role_update(uuid, uuid, text, integer, text) from public;
revoke all on function public.role_set_active(uuid, uuid, boolean) from public;
revoke all on function public.role_set_permission(uuid, uuid, text, boolean) from public;
revoke all on function public.assert_can_manage_roles(uuid, integer) from public;

revoke all on function public.actor_holds(uuid, text) from public;
revoke all on function public.actor_is_protected(uuid) from public;
revoke all on function public.actor_rank(uuid) from public;

-- Role history is readable by administrators, like the other history tables.
alter table public.role_history enable row level security;

drop policy if exists role_history_admin_read on public.role_history;
create policy role_history_admin_read on public.role_history
  for select to authenticated
  using (public.is_active_staff(auth.uid()) and public.my_staff_rank() <= 10);

grant select on public.role_history to authenticated;
revoke insert, update, delete on public.role_history from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Verification
-- ---------------------------------------------------------------------------
--
-- 7a. The roles, as the matrix will show them.
--
--   select r.name, r.rank, r.protected, r.is_active,
--          count(distinct p.id)  as staff,
--          count(distinct g.permission) as permissions
--   from public.roles r
--   left join public.profiles p on p.role_id = r.id
--   left join public.role_permission_grants g on g.role_id = r.id
--   group by r.id, r.name, r.rank, r.protected, r.is_active
--   order by r.rank, r.name;
--
-- THIS IS THE RANK LISTING I HAVE ASKED ABOUT TWICE. Any role my seed list in
-- sql/16 never named is sitting at rank 90, the least authority. If one of
-- those should outrank Manager, change it from the roles screen — it is
-- editable there now, so you do not need to send me anything.
--
-- 7b. Are the critical permissions actually held by somebody?
--
--   select p.key, p.is_critical,
--          coalesce(string_agg(r.name, ', ' order by r.name), '— NOBODY —') as held_by
--   from public.app_permissions p
--   left join public.role_permission_grants g on g.permission = p.key
--   left join public.roles r on r.id = g.role_id and r.is_active
--   where p.is_critical
--   group by p.key, p.is_critical;
--
-- While the sql/18 grant block is still commented out this returns "— NOBODY —"
-- for both, and /admin/users falls back to the protected role. That is the
-- state the fallback exists for; it stops applying the moment you grant them.
--
-- 7c. Are the guards armed?
--
--   select tgname from pg_trigger
--   where tgrelid in ('public.roles'::regclass, 'public.role_permission_grants'::regclass)
--     and not tgisinternal order by tgname;
--
-- Expected: roles_guard_delete, roles_guard_update, roles_log_created,
-- role_permission_grants_log, role_permission_grants_guard_critical.
-- ---------------------------------------------------------------------------
