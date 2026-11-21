-- ---------------------------------------------------------------------------
-- Sprint 8 — Phase 23
-- Let notifications record the eight events this sprint sends
-- ---------------------------------------------------------------------------
--
-- Sprint 8 adds eight notification types:
--
--   offer_assigned      an exclusive offer put on a customer's account
--   offer_expiring      a live campaign about to end
--   promotion_started   a campaign went live
--   promotion_paused    a live campaign was paused
--   points_earned       a finished sale credited points
--   points_redeemed     points spent against a deal
--   points_expiring     a customer's points are about to lapse
--   points_adjusted     a staff member credited or debited by hand
--
-- The notifications table was not created by any migration in this repo, so
-- whether `type` and `entity_type` carry CHECK constraints is unknown. If they
-- do, these inserts would be rejected at runtime — and because
-- createNotification swallows its own errors by design, the only symptom
-- would be notifications that silently never arrive.
--
-- WHAT THIS SCRIPT IS CAREFUL ABOUT
--
-- sql/04-phase-19-audit-types.sql solved the same problem for
-- enquiry_activity by rebuilding the constraint from the values present in
-- the table. That is not safe enough here. notifications.type has around
-- forty values spread across leads, enquiries, test drives, sales, payments
-- and reservations, and a given database will only have rows for some of
-- them — a fresh install may have rows for almost none. Rebuilding from the
-- data alone would quietly revoke every allowed-but-unused type, and the
-- first symptom would be test drive or payment notifications silently
-- failing weeks later.
--
-- So the replacement list is the union of three things:
--
--   1. every value the existing constraint already allows, read back out of
--      the constraint definition itself
--   2. every value actually present in the table
--   3. the eight values this sprint adds
--
-- Nothing can be lost. The list only ever grows.
--
--   * It does nothing at all if there is no such constraint.
--   * It does nothing at all if there is no notifications table.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- A helper, so the two columns cannot drift apart
-- ---------------------------------------------------------------------------
--
-- Written as a function rather than copied twice. Two near-identical forty
-- line blocks is how one of them ends up fixed and the other not.
--
-- Dropped at the end of the script: it is scaffolding, not schema.

create or replace function public._sprint8_widen_check(
  p_table      text,
  p_column     text,
  p_new_values text[]
)
returns void
language plpgsql
as $fn$
declare
  v_constraint text;
  v_def        text;
  v_allowed    text[] := '{}';
  v_from_data  text[];
  v_list       text;
begin
  if to_regclass('public.' || quote_ident(p_table)) is null then
    raise notice '% does not exist — nothing to change.', p_table;
    return;
  end if;

  -- The CHECK that governs this column. entity_type contains the substring
  -- "type", so the match is anchored on a word boundary to tell the two
  -- columns apart.
  select con.conname, pg_get_constraintdef(con.oid)
    into v_constraint, v_def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = p_table
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ~ ('\m' || p_column || '\M')
  limit 1;

  if v_constraint is null then
    raise notice 'No check constraint on %.% — nothing to change.', p_table, p_column;
    return;
  end if;

  -- 1. Everything the constraint already allows, read back from its own
  --    definition. This is the part that keeps allowed-but-unused values.
  select coalesce(array_agg(distinct m[1]), '{}')
    into v_allowed
  from regexp_matches(v_def, '''([^'']+)''', 'g') as m;

  -- 2. Everything actually recorded, so nothing in use can be excluded even
  --    if the definition were somehow unparseable.
  execute format(
    'select coalesce(array_agg(distinct %I), ''{}'') from public.%I where %I is not null',
    p_column, p_table, p_column
  ) into v_from_data;

  -- 3. Plus this sprint's values.
  v_allowed := v_allowed || coalesce(v_from_data, '{}') || p_new_values;

  select string_agg(distinct quote_literal(value), ', ' order by quote_literal(value))
    into v_list
  from unnest(v_allowed) as value;

  execute format('alter table public.%I drop constraint %I', p_table, v_constraint);

  execute format(
    'alter table public.%I add constraint %I check (%I in (%s))',
    p_table, v_constraint, p_column, v_list
  );

  raise notice 'Rebuilt % — % values allowed.', v_constraint, array_length(
    (select array_agg(distinct value) from unnest(v_allowed) as value), 1
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. notifications.type
-- ---------------------------------------------------------------------------

select public._sprint8_widen_check(
  'notifications',
  'type',
  array[
    'offer_assigned',
    'offer_expiring',
    'promotion_started',
    'promotion_paused',
    'points_earned',
    'points_redeemed',
    'points_expiring',
    'points_adjusted'
  ]
);

-- ---------------------------------------------------------------------------
-- 2. notifications.entity_type
-- ---------------------------------------------------------------------------
--
-- Sprint 8 points notifications at three entity types:
--
--   promotion   one campaign, linking to /admin/offers/<id>
--   customer    one customer, linking to /admin/customers/<id> — already in
--               use since Sprint 5
--   offers      the campaign list, for the bulk summary notification, which
--               is about several campaigns and so links to none of them.
--               notificationHref() resolves this through LIST_ROUTES.

select public._sprint8_widen_check(
  'notifications',
  'entity_type',
  array['promotion', 'customer', 'offers']
);

-- ---------------------------------------------------------------------------
-- 3. The dedupe index createNotification relies on
-- ---------------------------------------------------------------------------
--
-- createNotification passes a dedupeKey and treats error 23505 as success,
-- which is how a retried action produces one notification rather than two.
-- That only works if a unique index exists. If an earlier sprint created one,
-- this does nothing.

do $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'notifications'
      and indexdef ilike '%unique%'
      and indexdef ilike '%dedupe_key%'
  ) then
    create unique index notifications_dedupe_key_idx
      on public.notifications (dedupe_key)
      where dedupe_key is not null;

    raise notice 'Created notifications_dedupe_key_idx.';
  else
    raise notice 'A unique index on dedupe_key already exists — left alone.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Put the scaffolding away
-- ---------------------------------------------------------------------------

drop function if exists public._sprint8_widen_check(text, text, text[]);

commit;

-- ---------------------------------------------------------------------------
-- Check it
-- ---------------------------------------------------------------------------

-- What the two columns will now accept. No rows means no constraint, which is
-- also fine: the columns take any text.
--
-- Read the `type` rule and confirm your existing notification types are all
-- still listed alongside the eight new ones.
select
  con.conname                     as constraint_name,
  pg_get_constraintdef(con.oid)   as rule
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'notifications'
  and con.contype = 'c'
order by con.conname;
