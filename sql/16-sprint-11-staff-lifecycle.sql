-- ---------------------------------------------------------------------------
-- Sprint 11 — Phase 2
-- Staff lifecycle: status, invitations, audit history, staff codes
-- ---------------------------------------------------------------------------
--
-- WHAT THIS FILE ASSUMES, AND WHAT IT DOES NOT
--
-- public.profiles is not created by any migration in this repository. It was
-- created in the Supabase dashboard before the repo existed. The application
-- only ever selects five of its columns (id, full_name, avatar_url, role_id,
-- roles(name)), so the real table may well have more. Every column below is
-- therefore added with "if not exists" and nothing is dropped or retyped.
--
-- Two functions this schema would like to extend — get_my_permissions() and
-- has_permission(uuid, text) — exist only in the live database. No migration
-- in this repo creates them. This file DOES NOT redefine them, because
-- overwriting a function whose body I cannot read would be guesswork with
-- company-wide authorisation consequences. Instead it adds is_active_staff()
-- alongside them, and §9 records the exact one-line change to make to
-- get_my_permissions() once its definition is to hand.
--
-- DEFAULT 'active' IS DELIBERATE AND LOAD-BEARING
--
-- profiles.status defaults to 'active'. Defaulting to 'invited' would be
-- tidier for new rows and would lock every current member of staff out of
-- the admin area the moment this file ran. The whole point of adding a
-- status column is that it can deny access, so the default has to be the
-- value that denies nobody.
--
-- WHAT ENFORCES WHAT
--
--   triggers              invariants that hold no matter who is writing:
--                         an active Super Admin must always exist; a staff
--                         code never changes; status moves along legal edges
--
--   security definer fns  rules that depend on WHO is acting: may this
--                         person assign this role, suspend this account
--
-- The split exists because Supabase service-role writes make auth.uid()
-- null. An actor-free invariant survives that; an actor-aware rule cannot,
-- so it takes the actor as an argument and the server action passes it.
--
-- RUN ORDER: after sql/15. Safe to re-run — every statement is idempotent.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Role authority: rank and protection
-- ---------------------------------------------------------------------------
--
-- Phase 8 of this sprint lets an administrator rename a role. Any safeguard
-- written as "where roles.name = 'Super Admin'" stops working the first time
-- somebody renames that row to "Owner", and it fails OPEN — the protection
-- silently disappears. So authority is recorded as data on the row, set once
-- here by name, and read by flag everywhere after.

alter table public.roles
  add column if not exists rank      smallint,
  add column if not exists protected boolean not null default false;

comment on column public.roles.rank is
  'Authority ordering, lower is more privileged. A staff member may assign '
  'only roles ranked strictly above their own. Nulls sort last.';
comment on column public.roles.protected is
  'True for the role that must never be left without an active holder, and '
  'whose holders may assign any role. Set once by name; survives renames.';

-- Seed the ordering by name. This is the ONLY place names are used, and it
-- runs before anybody has had the chance to rename anything.
update public.roles set rank = 0  where name = 'Super Admin'      and rank is null;
update public.roles set rank = 10 where name = 'Admin'            and rank is null;
update public.roles set rank = 20 where name = 'Manager'          and rank is null;
update public.roles set rank = 30 where name = 'Finance'          and rank is null;
update public.roles set rank = 30 where name = 'Inventory Manager' and rank is null;
update public.roles set rank = 30 where name = 'Content Manager'  and rank is null;
update public.roles set rank = 30 where name = 'Sales Executive'  and rank is null;
update public.roles set rank = 90 where name = 'Viewer'           and rank is null;

-- Any role this file has never heard of gets the least authority rather than
-- none, so an unranked role cannot be used as a privilege-escalation hole.
update public.roles set rank = 90 where rank is null;

alter table public.roles alter column rank set default 90;
alter table public.roles alter column rank set not null;

update public.roles set protected = true where name = 'Super Admin';

-- ---------------------------------------------------------------------------
-- 2. Staff codes
-- ---------------------------------------------------------------------------
--
-- A human-quotable identifier that outlives name changes and role changes,
-- for payroll references and audit conversations: OMC-STF-000001.
--
-- A sequence rather than max(code)+1 because two concurrent invitations
-- computing max() at the same time both read the same number and the second
-- insert fails on the unique index. Sequences do not have that failure mode.

