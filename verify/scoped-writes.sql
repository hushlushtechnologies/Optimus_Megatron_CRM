-- THE TEST THAT MATTERS IN THIS BATCH
--
-- Shahida opens Reservations. Somebody else lowers the discount threshold
-- from 5% to 2% and turns the separate-verifier rule on. Shahida, whose page
-- still shows the values it loaded, changes the hold and saves.
--
-- With the Sprint 8 all-columns write, her save sends every column as her page
-- loaded it, so the threshold goes back to 5%. With the scoped write, it
-- cannot: the statement does not name that column.

\echo '--- starting values ---'
select discount_auto_approve_percent as discount,
       payments_require_separate_verifier as separate_verifier,
       reservation_default_days as hold
from public.sales_settings;

-- Somebody else tightens two safeguards while her page is open.
update public.sales_settings
   set discount_auto_approve_percent = 2,
       payments_require_separate_verifier = true,
       updated_by = '11111111-1111-1111-1111-111111111111',
       updated_at = now()
 where id = true;

\echo '--- after the other person tightened the safeguards ---'
select discount_auto_approve_percent as discount,
       payments_require_separate_verifier as separate_verifier
from public.sales_settings;

-- Shahida saves the reservations page. This is exactly what
-- updateReservationSettingsAction sends: four columns and the stamps.
update public.sales_settings
   set reservation_default_days = 5,
       reservation_max_days = 14,
       reservation_deposit_mode = 'fixed',
       reservation_deposit_value = 5000,
       updated_by = '22222222-2222-2222-2222-222222222222',
       updated_at = now()
 where id = true;

\echo '--- after her reservations save: the discount must still be 2 ---'
select reservation_default_days as hold,
       discount_auto_approve_percent as discount,
       payments_require_separate_verifier as separate_verifier
from public.sales_settings;

do $$
declare
  d numeric;
  v boolean;
  h integer;
begin
  select discount_auto_approve_percent, payments_require_separate_verifier, reservation_default_days
    into d, v, h from public.sales_settings;

  if d <> 2 then
    raise exception 'LOST UPDATE: discount threshold is %, expected 2. The reservations save reverted it.', d;
  end if;
  if v is not true then
    raise exception 'LOST UPDATE: separate verifier is %, expected true.', v;
  end if;
  if h <> 5 then
    raise exception 'The reservations save did not take: hold is %, expected 5.', h;
  end if;
  raise notice 'PASS  the reservations save changed the hold and nothing else';
end $$;

-- And the history records only what each save actually changed.
\echo '--- what the history describes for her save ---'
select (
  select string_agg(key, ', ' order by key)
  from jsonb_each(new_values) as n(key, value)
  where key not in ('id', 'updated_at', 'updated_by')
    and (old_values -> key) is distinct from value
) as columns_actually_changed
from public.sales_settings_history
order by id desc
limit 1;

do $$
declare
  changed text;
begin
  select (
    select string_agg(key, ', ' order by key)
    from jsonb_each(new_values) as n(key, value)
    where key not in ('id', 'updated_at', 'updated_by')
      and (old_values -> key) is distinct from value
  ) into changed
  from public.sales_settings_history
  order by id desc
  limit 1;

  if changed <> 'reservation_default_days' then
    raise exception 'History for the reservations save describes "%", expected only reservation_default_days.', changed;
  end if;
  raise notice 'PASS  the audit entry names only the column that moved';
end $$;

-- The payments page save, same proof in the other direction.
update public.sales_settings
   set confirm_min_deposit_percent = 10,
       payments_require_separate_verifier = false,
       updated_by = '33333333-3333-3333-3333-333333333333',
       updated_at = now()
 where id = true;

do $$
declare
  d numeric;
  h integer;
begin
  select discount_auto_approve_percent, reservation_default_days
    into d, h from public.sales_settings;
  if d <> 2 or h <> 5 then
    raise exception 'The payments save touched other pages: discount %, hold %.', d, h;
  end if;
  raise notice 'PASS  the payments save changed its own two columns and nothing else';
end $$;
