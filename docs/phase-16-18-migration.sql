-- ===========================================================================
-- Sprint 6 Phases 16-18
-- Run once in the Supabase SQL editor, after phase-15-migration.sql.
-- Idempotent and additive: nothing existing is dropped or replaced.
--
-- Phase 16 needs one new table (deal notes).
-- Phase 17 needs no schema change: every report reads existing views.
-- Phase 18 adds the two indexes the reports rely on.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- PHASE 16 — Deal notes
--
-- The same shape as lead_notes, so a note reads and behaves identically on
-- either side of the system. Notes are never hard-deleted: is_archived keeps
-- the record while removing it from the panel.
-- ---------------------------------------------------------------------------

create table if not exists public.sales_deal_notes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.sales_deals (id) on delete cascade,
  note_text   text not null check (length(btrim(note_text)) > 0),
  is_internal boolean not null default true,
  is_archived boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz
);

create index if not exists sales_deal_notes_deal_id_idx
  on public.sales_deal_notes (deal_id, created_at desc)
  where is_archived = false;

alter table public.sales_deal_notes enable row level security;

-- Default the author to the signed-in person, so the client never sets it.
create or replace function public.set_sales_deal_note_author()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists sales_deal_notes_set_author on public.sales_deal_notes;

create trigger sales_deal_notes_set_author
before insert on public.sales_deal_notes
for each row
execute function public.set_sales_deal_note_author();

-- Reading a note follows the same rule as reading its deal.
drop policy if exists sales_deal_notes_select on public.sales_deal_notes;
create policy sales_deal_notes_select
  on public.sales_deal_notes
  for select
  using (
    public.has_permission(auth.uid(), 'sales.view')
    and exists (select 1 from public.sales_deals d where d.id = deal_id)
  );

drop policy if exists sales_deal_notes_insert on public.sales_deal_notes;
create policy sales_deal_notes_insert
  on public.sales_deal_notes
  for insert
  with check (
    public.has_permission(auth.uid(), 'sales.edit')
    and exists (select 1 from public.sales_deals d where d.id = deal_id)
  );

-- Your own note, or anyone's if you may assign deals (the manager-level right).
drop policy if exists sales_deal_notes_update on public.sales_deal_notes;
create policy sales_deal_notes_update
  on public.sales_deal_notes
  for update
  using (
    public.has_permission(auth.uid(), 'sales.edit')
    and (created_by = auth.uid() or public.has_permission(auth.uid(), 'sales.assign'))
  );

-- ---------------------------------------------------------------------------
-- PHASE 18 — Indexes the reports and audit reads depend on
-- ---------------------------------------------------------------------------

create index if not exists sales_deals_completed_at_idx
  on public.sales_deals (completed_at desc)
  where completed_at is not null;

create index if not exists sales_activity_deal_id_changed_at_idx
  on public.sales_activity (deal_id, changed_at desc);

commit;