create sequence if not exists public.staff_code_seq as bigint start with 1;

alter table public.profiles
  add column if not exists staff_code text;

create unique index if not exists profiles_staff_code_key
  on public.profiles (staff_code)
  where staff_code is not null;

create or replace function public.next_staff_code()
returns text
language sql
volatile
set search_path = public
as $$
  select 'OMC-STF-' || lpad(nextval('public.staff_code_seq')::text, 6, '0');
$$;

comment on function public.next_staff_code() is
  'Allocates the next staff code. Concurrency-safe: sequence, not max()+1.';

-- New rows get a code without anybody having to remember to ask for one. The
-- default covers ordinary inserts; the trigger covers the insert that passes
-- staff_code => null explicitly, which a default does not catch and which is
-- exactly what an ORM or a seed script tends to do.
alter table public.profiles alter column staff_code set default public.next_staff_code();

create or replace function public.fill_staff_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.staff_code is null then
    new.staff_code := public.next_staff_code();
  end if;
  return new;
end
$$;

drop trigger if exists profiles_fill_staff_code on public.profiles;
create trigger profiles_fill_staff_code
  before insert on public.profiles
  for each row execute function public.fill_staff_code();

-- Backfill in a stable order so codes line up with joining order as far as
-- the data allows, then advance the sequence past whatever was handed out.
do $backfill$
declare
  r record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'created_at'
  ) then
    for r in execute
      'select id from public.profiles where staff_code is null order by created_at, id'
    loop
      update public.profiles
        set staff_code = public.next_staff_code()
      where id = r.id;
    end loop;
  else
    for r in select id from public.profiles where staff_code is null order by id loop
      update public.profiles
        set staff_code = public.next_staff_code()
      where id = r.id;
    end loop;
  end if;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 3. Staff lifecycle columns on profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists status          text not null default 'active',
  add column if not exists phone           text,
  add column if not exists department      text,
  add column if not exists job_title       text,
  add column if not exists showroom_id     uuid,
  add column if not exists invited_at      timestamptz,
  add column if not exists activated_at    timestamptz,
  add column if not exists suspended_at    timestamptz,
  add column if not exists deactivated_at  timestamptz,
  add column if not exists status_reason   text,
  add column if not exists created_by      uuid references public.profiles (id) on delete set null,
  add column if not exists updated_by      uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at      timestamptz not null default now();

comment on column public.profiles.status is
  'invited | active | suspended | deactivated. Enforced by RLS and by '
  'is_active_staff(); not a badge. Defaults to active so that adding this '
  'column cannot lock out existing staff.';

do $status_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('invited', 'active', 'suspended', 'deactivated'));
  end if;
end
$status_check$;

create index if not exists profiles_status_idx  on public.profiles (status);
create index if not exists profiles_role_id_idx on public.profiles (role_id);

-- Link showrooms if that table exists; the column stays unconstrained if not,
-- rather than failing the whole migration on a table this sprint does not own.
do $showroom_fk$
begin
  if exists (select 1 from pg_class where relname = 'showrooms' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.profiles'::regclass and conname = 'profiles_showroom_id_fkey'
     )
  then
    alter table public.profiles
      add constraint profiles_showroom_id_fkey
      foreign key (showroom_id) references public.showrooms (id) on delete set null;
  end if;
end
$showroom_fk$;

-- ---------------------------------------------------------------------------
-- 4. is_active_staff — the one question every gate should ask
-- ---------------------------------------------------------------------------
--
-- Additive on purpose. get_my_permissions() is not touched here (see §9).

create or replace function public.is_active_staff(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and p.role_id is not null
      and p.status = 'active'
  );
$$;

comment on function public.is_active_staff(uuid) is
  'True when this auth user is a member of staff who may act right now: has '
  'a profile, has a role, and is not invited/suspended/deactivated.';

create or replace function public.my_staff_rank()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(r.rank), 32767)::smallint
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.status = 'active';
$$;

comment on function public.my_staff_rank() is
  'Authority rank of the calling user, 32767 when they have none. Used by '
  'RLS so that policies do not have to join roles themselves.';

