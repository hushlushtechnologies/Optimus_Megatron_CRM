-- ===========================================================================
-- SPRINT 7 · PHASE 1 — Enquiry architecture
--
-- Extends the Sprint 6 enquiry module into the five-category system.
-- Nothing is dropped and no existing row is lost: the Sprint 6 columns stay
-- where they are, their values are migrated into the new vocabulary, and the
-- type-specific fields arrive in tables of their own.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Vocabulary: types, sources, statuses
--
-- Lookup tables rather than check constraints, because Phase 2 has to make
-- these editable from a settings screen. They follow the same shape as the
-- lookup tables already in the app (lead_stages, customer_sources).
--
-- is_active is what retires a value: an old row keeps pointing at it, so
-- history stays readable, but new forms stop offering it.
-- ---------------------------------------------------------------------------

create table if not exists public.enquiry_types (
  key text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.enquiry_sources (
  key text primary key,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.enquiry_statuses (
  key text primary key,
  label text not null,
  -- How the badge is coloured. Matches the Badge component's tones.
  tone text not null default 'neutral'
    check (tone in ('info', 'warning', 'success', 'danger', 'neutral')),
  -- is_open drives the "needs attention" queue and the open/closed counts.
  is_open boolean not null default true,
  -- is_terminal means nothing follows it, so the workflow stops offering moves.
  is_terminal boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into public.enquiry_types (key, label, description, sort_order) values
  ('Finance',    'Finance',     'Help arranging finance on a vehicle.',            10),
  ('Sell My Car','Sell My Car', 'The customer wants to sell us their vehicle.',    20),
  ('Trade-In',   'Trade-In',    'Trading an owned vehicle against one of ours.',   30),
  ('Dream Car',  'Dream Car',   'A vehicle we do not currently have in stock.',    40),
  ('General',    'General',     'Questions about a vehicle, warranty or paperwork.', 50)
on conflict (key) do nothing;

insert into public.enquiry_sources (key, label, sort_order) values
  ('Website',   'Website',    10),
  ('Instagram', 'Instagram',  20),
  ('Facebook',  'Facebook',   30),
  ('TikTok',    'TikTok',     40),
  ('Google',    'Google',     50),
  ('WhatsApp',  'WhatsApp',   60),
  ('Phone Call','Phone Call', 70),
  ('Walk-In',   'Walk-In',    80),
  ('Referral',  'Referral',   90),
  ('Staff',     'Staff',     100),
  ('Email',     'Email',     110),
  ('Other',     'Other',     120)
on conflict (key) do nothing;

-- Sprint 6 values kept so existing rows stay valid, but retired from the forms.
insert into public.enquiry_sources (key, label, sort_order, is_active) values
  ('Phone',   'Phone (old)',   900, false),
  ('Walk-in', 'Walk-in (old)', 910, false),
  ('Social',  'Social (old)',  920, false)
on conflict (key) do nothing;

insert into public.enquiry_statuses (key, label, tone, is_open, is_terminal, sort_order) values
  ('New',                  'New',                  'info',    true,  false, 10),
  ('Assigned',             'Assigned',             'info',    true,  false, 20),
  ('In Review',            'In Review',            'warning', true,  false, 30),
  ('Waiting for Customer', 'Waiting for Customer', 'warning', true,  false, 40),
  ('Follow-Up',            'Follow-Up',            'warning', true,  false, 50),
  ('Offer Sent',           'Offer Sent',           'info',    true,  false, 60),
  ('Completed',            'Completed',            'success', false, true,  70),
  ('Converted',            'Converted',            'success', false, true,  80),
  ('Rejected',             'Rejected',             'danger',  false, true,  90),
  ('Cancelled',            'Cancelled',            'neutral', false, true, 100),
  ('Spam',                 'Spam',                 'danger',  false, true, 110)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Which status may follow which
--
-- A row per allowed move. enquiry_type null means "for every type", so the
-- common path is stated once and only the exceptions are repeated.
--
-- This is data, not code, so Phase 2 can edit a workflow without a deploy.
-- ---------------------------------------------------------------------------

create table if not exists public.enquiry_status_transitions (
  id uuid primary key default gen_random_uuid(),
  from_status text not null references public.enquiry_statuses (key),
  to_status text not null references public.enquiry_statuses (key),
  -- null means "for every enquiry type".
  enquiry_type text references public.enquiry_types (key),
  constraint enquiry_status_transitions_no_self check (from_status <> to_status)
);

/*
 * Two partial unique indexes rather than one composite key, because a
 * nullable column cannot sit in a primary key — and null is exactly how
 * "applies to every type" is expressed here.
 */
create unique index if not exists enquiry_status_transitions_any_type_idx
  on public.enquiry_status_transitions (from_status, to_status)
  where enquiry_type is null;

create unique index if not exists enquiry_status_transitions_typed_idx
  on public.enquiry_status_transitions (from_status, to_status, enquiry_type)
  where enquiry_type is not null;

insert into public.enquiry_status_transitions (from_status, to_status, enquiry_type)
select f, t, null
from (values
  ('New','Assigned'), ('New','In Review'), ('New','Spam'), ('New','Rejected'), ('New','Cancelled'),
  ('Assigned','In Review'), ('Assigned','Waiting for Customer'), ('Assigned','Follow-Up'),
  ('Assigned','Cancelled'), ('Assigned','Spam'),
  ('In Review','Waiting for Customer'), ('In Review','Follow-Up'), ('In Review','Completed'),
  ('In Review','Converted'), ('In Review','Rejected'), ('In Review','Cancelled'),
  ('Waiting for Customer','Follow-Up'), ('Waiting for Customer','In Review'),
  ('Waiting for Customer','Completed'), ('Waiting for Customer','Cancelled'),
  ('Follow-Up','In Review'), ('Follow-Up','Waiting for Customer'),
  ('Follow-Up','Completed'), ('Follow-Up','Converted'), ('Follow-Up','Cancelled'),
  ('Spam','New'), ('Cancelled','New'), ('Rejected','New')
) as v(f, t)
where not exists (
  select 1 from public.enquiry_status_transitions x
  where x.from_status = v.f and x.to_status = v.t and x.enquiry_type is null
);

-- Offer Sent only belongs to the two types where we make an offer on a car.
insert into public.enquiry_status_transitions (from_status, to_status, enquiry_type)
select f, t, ty
from (values
  ('In Review','Offer Sent','Sell My Car'),
  ('In Review','Offer Sent','Trade-In'),
  ('Offer Sent','Completed','Sell My Car'),
  ('Offer Sent','Completed','Trade-In'),
  ('Offer Sent','Rejected','Sell My Car'),
  ('Offer Sent','Rejected','Trade-In'),
  ('Offer Sent','Follow-Up','Sell My Car'),
  ('Offer Sent','Follow-Up','Trade-In')
) as v(f, t, ty)
where not exists (
  select 1 from public.enquiry_status_transitions x
  where x.from_status = v.f and x.to_status = v.t and x.enquiry_type = v.ty
);

commit;

begin;

-- ---------------------------------------------------------------------------
-- 3. The enquiries table grows up
--
-- Everything every enquiry has, regardless of type, lives here. Type-specific
-- fields go in the tables in section 4 — see the note there for why.
-- ---------------------------------------------------------------------------

alter table public.enquiries
  add column if not exists subject text,
  add column if not exists priority text not null default 'Normal',
  add column if not exists general_category text,
  add column if not exists location_id uuid references public.locations (id) on delete set null,
  add column if not exists deal_id uuid references public.sales_deals (id) on delete set null,
  add column if not exists test_drive_id uuid references public.test_drives (id) on delete set null,
  add column if not exists reservation_id uuid references public.vehicle_reservations (id) on delete set null,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null,
  add column if not exists version integer not null default 1;

alter table public.enquiries
  drop constraint if exists enquiries_priority_check;

alter table public.enquiries
  add constraint enquiries_priority_check
  check (priority in ('Urgent', 'High', 'Normal', 'Low'));

/*
 * A stored rank so "sort by priority" is an index scan rather than a CASE
 * evaluated over every row. Urgent first, because that is the only order
 * anyone ever wants.
 */
alter table public.enquiries
  add column if not exists priority_rank smallint
  generated always as (
    case priority
      when 'Urgent' then 1
      when 'High' then 2
      when 'Normal' then 3
      else 4
    end
  ) stored;

/*
 * general_category only means something for a General enquiry. The guard
 * stops a Finance enquiry quietly carrying "Warranty Question".
 */
alter table public.enquiries
  drop constraint if exists enquiries_general_category_check;

alter table public.enquiries
  add constraint enquiries_general_category_check
  check (
    general_category is null
    or (
      enquiry_type = 'General'
      and general_category in (
        'Vehicle Question', 'Showroom Information', 'Availability',
        'Warranty', 'Documents', 'Other'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3b. Migrate the Sprint 6 vocabulary into the Sprint 7 one
--
-- Done before the foreign keys are added, so nothing is left pointing at a
-- value that no longer exists.
-- ---------------------------------------------------------------------------

alter table public.enquiries drop constraint if exists enquiries_enquiry_type_check;
alter table public.enquiries drop constraint if exists enquiries_source_check;
alter table public.enquiries drop constraint if exists enquiries_status_check;

-- Vehicle, Test Drive and Service were Sprint 6 labels for what Sprint 7
-- calls a General enquiry with a category. The detail is kept, not dropped.
update public.enquiries
set general_category = case enquiry_type
      when 'Vehicle' then 'Vehicle Question'
      when 'Test Drive' then 'Availability'
      when 'Service' then 'Other'
    end,
    enquiry_type = 'General'
where enquiry_type in ('Vehicle', 'Test Drive', 'Service');

update public.enquiries set source = 'Phone Call' where source = 'Phone';
update public.enquiries set source = 'Walk-In' where source = 'Walk-in';

-- Sprint 6's "Closed" meant "dealt with, nothing further" — Cancelled here.
update public.enquiries set status = 'Cancelled' where status = 'Closed';

-- Anything unrecognised is parked at New rather than blocking the migration.
update public.enquiries e set enquiry_type = 'General'
where not exists (select 1 from public.enquiry_types t where t.key = e.enquiry_type);

update public.enquiries e set source = 'Other'
where not exists (select 1 from public.enquiry_sources s where s.key = e.source);

update public.enquiries e set status = 'New'
where not exists (select 1 from public.enquiry_statuses s where s.key = e.status);

alter table public.enquiries drop constraint if exists enquiries_enquiry_type_fkey;
alter table public.enquiries drop constraint if exists enquiries_source_fkey;
alter table public.enquiries drop constraint if exists enquiries_status_fkey;

alter table public.enquiries
  add constraint enquiries_enquiry_type_fkey
    foreign key (enquiry_type) references public.enquiry_types (key),
  add constraint enquiries_source_fkey
    foreign key (source) references public.enquiry_sources (key),
  add constraint enquiries_status_fkey
    foreign key (status) references public.enquiry_statuses (key);

-- ---------------------------------------------------------------------------
-- 3c. Human-readable identifier
--
-- OMC-ENQ-000001. The uuid stays the real key; this is the number people
-- read out on the phone, and it never changes once issued.
-- ---------------------------------------------------------------------------

create or replace function public.next_enquiry_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'OMC-ENQ-' || lpad(nextval('public.enquiry_number_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- 3d. Indexes for the list screen
-- ---------------------------------------------------------------------------

create index if not exists enquiries_type_status_idx
  on public.enquiries (enquiry_type, status, created_at desc) where archived_at is null;

create index if not exists enquiries_priority_idx
  on public.enquiries (priority_rank, created_at desc) where archived_at is null;

create index if not exists enquiries_last_activity_idx
  on public.enquiries (last_activity_at desc) where archived_at is null;

create index if not exists enquiries_next_follow_up_idx
  on public.enquiries (next_follow_up_at) where next_follow_up_at is not null and archived_at is null;

create index if not exists enquiries_location_idx
  on public.enquiries (location_id) where location_id is not null;

create index if not exists enquiries_archived_idx
  on public.enquiries (archived_at) where archived_at is not null;

commit;

begin;

-- ---------------------------------------------------------------------------
-- 4. Type-specific detail
--
-- Why separate tables rather than more columns on enquiries:
-- the four typed categories carry 10-16 fields each that mean nothing to the
-- other types. Put together they would make a ~70-column table where any one
-- row is 80% null, nothing can be marked NOT NULL, and every list query reads
-- pages it does not need.
--
-- Why only three tables for five types:
--   * Sell My Car and Trade-In both describe a car the CUSTOMER owns. The
--     fields are the same — what differs is what we would do with it — so one
--     table carries both, separated by `role`.
--   * General needs one extra field, its category, which lives on enquiries
--     as a guarded column. A whole table and a join for one value is worse.
-- ---------------------------------------------------------------------------

-- ---- 4a. The customer's own vehicle: Sell My Car and Trade-In ----

create table if not exists public.enquiry_customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,

  -- 'selling'  = Sell My Car, we may buy it
  -- 'trade_in' = Trade-In, it comes off the price of one of ours
  role text not null check (role in ('selling', 'trade_in')),

  -- The brand is a lookup where we know it, free text where we do not. A
  -- customer's car is often a make we have never stocked.
  brand_id uuid references public.brands (id) on delete set null,
  brand_other text,
  model text,
  variant text,

  year smallint check (year is null or (year between 1950 and 2100)),
  mileage_km integer check (mileage_km is null or mileage_km >= 0),

  registration_emirate text check (
    registration_emirate is null or registration_emirate in (
      'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman',
      'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain'
    )
  ),

  spec text check (
    spec is null or spec in ('GCC', 'Import', 'Japanese', 'American', 'European', 'Other')
  ),

  exterior_color text,
  interior_color text,

  condition text check (
    condition is null or condition in ('Excellent', 'Very Good', 'Good', 'Fair', 'Needs Work')
  ),

  -- Declarations, not findings. The customer told us this; nobody has looked
  -- at the car yet. Phase 17's valuation fields below are where our own
  -- assessment goes, kept deliberately apart.
  has_accident_history boolean,
  accident_notes text,
  has_service_history boolean,
  service_notes text,

  asking_price numeric(12, 2) check (asking_price is null or asking_price >= 0),
  location_id uuid references public.locations (id) on delete set null,
  description text,

  -- Valuation. Filled in by us, after a look at the car.
  estimated_value numeric(12, 2) check (estimated_value is null or estimated_value >= 0),
  valuation_notes text,
  evaluated_by uuid references public.profiles (id) on delete set null,
  evaluated_at timestamptz,
  proposed_offer numeric(12, 2) check (proposed_offer is null or proposed_offer >= 0),
  offer_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One vehicle per role per enquiry: a trade-in has exactly one car coming in.
  constraint enquiry_customer_vehicles_one_per_role unique (enquiry_id, role),
  -- A brand has to come from somewhere, even if only as typed text.
  constraint enquiry_customer_vehicles_brand_present
    check (brand_id is not null or coalesce(brand_other, '') <> '')
);

create index if not exists enquiry_customer_vehicles_enquiry_idx
  on public.enquiry_customer_vehicles (enquiry_id);

create index if not exists enquiry_customer_vehicles_brand_idx
  on public.enquiry_customer_vehicles (brand_id) where brand_id is not null;

-- ---- 4b. Finance ----

create table if not exists public.enquiry_finance_details (
  enquiry_id uuid primary key references public.enquiries (id) on delete cascade,

  -- The vehicle itself is enquiries.car_id. This is the price the conversation
  -- is built on, which can differ from today's listed price.
  vehicle_price numeric(12, 2) check (vehicle_price is null or vehicle_price >= 0),
  down_payment numeric(12, 2) check (down_payment is null or down_payment >= 0),
  term_months smallint check (term_months is null or term_months between 6 and 120),
  monthly_budget numeric(12, 2) check (monthly_budget is null or monthly_budget >= 0),

  employment_type text check (
    employment_type is null or employment_type in
      ('Salaried', 'Self-Employed', 'Business Owner', 'Other')
  ),

  bank_preference text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.enquiry_finance_details is
  'A request for help arranging finance. Not an application, and never an approval. No income figures, documents or identification are held here.';

-- ---- 4c. Dream Car ----

create table if not exists public.enquiry_dream_car_details (
  enquiry_id uuid primary key references public.enquiries (id) on delete cascade,

  brand_id uuid references public.brands (id) on delete set null,
  brand_other text,
  model text,
  variant text,

  year_from smallint check (year_from is null or (year_from between 1950 and 2100)),
  year_to smallint check (year_to is null or (year_to between 1950 and 2100)),

  budget_min numeric(12, 2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(12, 2) check (budget_max is null or budget_max >= 0),

  exterior_color text,
  interior_color text,
  max_mileage_km integer check (max_mileage_km is null or max_mileage_km >= 0),
  fuel_type text,
  transmission text,
  spec text,
  features text,

  timeline text check (
    timeline is null or timeline in
      ('Immediately', '1-3 months', '3-6 months', '6+ months', 'Just looking')
  ),

  notes text,

  -- Phase 17: a person links a car they believe fits. Never written by code.
  matched_car_id uuid references public.cars (id) on delete set null,
  matched_by uuid references public.profiles (id) on delete set null,
  matched_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Ranges that run backwards return nothing and read as a bug, not a typo.
  constraint enquiry_dream_car_year_range check (
    year_from is null or year_to is null or year_from <= year_to),
  constraint enquiry_dream_car_budget_range check (
    budget_min is null or budget_max is null or budget_min <= budget_max)
);

create index if not exists enquiry_dream_car_brand_idx
  on public.enquiry_dream_car_details (brand_id) where brand_id is not null;

create index if not exists enquiry_dream_car_matched_idx
  on public.enquiry_dream_car_details (matched_car_id) where matched_car_id is not null;

commit;

begin;

-- ---------------------------------------------------------------------------
-- 5. Working on an enquiry: notes, follow-ups, history, media
--
-- Each of these mirrors a table the app already has for leads, test drives or
-- deals, column for column where it makes sense, so the code that reads them
-- looks like the code your team already knows.
-- ---------------------------------------------------------------------------

-- ---- 5a. Notes — mirrors lead_notes ----

create table if not exists public.enquiry_notes (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  note_text text not null check (btrim(note_text) <> ''),
  is_internal boolean not null default true,
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz
);

create index if not exists enquiry_notes_enquiry_idx
  on public.enquiry_notes (enquiry_id, created_at desc) where is_archived = false;

-- ---- 5b. Follow-ups — mirrors lead_follow_ups ----

create table if not exists public.enquiry_follow_ups (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,

  type text not null default 'General Follow-Up' check (type in (
    'Phone Call', 'WhatsApp', 'Email', 'Showroom Visit',
    'Vehicle Inspection', 'General Follow-Up'
  )),

  status text not null default 'Scheduled' check (status in (
    'Scheduled', 'Completed', 'Missed', 'Cancelled', 'Rescheduled'
  )),

  scheduled_at timestamptz not null,
  assigned_to uuid references public.profiles (id) on delete set null,
  notes text,
  reminder_minutes_before integer check (
    reminder_minutes_before is null or reminder_minutes_before between 0 and 10080),

  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  outcome_notes text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enquiry_follow_ups_enquiry_idx
  on public.enquiry_follow_ups (enquiry_id, scheduled_at desc);

create index if not exists enquiry_follow_ups_due_idx
  on public.enquiry_follow_ups (scheduled_at) where status = 'Scheduled';

create index if not exists enquiry_follow_ups_assigned_idx
  on public.enquiry_follow_ups (assigned_to, scheduled_at) where status = 'Scheduled';

-- ---- 5c. Assignment history — mirrors lead_staff_assignment_history ----

create table if not exists public.enquiry_staff_assignment_history (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  previous_staff_id uuid references public.profiles (id) on delete set null,
  new_staff_id uuid references public.profiles (id) on delete set null,
  assigned_by uuid references public.profiles (id) on delete set null,
  reason text,
  assigned_at timestamptz not null default now()
);

create index if not exists enquiry_staff_assignment_history_idx
  on public.enquiry_staff_assignment_history (enquiry_id, assigned_at desc);

-- ---- 5d. Status history — mirrors sales_deal_status_history ----

create table if not exists public.enquiry_status_history (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  from_status text references public.enquiry_statuses (key),
  to_status text not null references public.enquiry_statuses (key),
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists enquiry_status_history_idx
  on public.enquiry_status_history (enquiry_id, changed_at desc);

-- ---- 5e. Media — mirrors car_media, but private ----

create table if not exists public.enquiry_media (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,

  -- Photos of a trade-in belong to that specific car, not to the enquiry in
  -- general. Null for anything that is simply attached to the enquiry.
  customer_vehicle_id uuid references public.enquiry_customer_vehicles (id) on delete cascade,

  media_type text not null default 'image' check (media_type in ('image', 'document')),

  /*
   * A storage path, not a public URL — unlike car_media. These are photos of
   * a member of the public's own car, often with a plate in frame, so the
   * bucket is private and the app hands out short-lived signed URLs.
   */
  storage_path text not null,
  title text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  sort_order integer not null default 0,

  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists enquiry_media_enquiry_idx
  on public.enquiry_media (enquiry_id, sort_order);

create index if not exists enquiry_media_vehicle_idx
  on public.enquiry_media (customer_vehicle_id) where customer_vehicle_id is not null;

commit;

begin;

-- ---------------------------------------------------------------------------
-- 6. Triggers: keep the derived columns honest
--
-- last_activity_at and next_follow_up_at are denormalised onto enquiries so
-- the list can sort forty thousand rows by them without a join. Denormalised
-- data is only safe if the database maintains it, never the application.
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Every change to an enquiry bumps its version. The app sends the version it
-- last read; a mismatch is what produces "this enquiry was changed by another
-- staff member" instead of one person silently overwriting another.
create or replace function public.touch_enquiry()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  /*
   * Columns the database maintains by itself — a change to one of these is
   * not somebody editing the enquiry.
   *
   * priority_rank is here because it is a stored generated column: inside a
   * BEFORE trigger it is still null on NEW, so it always looks changed.
   */
  v_derived text[] := array[
    'version', 'updated_at', 'last_activity_at', 'next_follow_up_at', 'priority_rank'
  ];
begin
  new.updated_at := now();

  /*
   * version only moves when a person changed something. Without this, adding
   * a note would bump the version through the activity trigger, and the next
   * save would be refused as "changed by another staff member" when nobody
   * had touched it.
   */
  if (to_jsonb(new) - v_derived) is distinct from (to_jsonb(old) - v_derived) then
    new.version := coalesce(old.version, 0) + 1;
  else
    new.version := old.version;
  end if;

  return new;
end;
$$;

create or replace function public.bump_enquiry_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.enquiry_id, old.enquiry_id);
begin
  update public.enquiries set last_activity_at = now() where id = v_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_next_follow_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.enquiry_id, old.enquiry_id);
begin
  update public.enquiries e
  set next_follow_up_at = (
        select min(f.scheduled_at)
        from public.enquiry_follow_ups f
        where f.enquiry_id = v_id and f.status = 'Scheduled'
      ),
      last_activity_at = now()
  where e.id = v_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.log_enquiry_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.enquiry_status_history (enquiry_id, from_status, to_status, reason, changed_by)
    values (new.id, old.status, new.status, new.close_reason, auth.uid());
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.enquiry_staff_assignment_history
      (enquiry_id, previous_staff_id, new_staff_id, assigned_by)
    values (new.id, old.assigned_to, new.assigned_to, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists enquiries_touch on public.enquiries;
create trigger enquiries_touch before update on public.enquiries
for each row execute function public.touch_enquiry();

drop trigger if exists enquiries_log_history on public.enquiries;
create trigger enquiries_log_history after update on public.enquiries
for each row execute function public.log_enquiry_status_change();

drop trigger if exists enquiry_notes_touch on public.enquiry_notes;
create trigger enquiry_notes_touch after insert on public.enquiry_notes
for each row execute function public.bump_enquiry_activity();

drop trigger if exists enquiry_media_touch on public.enquiry_media;
create trigger enquiry_media_touch after insert on public.enquiry_media
for each row execute function public.bump_enquiry_activity();

drop trigger if exists enquiry_follow_ups_sync on public.enquiry_follow_ups;
create trigger enquiry_follow_ups_sync after insert or update or delete on public.enquiry_follow_ups
for each row execute function public.sync_next_follow_up();

drop trigger if exists enquiry_follow_ups_touch_updated on public.enquiry_follow_ups;
create trigger enquiry_follow_ups_touch_updated before update on public.enquiry_follow_ups
for each row execute function public.touch_updated_at();

drop trigger if exists enquiry_customer_vehicles_touch on public.enquiry_customer_vehicles;
create trigger enquiry_customer_vehicles_touch before update on public.enquiry_customer_vehicles
for each row execute function public.touch_updated_at();

drop trigger if exists enquiry_finance_details_touch on public.enquiry_finance_details;
create trigger enquiry_finance_details_touch before update on public.enquiry_finance_details
for each row execute function public.touch_updated_at();

drop trigger if exists enquiry_dream_car_details_touch on public.enquiry_dream_car_details;
create trigger enquiry_dream_car_details_touch before update on public.enquiry_dream_car_details
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Permissions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (key, module, label, description, sort_order)
select v.key, 'Enquiries', v.label, v.description, v.sort_order
from (values
  ('enquiries.assign',  'Assign enquiries',
   'Assign and reassign enquiries to other staff.', 40),
  ('enquiries.export',  'Export enquiries',
   'Download enquiry lists as Excel or PDF.', 50),
  ('enquiries.valuate', 'Value vehicles',
   'Record valuations and offers on sell and trade-in requests.', 60)
) as v (key, label, description, sort_order)
where not exists (select 1 from public.app_permissions p where p.key = v.key);

-- Anyone who can already work on enquiries gets the three new abilities, so
-- nobody loses access the moment this migration lands.
insert into public.role_permission_grants (role_id, permission)
select g.role_id, v.key
from public.role_permission_grants g
cross join (values ('enquiries.assign'), ('enquiries.export'), ('enquiries.valuate')) as v (key)
where g.permission = 'enquiries.manage'
  and not exists (
    select 1 from public.role_permission_grants x
    where x.role_id = g.role_id and x.permission = v.key
  );

-- ---------------------------------------------------------------------------
-- 8. Row-level security
--
-- The lookup tables are readable by any signed-in user because the forms need
-- them. They have no write policy at all: until Phase 2 builds a settings
-- screen, they change only through SQL.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'enquiry_types', 'enquiry_sources', 'enquiry_statuses', 'enquiry_status_transitions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
  end loop;

  -- Everything that belongs to an enquiry follows the enquiry's own rules.
  foreach t in array array[
    'enquiry_customer_vehicles', 'enquiry_finance_details', 'enquiry_dream_car_details',
    'enquiry_notes', 'enquiry_follow_ups', 'enquiry_media',
    'enquiry_staff_assignment_history', 'enquiry_status_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (public.has_permission(auth.uid(), ''enquiries.view''))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.has_permission(auth.uid(), ''enquiries.manage''))',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (public.has_permission(auth.uid(), ''enquiries.manage''))',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (public.has_permission(auth.uid(), ''enquiries.delete''))',
      t || '_delete', t);
  end loop;
end;
$$;

/*
 * The two history tables are written only by triggers, which run as the
 * function owner. Taking the insert policy away means nothing can forge a
 * history entry — not even someone holding enquiries.manage.
 */
drop policy if exists enquiry_status_history_insert on public.enquiry_status_history;
drop policy if exists enquiry_status_history_update on public.enquiry_status_history;
drop policy if exists enquiry_status_history_delete on public.enquiry_status_history;
drop policy if exists enquiry_staff_assignment_history_insert on public.enquiry_staff_assignment_history;
drop policy if exists enquiry_staff_assignment_history_update on public.enquiry_staff_assignment_history;
drop policy if exists enquiry_staff_assignment_history_delete on public.enquiry_staff_assignment_history;

commit;

begin;

-- ---------------------------------------------------------------------------
-- 9. The list view
--
-- One place resolves every name and label, so no screen has to join five
-- tables to show a row. security_invoker means the reader's own row-level
-- security applies: the view can never show more than the table would.
-- ---------------------------------------------------------------------------

drop view if exists public.enquiry_list;

create view public.enquiry_list
with (security_invoker = true)
as
select
  e.id,
  e.enquiry_number,
  e.status,
  st.label as status_label,
  st.tone as status_tone,
  st.is_open as status_is_open,
  e.enquiry_type,
  ty.label as type_label,
  e.general_category,
  e.source,
  e.priority,
  e.priority_rank,

  e.subject,
  e.full_name,
  e.email,
  e.phone,
  e.preferred_contact,
  e.message,

  e.car_id,
  e.vehicle_text,
  c.display_title as vehicle_title,
  c.stock_id,

  e.location_id,
  loc.name as location_name,

  e.page_url,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,

  e.assigned_to,
  coalesce(assignee.full_name, '') as assigned_to_name,

  e.customer_id,
  cust.full_name as customer_name,
  cust.customer_number,

  e.lead_id,
  l.lead_number,
  e.deal_id,
  e.test_drive_id,
  e.reservation_id,

  e.converted_at,
  e.closed_at,
  e.close_reason,
  e.archived_at,

  e.created_by,
  coalesce(author.full_name, '') as created_by_name,
  e.created_at,
  e.updated_at,
  e.last_activity_at,
  e.next_follow_up_at,
  e.version
from public.enquiries e
left join public.enquiry_statuses st on st.key = e.status
left join public.enquiry_types ty on ty.key = e.enquiry_type
left join public.cars c on c.id = e.car_id
left join public.locations loc on loc.id = e.location_id
left join public.profiles assignee on assignee.id = e.assigned_to
left join public.profiles author on author.id = e.created_by
left join public.customer_profiles cust on cust.id = e.customer_id
left join public.leads l on l.id = e.lead_id;

comment on view public.enquiry_list is
  'Enquiries with status, type, vehicle, staff, customer and lead names resolved.';

-- ---------------------------------------------------------------------------
-- 10. Private media bucket
--
-- Photos of a customer's own car, often with a number plate in frame. The
-- bucket is private; the app issues short-lived signed URLs. Skipped quietly
-- if this database has no storage schema.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'No storage schema here, skipping the enquiry-media bucket.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'enquiry-media', 'enquiry-media', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do nothing;

  execute $p$drop policy if exists enquiry_media_read on storage.objects$p$;
  execute $p$
    create policy enquiry_media_read on storage.objects for select
    using (bucket_id = 'enquiry-media' and public.has_permission(auth.uid(), 'enquiries.view'))
  $p$;

  execute $p$drop policy if exists enquiry_media_write on storage.objects$p$;
  execute $p$
    create policy enquiry_media_write on storage.objects for insert
    with check (bucket_id = 'enquiry-media' and public.has_permission(auth.uid(), 'enquiries.manage'))
  $p$;

  execute $p$drop policy if exists enquiry_media_remove on storage.objects$p$;
  execute $p$
    create policy enquiry_media_remove on storage.objects for delete
    using (bucket_id = 'enquiry-media' and public.has_permission(auth.uid(), 'enquiries.manage'))
  $p$;
end;
$$;

commit;
