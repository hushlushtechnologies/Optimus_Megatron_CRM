-- A stand-in for the live schema, built only from what the repo's code proves
-- exists. Enough to answer one question: does a field-scoped UPDATE leave the
-- columns it does not name alone, and does the history trigger record only
-- what actually changed?

drop schema if exists public cascade;
create schema public;

create table public.sales_settings (
  id                                 boolean primary key default true,
  currency                           text    not null default 'AED',
  discount_auto_approve_percent      numeric not null default 5,
  fees_enabled                       boolean not null default true,
  reservation_default_days           integer not null default 3,
  reservation_max_days               integer not null default 14,
  reservation_deposit_mode           text    not null default 'fixed',
  reservation_deposit_value          numeric not null default 5000,
  confirm_min_deposit_percent        numeric not null default 20,
  payments_require_separate_verifier boolean not null default true,
  vat_rate_percent                   numeric,
  updated_by                         uuid,
  updated_at                         timestamptz not null default now()
);

insert into public.sales_settings (id) values (true);

create table public.sales_settings_history (
  id         bigserial primary key,
  entity     text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);

-- A row-wide diff trigger, which is the shape the app's history util expects:
-- describeSettingsChange iterates the keys of new_values and skips any whose
-- old value matches. Whatever the live trigger stores, an UPDATE that touches
-- four columns leaves the other six identical in OLD and NEW, so only real
-- changes can ever be described.
create or replace function public.log_settings_change() returns trigger as $$
begin
  insert into public.sales_settings_history (entity, changed_by, old_values, new_values)
  values ('settings', new.updated_by, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$ language plpgsql;

create trigger settings_history
  after update on public.sales_settings
  for each row execute function public.log_settings_change();

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0
);

insert into public.locations (name, sort_order) values
  ('Al Quoz Showroom', 10),
  ('Deira Showroom', 20);