revoke all on function public.is_active_staff(uuid) from public;
revoke all on function public.my_staff_rank() from public;
grant execute on function public.is_active_staff(uuid) to authenticated;
grant execute on function public.my_staff_rank() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. History and audit tables
-- ---------------------------------------------------------------------------
--
-- Four of the tables in this database already keep assignment history, and
-- eleven keep status or price history. Staff, roles and grants kept none —
-- the three things whose change most needs explaining after the fact.
--
-- None of these tables cascade from profiles. A staff member who leaves must
-- not take their own audit trail with them, so the actor columns are
-- "on delete set null" and the subject column is a plain uuid.

create table if not exists public.staff_status_history (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null,
  from_status  text,
  to_status    text not null,
  reason       text,
  changed_by   uuid references public.profiles (id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index if not exists staff_status_history_profile_idx
  on public.staff_status_history (profile_id, changed_at desc);

create table if not exists public.staff_role_history (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null,
  from_role_id uuid references public.roles (id) on delete set null,
  to_role_id   uuid references public.roles (id) on delete set null,
  from_role_name text,
  to_role_name   text,
  reason       text,
  changed_by   uuid references public.profiles (id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index if not exists staff_role_history_profile_idx
  on public.staff_role_history (profile_id, changed_at desc);

-- Role names are denormalised above on purpose: Phase 8 permits renaming a
-- role, and "promoted to Manager" must keep saying what it said at the time.

create table if not exists public.role_permission_grant_history (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid,
  role_name   text,
  permission  text not null,
  action      text not null check (action in ('granted', 'revoked')),
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index if not exists role_permission_grant_history_role_idx
  on public.role_permission_grant_history (role_id, changed_at desc);

create table if not exists public.staff_audit_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,
  profile_id  uuid,
  actor_id    uuid references public.profiles (id) on delete set null,
  summary     text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists staff_audit_events_profile_idx
  on public.staff_audit_events (profile_id, created_at desc);
create index if not exists staff_audit_events_type_idx
  on public.staff_audit_events (event_type, created_at desc);

comment on table public.staff_audit_events is
  'Human-readable staff administration trail. Never stores passwords, '
  'password hashes, tokens or session secrets — see the check below.';

-- A column comment is advice. This is enforcement: the audit trail is the
-- most tempting place to "just log the payload", and the payload is exactly
-- where a token ends up.
do $no_secrets$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff_audit_events'::regclass
      and conname = 'staff_audit_events_no_secrets_check'
  ) then
    alter table public.staff_audit_events
      add constraint staff_audit_events_no_secrets_check
      check (
        not (detail ?| array['password', 'password_hash', 'token', 'access_token',
                             'refresh_token', 'secret', 'session_secret',
                             'encrypted_password', 'api_key'])
      );
  end if;
end
$no_secrets$;

-- ---------------------------------------------------------------------------
-- 6. Invitations
-- ---------------------------------------------------------------------------
--
-- An invitation holds no password and no password hash. Supabase Auth owns
-- credentials; this table owns the intent to create a staff account and the
-- role it was approved for. The token column stores a SHA-256 digest, never
-- the token itself, so a database reader cannot accept an invitation.

create table if not exists public.staff_invitations (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  full_name     text not null,
  role_id       uuid not null references public.roles (id) on delete restrict,
  phone         text,
  department    text,
  job_title     text,
  showroom_id   uuid,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash    text not null,
  expires_at    timestamptz not null,
  invited_by    uuid references public.profiles (id) on delete set null,
  accepted_by   uuid,
  accepted_at   timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  -- Honest record of whether the email actually went out. Nothing in this
  -- sprint may report "invitation sent" unless a provider confirmed it.
  delivery_state text not null default 'unsent'
                  check (delivery_state in ('unsent', 'sent', 'failed', 'not_configured')),
  delivery_error text,
  delivery_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists staff_invitations_pending_email_key
  on public.staff_invitations (lower(email))
  where status = 'pending';

create index if not exists staff_invitations_status_idx
  on public.staff_invitations (status, created_at desc);

comment on column public.staff_invitations.token_hash is
  'SHA-256 of the invitation token. The token itself is never stored.';
comment on column public.staff_invitations.delivery_state is
  'unsent | sent | failed | not_configured. The interface must show this '
  'verbatim rather than assuming an invitation reached anybody.';

-- ---------------------------------------------------------------------------
-- 7. Invariants, as triggers
-- ---------------------------------------------------------------------------

-- 7a. An active holder of the protected role must always exist.
--
-- This is the safeguard that has to work when everything else has been
-- bypassed: a service-role script, a psql session, a bulk action, a bug. It
-- needs no actor, so it is a trigger and it cannot be argued with.

create or replace function public.guard_last_protected_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_protected boolean;
  still_protected boolean;
  remaining integer;
begin
  select coalesce(r.protected, false) into was_protected
  from public.roles r where r.id = old.role_id;

  if not was_protected or old.status <> 'active' then
    return new;                      -- not an active protected-role holder
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(r.protected, false) into still_protected
    from public.roles r where r.id = new.role_id;

    if still_protected and new.status = 'active' then
      return new;                    -- nothing was taken away
    end if;
  end if;

  select count(*) into remaining
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where r.protected and p.status = 'active' and p.id <> old.id;

  if remaining = 0 then
    raise exception
      'This is the last active % account. Promote another person first, then change this one.',
      (select name from public.roles where id = old.role_id)
      using errcode = 'check_violation',
            hint = 'At least one active holder of the protected role must exist at all times.';
  end if;

  return new;
end
$$;

drop trigger if exists profiles_guard_last_protected_admin on public.profiles;
create trigger profiles_guard_last_protected_admin
  before update or delete on public.profiles
  for each row execute function public.guard_last_protected_admin();

-- 7b. Status moves only along legal edges, and staff codes never change.

create or replace function public.guard_profile_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.staff_code is not null and new.staff_code is distinct from old.staff_code then
    raise exception 'A staff code cannot be changed once issued (% → %).',
      old.staff_code, new.staff_code
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'invited'     and new.status in ('active', 'deactivated'))
      or (old.status = 'active'      and new.status in ('suspended', 'deactivated'))
      or (old.status = 'suspended'   and new.status in ('active', 'deactivated'))
      or (old.status = 'deactivated' and new.status in ('active'))
    ) then
      raise exception 'Staff status cannot move from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;

    new.activated_at   := case when new.status = 'active'      then now() else new.activated_at end;
    new.suspended_at   := case when new.status = 'suspended'   then now() else new.suspended_at end;
    new.deactivated_at := case when new.status = 'deactivated' then now() else new.deactivated_at end;

    insert into public.staff_status_history (profile_id, from_status, to_status, reason, changed_by)
    values (old.id, old.status, new.status, new.status_reason, coalesce(new.updated_by, auth.uid()));
  end if;

  if new.role_id is distinct from old.role_id then
    insert into public.staff_role_history
      (profile_id, from_role_id, to_role_id, from_role_name, to_role_name, reason, changed_by)
    values (
      old.id, old.role_id, new.role_id,
      (select name from public.roles where id = old.role_id),
      (select name from public.roles where id = new.role_id),
      new.status_reason, coalesce(new.updated_by, auth.uid())
    );
  end if;

  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists profiles_guard_lifecycle on public.profiles;
create trigger profiles_guard_lifecycle
  before update on public.profiles
  for each row execute function public.guard_profile_lifecycle();

-- 7c. Every grant change is recorded, however it was made.

create or replace function public.log_role_permission_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record := coalesce(new, old);
begin
  insert into public.role_permission_grant_history
    (role_id, role_name, permission, action, changed_by)
  values (
    r.role_id,
    (select name from public.roles where id = r.role_id),
    r.permission,
    case when tg_op = 'INSERT' then 'granted' else 'revoked' end,
    auth.uid()
  );
  return coalesce(new, old);
end
$$;

drop trigger if exists role_permission_grants_log on public.role_permission_grants;
create trigger role_permission_grants_log
  after insert or delete on public.role_permission_grants
  for each row execute function public.log_role_permission_grant();

-- ---------------------------------------------------------------------------
-- 8. Actor-aware operations
-- ---------------------------------------------------------------------------
--
-- These take the actor explicitly rather than reading auth.uid(), because the
-- server actions that call them use the service-role client and auth.uid() is
-- null there. Passing the actor is what makes the authority check possible at
-- all; the triggers above still run underneath as the backstop.

create or replace function public.staff_assign_role(
  p_actor    uuid,
  p_target   uuid,
  p_role_id  uuid,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_rank      smallint;
  actor_protected boolean;
  new_rank        smallint;
begin
  select r.rank, coalesce(r.protected, false)
    into actor_rank, actor_protected
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_actor and p.status = 'active';

  if actor_rank is null then
    raise exception 'Only an active member of staff can change roles.'
      using errcode = 'insufficient_privilege';
  end if;

  select rank into new_rank from public.roles where id = p_role_id;
  if new_rank is null then
    raise exception 'That role does not exist.' using errcode = 'foreign_key_violation';
  end if;

  -- Holders of the protected role may assign anything, including their own
  -- role — otherwise a second Super Admin could never be appointed. Everyone
  -- else may assign only strictly below themselves, which blocks both
  -- self-promotion and the appointment of a peer.
  if not actor_protected and new_rank <= actor_rank then
    raise exception 'You cannot assign a role at or above your own authority.'
      using errcode = 'insufficient_privilege',
            hint = 'Ask a Super Admin to make this change.';
  end if;

  update public.profiles
     set role_id       = p_role_id,
         status_reason = p_reason,
         updated_by    = p_actor
   where id = p_target;

  if not found then
    raise exception 'That staff member does not exist.' using errcode = 'no_data_found';
  end if;
end
$$;

create or replace function public.staff_set_status(
  p_actor   uuid,
  p_target  uuid,
  p_status  text,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_rank      smallint;
  actor_protected boolean;
  target_rank     smallint;
begin
  select r.rank, coalesce(r.protected, false)
    into actor_rank, actor_protected
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_actor and p.status = 'active';

  if actor_rank is null then
    raise exception 'Only an active member of staff can change staff status.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_actor = p_target and p_status <> 'active' then
    raise exception 'You cannot suspend or deactivate your own account.'
      using errcode = 'insufficient_privilege',
            hint = 'Ask another administrator to do this.';
  end if;

  select r.rank into target_rank
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_target;

  if not actor_protected and (target_rank is null or target_rank <= actor_rank) then
    raise exception 'You cannot change the status of an account at or above your own authority.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
     set status        = p_status,
         status_reason = p_reason,
         updated_by    = p_actor
   where id = p_target;

  if not found then
    raise exception 'That staff member does not exist.' using errcode = 'no_data_found';
  end if;
end
$$;

revoke all on function public.staff_assign_role(uuid, uuid, uuid, text) from public;
revoke all on function public.staff_set_status(uuid, uuid, text, text) from public;

comment on function public.staff_assign_role(uuid, uuid, uuid, text) is
  'Assigns a role after checking the actor outranks the role being given. '
  'Actor is explicit because service-role writes have no auth.uid().';

-- ---------------------------------------------------------------------------
-- 9. Row level security
-- ---------------------------------------------------------------------------

alter table public.staff_status_history          enable row level security;
alter table public.staff_role_history            enable row level security;
alter table public.role_permission_grant_history enable row level security;
alter table public.staff_audit_events            enable row level security;
alter table public.staff_invitations             enable row level security;

-- Read access for administrators; writes go through the functions above and
-- the triggers, both security definer, so no insert policy is needed. The
-- absence of an insert/update/delete policy is the point: a client cannot
-- forge or erase an audit row even with a valid session.

do $policies$
declare
  t text;
begin
  foreach t in array array[
    'staff_status_history', 'staff_role_history',
    'role_permission_grant_history', 'staff_audit_events', 'staff_invitations'
  ]
  loop
    execute format('drop policy if exists %I_admin_read on public.%I', t, t);
    execute format(
      'create policy %I_admin_read on public.%I for select to authenticated '
      'using (public.is_active_staff(auth.uid()) and public.my_staff_rank() <= 10)',
      t, t
    );
  end loop;
end
$policies$;

-- Staff may always read their own history, so that an account page can show
-- somebody why their own access changed without granting them admin sight of
-- everyone else's.
drop policy if exists staff_status_history_self_read on public.staff_status_history;
create policy staff_status_history_self_read on public.staff_status_history
  for select to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9b. Table grants, without which every policy above is dead
-- ---------------------------------------------------------------------------
--
-- Row level security filters rows the caller is allowed to reach. It does not
-- grant the right to reach the table in the first place — that is an ordinary
-- SQL privilege, and a new table has none for `authenticated` unless something
-- grants it.
--
-- Supabase projects usually carry a default privilege that grants new public
-- tables to anon and authenticated, so this may already be true. "Usually" is
-- not good enough for the audit trail: if the grant is absent, the policies
-- above never get a chance to run and the history panel renders EMPTY rather
-- than refused. Nobody reading a blank history can tell the difference between
-- "nothing has happened to this account" and "you cannot see what happened to
-- this account", and those are opposite facts.
--
-- So the grants are explicit, and they are SELECT only. Inserts and updates
-- stay with the service-role key, which is what makes an audit row impossible
-- to forge or erase from a browser even with a valid session.

grant select on public.staff_status_history          to authenticated;
grant select on public.staff_role_history            to authenticated;
grant select on public.role_permission_grant_history to authenticated;
grant select on public.staff_audit_events            to authenticated;
grant select on public.staff_invitations             to authenticated;

-- Said out loud, because a future migration that adds a convenience grant
-- would quietly undo the paragraph above.
revoke insert, update, delete on public.staff_status_history          from authenticated;
revoke insert, update, delete on public.staff_role_history            from authenticated;
revoke insert, update, delete on public.role_permission_grant_history from authenticated;
revoke insert, update, delete on public.staff_audit_events            from authenticated;
revoke insert, update, delete on public.staff_invitations             from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- 10. The one change to make by hand, and why it is not made here
-- ---------------------------------------------------------------------------
--
-- Suspension is enforced at three of the four gates by this file: the admin
-- layout, the new RLS policies, and anything that calls is_active_staff().
-- The fourth gate is get_my_permissions(), which eight permission helpers
-- call independently and which sits inside the RLS policies written in
-- sql/02 and sql/07. Until it also checks status, a suspended member of
-- staff keeps their permission keys and can still reach the modules those
-- keys unlock by calling a server action directly.
--
-- That function is not in this repository. To close the fourth gate, run:
--
--   select pg_get_functiondef('public.get_my_permissions()'::regprocedure);
--
-- and wrap the existing body:
--
--   create or replace function public.get_my_permissions()
--   returns text[] language sql stable security definer set search_path = public as $fn$
--     select case
--       when public.is_active_staff(auth.uid())
--       then ( <the existing select, unchanged> )
--       else '{}'::text[]
--     end;
--   $fn$;
--
-- One line in, one line out, and suspension then propagates to every policy
-- and every helper at once. I have not written it blind: the current body
-- may handle nulls or aggregate in a way a guess would break, and getting
-- this function wrong locks every member of staff out of every module.
--
-- ---------------------------------------------------------------------------
-- 11. Verification — read-only, safe to run any time
-- ---------------------------------------------------------------------------
--
-- 11a. Does a marketplace customer get a staff role?
--
-- This is the question from the Phase 1 audit, and it can be answered
-- without reading a single trigger definition. profiles.id and
-- customer_profiles.id both reference auth.users.id, so the same auth user
-- appearing in both tables IS the overlap. Any row returned here is a
-- customer account holding a staff role, and the admin gate is open to them.
--
--   select p.id, p.full_name, r.name as role_name, p.status
--   from public.profiles p
--   join public.customer_profiles c on c.id = p.id
--   left join public.roles r on r.id = p.role_id
--   where p.role_id is not null;
--
-- Expected: zero rows. If it returns rows, do NOT suspend them in bulk —
-- some may be genuine staff who also bought a car. Send me the output and
-- the role names and we will separate the two populations properly.
--
-- 11b. Lifecycle sanity.
--
--   select status, count(*) from public.profiles group by status;
--   select count(*) as staff_without_role from public.profiles where role_id is null;
--   select count(*) as missing_staff_code from public.profiles where staff_code is null;
--   select name, rank, protected from public.roles order by rank, name;
--
-- Expected after this file: every profile 'active' with a staff code,
-- exactly one protected role, and one row per role in the rank listing.
--
-- 11c. Is the last-Super-Admin guard actually armed?
--
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- Expected: profiles_guard_last_protected_admin and profiles_guard_lifecycle,
-- both with tgenabled = 'O'.
-- ---------------------------------------------------------------------------
