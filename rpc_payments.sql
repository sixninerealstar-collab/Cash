-- =====================================================================
-- CLASS FUND — PHASE 2 RPCs
-- Weekly payment generation, atomic pay/unpay, reversal, fund balance.
-- All money-moving functions use an advisory lock per classroom so
-- concurrent requests (double-click, two tabs) can never race each
-- other into a duplicate transaction or a wrong balance_after.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: current fund balance for a classroom (0 if no transactions yet)
-- ---------------------------------------------------------------------
create or replace function get_fund_balance(p_classroom_id uuid)
returns numeric
language sql stable
as $$
  select coalesce(
    (select balance_after from transactions
     where classroom_id = p_classroom_id
     order by created_at desc, id desc
     limit 1),
    0
  );
$$;

-- ---------------------------------------------------------------------
-- Ensure weekly_payments rows exist for every active student for a week.
-- Idempotent — safe to call repeatedly. Teacher/Treasurer only (checked
-- in RLS-protected wrapper below via current_role_name()).
-- ---------------------------------------------------------------------
create or replace function ensure_week_payments(p_classroom_id uuid, p_week integer)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_role_name() not in ('teacher','treasurer') then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_classroom_id <> current_classroom_id() then
    raise exception 'UNAUTHORIZED';
  end if;

  insert into weekly_payments (classroom_id, student_id, week, amount, status)
  select p_classroom_id, s.id, p_week, 10.00, 'unpaid'
  from students s
  where s.classroom_id = p_classroom_id and s.active = true
  on conflict (classroom_id, student_id, week) do nothing;
end;
$$;
revoke all on function ensure_week_payments from public;
grant execute on function ensure_week_payments to authenticated;

