-- CONTROL: the Sprint 8 write, to confirm the test above can fail.
update public.sales_settings set discount_auto_approve_percent = 2,
  payments_require_separate_verifier = true where id = true;

-- Her reservations save, Sprint 8 style: every column, the other six carrying
-- the values her page loaded before the threshold was lowered.
update public.sales_settings
   set discount_auto_approve_percent = 5,          -- stale, from page load
       fees_enabled = true,
       reservation_default_days = 5,
       reservation_max_days = 14,
       reservation_deposit_mode = 'fixed',
       reservation_deposit_value = 5000,
       confirm_min_deposit_percent = 20,
       payments_require_separate_verifier = false,  -- stale, from page load
       updated_by = '22222222-2222-2222-2222-222222222222'
 where id = true;

do $$
declare d numeric; v boolean;
begin
  select discount_auto_approve_percent, payments_require_separate_verifier into d, v
  from public.sales_settings;
  raise notice 'discount is now %, separate verifier is now %', d, v;
  if d = 2 and v is true then
    raise exception 'CONTROL FAILED: the all-columns write did not revert anything, so the test proves nothing.';
  end if;
  raise notice 'CONTROL OK  the all-columns write reverted both safeguards, which is the bug the scoped writes remove';
end $$;
