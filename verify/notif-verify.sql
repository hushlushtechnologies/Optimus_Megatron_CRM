\set ON_ERROR_STOP on
do $$
declare uid uuid;
begin
  select id into uid from public.profiles where full_name = 'Sales One';

  -- 1. an ordinary preference is accepted
  insert into public.notification_preferences (user_id, preference_key) values (uid, 'lead_stage');
  raise notice 'PASS  an ordinary preference can be stored';

  -- 2. a mandatory one is refused by the constraint
  begin
    insert into public.notification_preferences (user_id, preference_key) values (uid, 'payment_verification');
    raise exception 'THE CONSTRAINT DID NOT REFUSE payment_verification';
  exception when check_violation then
    raise notice 'PASS  payment_verification refused by the check constraint';
  end;

  begin
    insert into public.notification_preferences (user_id, preference_key) values (uid, 'loyalty_adjustment');
    raise exception 'THE CONSTRAINT DID NOT REFUSE loyalty_adjustment';
  exception when check_violation then
    raise notice 'PASS  loyalty_adjustment refused by the check constraint';
  end;

  -- 3. absent means on: there is exactly one row, not ten
  if (select count(*) from public.notification_preferences) <> 1 then
    raise exception 'expected exactly one row (the one switched off)';
  end if;
  raise notice 'PASS  only the exception is stored; everything else is on by absence';
end $$;

-- 4. who gets told a payment needs verifying
\echo '--- verifiers, excluding nobody ---'
select p.full_name from public.payment_verifier_ids() v join public.profiles p on p.id = v order by p.full_name;

\echo '--- excluding the manager who recorded it ---'
select p.full_name from public.payment_verifier_ids(
  (select id from public.profiles where full_name='Manager One')) v
  join public.profiles p on p.id = v order by p.full_name;

do $$
declare n integer; self_included boolean;
begin
  select count(*) into n from public.payment_verifier_ids();
  if n <> 2 then raise exception 'expected 2 verifiers, got %', n; end if;

  select exists (
    select 1 from public.payment_verifier_ids((select id from public.profiles where full_name='Manager One')) v
    where v = (select id from public.profiles where full_name='Manager One')
  ) into self_included;
  if self_included then
    raise exception 'THE RECORDER WAS NOT EXCLUDED — they would be asked to verify their own payment';
  end if;

  -- a salesperson holds payments.record, not payments.verify
  if exists (
    select 1 from public.payment_verifier_ids() v
    where v = (select id from public.profiles where full_name='Sales One')
  ) then
    raise exception 'someone without payments.verify is in the recipient list';
  end if;

  raise notice 'PASS  2 verifiers; the recorder is excluded; nobody without the permission is included';
end $$;
