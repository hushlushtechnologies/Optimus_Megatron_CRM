drop schema if exists public cascade; create schema public;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;
create schema if not exists auth;
create table public.roles (id uuid primary key default gen_random_uuid(), name text unique);
create table public.profiles (id uuid primary key default gen_random_uuid(), full_name text, role_id uuid references public.roles(id));
create table public.role_permission_grants (role_id uuid references public.roles(id), permission text, primary key (role_id, permission));
create table public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid, type text, title text, description text, entity_type text, entity_id uuid, actor_id uuid, dedupe_key text unique, read_at timestamptz, created_at timestamptz default now());
insert into public.roles (name) values ('Sales Manager'), ('Salesperson'), ('Accountant');
insert into public.profiles (full_name, role_id) values
  ('Manager One', (select id from public.roles where name='Sales Manager')),
  ('Accountant One', (select id from public.roles where name='Accountant')),
  ('Sales One', (select id from public.roles where name='Salesperson'));
insert into public.role_permission_grants (role_id, permission) values
  ((select id from public.roles where name='Sales Manager'), 'payments.verify'),
  ((select id from public.roles where name='Accountant'), 'payments.verify'),
  ((select id from public.roles where name='Salesperson'), 'payments.record');
create or replace function auth.uid() returns uuid language sql stable as $$ select (select id from public.profiles where full_name='Sales One') $$;