-- ---------------------------------------------------------------------
-- Mark a single weekly_payment as PAID. Atomic, race-safe, no double pay.
-- ---------------------------------------------------------------------
create or replace function record_weekly_payment(p_payment_id uuid)
returns table(new_balance numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor app_users;
  v_payment weekly_payments;
  v_balance numeric;
begin
  v_actor := current_app_user();
  if v_actor.role not in ('teacher','treasurer') then
    raise exception 'UNAUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_actor.classroom_id::text));

  select * into v_payment from weekly_payments
    where id = p_payment_id and classroom_id = v_actor.classroom_id
    for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_payment.status = 'paid' then
    raise exception 'ALREADY_PAID';
  end if;

  v_balance := get_fund_balance(v_actor.classroom_id) + v_payment.amount;

  update weekly_payments
    set status = 'paid', paid_at = now(), recorded_by = v_actor.id
    where id = p_payment_id;

  insert into transactions (classroom_id, type, amount, reference_id, reference_table, description, balance_after, created_by)
  values (v_actor.classroom_id, 'income', v_payment.amount, v_payment.id, 'weekly_payments',
          'เก็บเงินสัปดาห์ ' || v_payment.week, v_balance, v_actor.id);

  insert into audit_logs (classroom_id, user_id, role, action, target_id, metadata)
  values (v_actor.classroom_id, v_actor.id, v_actor.role, 'record_payment', v_payment.id,
          jsonb_build_object('week', v_payment.week, 'amount', v_payment.amount));

  return query select v_balance;
end;
$$;
revoke all on function record_weekly_payment from public;
grant execute on function record_weekly_payment to authenticated;

-- ---------------------------------------------------------------------
-- Reverse a PAID weekly_payment back to UNPAID. Requires confirmation
-- on the client; writes an audit log and a reversing expense-side entry.
-- ---------------------------------------------------------------------
create or replace function reverse_weekly_payment(p_payment_id uuid, p_reason text)
returns table(new_balance numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor app_users;
  v_payment weekly_payments;
  v_balance numeric;
begin
  v_actor := current_app_user();
  if v_actor.role not in ('teacher','treasurer') then
    raise exception 'UNAUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_actor.classroom_id::text));

  select * into v_payment from weekly_payments
    where id = p_payment_id and classroom_id = v_actor.classroom_id
    for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_payment.status = 'unpaid' then
    raise exception 'ALREADY_UNPAID';
  end if;

  v_balance := get_fund_balance(v_actor.classroom_id) - v_payment.amount;
  if v_balance < 0 then
    raise exception 'NEGATIVE_BALANCE';
  end if;

  update weekly_payments
    set status = 'unpaid', paid_at = null, recorded_by = v_actor.id
    where id = p_payment_id;

  insert into transactions (classroom_id, type, amount, reference_id, reference_table, description, balance_after, created_by)
  values (v_actor.classroom_id, 'expense', v_payment.amount, v_payment.id, 'reversal',
          coalesce('ยกเลิกการจ่าย สัปดาห์ ' || v_payment.week || ': ' || p_reason, 'ยกเลิกการจ่าย'),
          v_balance, v_actor.id);

  insert into audit_logs (classroom_id, user_id, role, action, target_id, metadata)
  values (v_actor.classroom_id, v_actor.id, v_actor.role, 'reverse_payment', v_payment.id,
          jsonb_build_object('week', v_payment.week, 'amount', v_payment.amount, 'reason', p_reason));

  return query select v_balance;
end;
$$;
revoke all on function reverse_weekly_payment from public;
grant execute on function reverse_weekly_payment to authenticated;

-- ---------------------------------------------------------------------
-- Pay multiple overdue weeks for one student in a single atomic call.
-- ---------------------------------------------------------------------
create or replace function record_multiple_payments(p_payment_ids uuid[])
returns table(new_balance numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor app_users;
  v_id uuid;
  v_balance numeric;
begin
  v_actor := current_app_user();
  if v_actor.role not in ('teacher','treasurer') then
    raise exception 'UNAUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_actor.classroom_id::text));

  foreach v_id in array p_payment_ids loop
    perform record_weekly_payment_inner(v_id, v_actor);
  end loop;

  v_balance := get_fund_balance(v_actor.classroom_id);
  return query select v_balance;
end;
$$;

-- internal helper reused by the batch function (not directly callable by clients)
create or replace function record_weekly_payment_inner(p_payment_id uuid, v_actor app_users)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_payment weekly_payments;
  v_balance numeric;
begin
  select * into v_payment from weekly_payments
    where id = p_payment_id and classroom_id = v_actor.classroom_id
    for update;

  if not found or v_payment.status = 'paid' then
    return; -- skip silently: already paid / not found, avoids partial-batch failure
  end if;

  v_balance := get_fund_balance(v_actor.classroom_id) + v_payment.amount;

  update weekly_payments
    set status = 'paid', paid_at = now(), recorded_by = v_actor.id
    where id = p_payment_id;

  insert into transactions (classroom_id, type, amount, reference_id, reference_table, description, balance_after, created_by)
  values (v_actor.classroom_id, 'income', v_payment.amount, v_payment.id, 'weekly_payments',
          'เก็บเงินสัปดาห์ ' || v_payment.week, v_balance, v_actor.id);

  insert into audit_logs (classroom_id, user_id, role, action, target_id, metadata)
  values (v_actor.classroom_id, v_actor.id, v_actor.role, 'record_payment', v_payment.id,
          jsonb_build_object('week', v_payment.week, 'amount', v_payment.amount, 'batch', true));
end;
$$;
revoke all on function record_multiple_payments from public;
revoke all on function record_weekly_payment_inner from public;
grant execute on function record_multiple_payments to authenticated;

-- ---------------------------------------------------------------------
-- Fund summary for dashboards
-- ---------------------------------------------------------------------
create or replace function get_fund_summary(p_classroom_id uuid)
returns table (
  balance numeric,
  total_income numeric,
  total_expense numeric,
  income_this_week numeric,
  expense_this_week numeric,
  paid_count integer,
  student_count integer
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_classroom_id <> current_classroom_id() then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  select
    get_fund_balance(p_classroom_id),
    coalesce((select sum(amount) from transactions where classroom_id = p_classroom_id and type = 'income'), 0),
    coalesce((select sum(amount) from transactions where classroom_id = p_classroom_id and type = 'expense'), 0),
    coalesce((select sum(amount) from transactions where classroom_id = p_classroom_id and type = 'income'
              and created_at >= date_trunc('week', now())), 0),
    coalesce((select sum(amount) from transactions where classroom_id = p_classroom_id and type = 'expense'
              and created_at >= date_trunc('week', now())), 0),
    (select count(*)::int from weekly_payments where classroom_id = p_classroom_id
      and week = (select coalesce(max(week),1) from weekly_payments where classroom_id = p_classroom_id)
      and status = 'paid'),
    (select count(*)::int from students where classroom_id = p_classroom_id and active = true);
end;
$$;
revoke all on function get_fund_summary from public;
grant execute on function get_fund_summary to authenticated;
