-- =====================================================================
-- CLASS FUND — DATABASE SCHEMA (PostgreSQL / Supabase)
-- Phase 1: Structure + RLS + Auth support
-- Run this in Supabase SQL Editor (or via `supabase db push`)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
create type grade_level_enum as enum ('มัธยมปลาย','มัธยมต้น','ประถมปลาย','ประถมต้น');
create type user_role_enum as enum ('teacher','treasurer','student');
create type payment_status_enum as enum ('paid','unpaid');
create type txn_type_enum as enum ('income','expense');
create type withdrawal_status_enum as enum ('pending','approved','rejected');
create type urgency_enum as enum ('normal','urgent','very_urgent');

-- ---------------------------------------------------------------------
-- CLASSROOMS
-- ---------------------------------------------------------------------
create table classrooms (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  grade_level grade_level_enum not null,
  classroom_number text not null,              -- e.g. "5/1"
  classroom_identifier text not null unique,    -- e.g. "CMC-M5/1"
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_code, grade_level, classroom_number)
);

-- ---------------------------------------------------------------------
-- STUDENTS
-- ---------------------------------------------------------------------
create table students (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique,              -- STU001 ... STU024 (per classroom, generated)
  prefix text,
  first_name text not null,
  last_name text,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_students_classroom on students(classroom_id);

-- ---------------------------------------------------------------------
-- APP USERS
-- Linked 1:1 to Supabase auth.users (anonymous/custom sessions are minted
-- via Edge Function after classroom+role verification — see auth notes)
-- ---------------------------------------------------------------------
create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  role user_role_enum not null,
  name text not null,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  student_id uuid references students(id) on delete set null, -- only when role = student
  created_at timestamptz not null default now()
);
create index idx_app_users_classroom on app_users(classroom_id);
create index idx_app_users_auth on app_users(auth_user_id);

-- ---------------------------------------------------------------------
-- WEEKLY PAYMENTS
-- ---------------------------------------------------------------------
create table weekly_payments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  week integer not null,
  amount numeric(10,2) not null default 10.00,
  status payment_status_enum not null default 'unpaid',
  paid_at timestamptz,
  recorded_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (classroom_id, student_id, week)
);
create index idx_weekly_payments_classroom on weekly_payments(classroom_id);

-- ---------------------------------------------------------------------
-- TRANSACTIONS (immutable ledger — no hard delete, reversals only)
-- ---------------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  type txn_type_enum not null,
  amount numeric(10,2) not null check (amount > 0),
  reference_id uuid,                 -- weekly_payments.id or withdrawal_requests.id
  reference_table text,              -- 'weekly_payments' | 'withdrawal_requests' | 'reversal'
  description text,
  balance_after numeric(10,2) not null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_transactions_classroom on transactions(classroom_id, created_at desc);

-- ---------------------------------------------------------------------
-- WITHDRAWAL REQUESTS
-- ---------------------------------------------------------------------
create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  requester_id uuid not null references app_users(id),
  requester_role user_role_enum not null,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  category text not null,
  requested_date date not null,
  description text,
  attachment_url text,
  urgency urgency_enum not null default 'normal',
  status withdrawal_status_enum not null default 'pending',
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_withdrawals_classroom on withdrawal_requests(classroom_id, status);

create table withdrawal_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references withdrawal_requests(id) on delete cascade,
  user_id uuid not null references app_users(id),
  comment text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUDIT LOG (append-only)
-- ---------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  user_id uuid references app_users(id),
  role user_role_enum,
  action text not null,
  target_id uuid,
  metadata jsonb,
  timestamp timestamptz not null default now()
);
create index idx_audit_classroom on audit_logs(classroom_id, timestamp desc);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on notifications(user_id, read);

-- ---------------------------------------------------------------------
-- ANNOUNCEMENTS
-- ---------------------------------------------------------------------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  created_by uuid references app_users(id),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- BUDGETS
-- ---------------------------------------------------------------------
create table budgets (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  category text not null,
  amount numeric(10,2) not null,
  period text not null,              -- e.g. '2026-Q3'
  created_at timestamptz not null default now()
);

-- =====================================================================
-- HELPER FUNCTIONS (used by RLS policies)
-- These read the caller's app_users row via their auth.uid()
-- =====================================================================
create or replace function current_app_user()
returns app_users
language sql stable security definer
as $$
  select * from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_classroom_id()
returns uuid
language sql stable security definer
as $$
  select classroom_id from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_role_name()
returns user_role_enum
language sql stable security definer
as $$
  select role from app_users where auth_user_id = auth.uid() limit 1;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table classrooms enable row level security;
alter table students enable row level security;
alter table app_users enable row level security;
alter table weekly_payments enable row level security;
alter table transactions enable row level security;
alter table withdrawal_requests enable row level security;
alter table withdrawal_comments enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;
alter table announcements enable row level security;
alter table budgets enable row level security;

-- classrooms: readable for lookup during login (needed to verify identifier),
-- but only via a restricted SECURITY DEFINER RPC in practice (see auth notes).
create policy classrooms_select_own on classrooms
  for select using (id = current_classroom_id());

-- students: only own classroom
create policy students_isolation on students
  for select using (classroom_id = current_classroom_id());

-- app_users: only see users in own classroom
create policy app_users_isolation on app_users
  for select using (classroom_id = current_classroom_id());

-- weekly_payments: students see only their own row; teacher/treasurer see all in classroom
create policy weekly_payments_select on weekly_payments
  for select using (
    classroom_id = current_classroom_id()
    and (
      current_role_name() in ('teacher','treasurer')
      or student_id = (select student_id from app_users where auth_user_id = auth.uid())
    )
  );
create policy weekly_payments_write on weekly_payments
  for all using (
    classroom_id = current_classroom_id()
    and current_role_name() in ('teacher','treasurer')
  );

-- transactions: teacher/treasurer full read; students read own classroom aggregate only
create policy transactions_select on transactions
  for select using (classroom_id = current_classroom_id());
create policy transactions_write on transactions
  for insert with check (
    classroom_id = current_classroom_id()
    and current_role_name() in ('teacher','treasurer')
  );

-- withdrawal_requests: all roles in classroom can read; all can insert own; only teacher can update approval fields (enforced in RPC)
create policy withdrawals_select on withdrawal_requests
  for select using (classroom_id = current_classroom_id());
create policy withdrawals_insert on withdrawal_requests
  for insert with check (classroom_id = current_classroom_id());

-- audit logs: read-only for all roles in classroom, no client-side delete/update ever
create policy audit_select on audit_logs
  for select using (classroom_id = current_classroom_id());

-- notifications: only own
create policy notifications_select on notifications
  for select using (user_id = (select id from app_users where auth_user_id = auth.uid()));
create policy notifications_update on notifications
  for update using (user_id = (select id from app_users where auth_user_id = auth.uid()));

-- announcements: read for classroom, write for teacher only
create policy announcements_select on announcements
  for select using (classroom_id = current_classroom_id());
create policy announcements_write on announcements
  for insert with check (classroom_id = current_classroom_id() and current_role_name() = 'teacher');

-- budgets: read for classroom, write for teacher/treasurer
create policy budgets_select on budgets
  for select using (classroom_id = current_classroom_id());
create policy budgets_write on budgets
  for all using (classroom_id = current_classroom_id() and current_role_name() in ('teacher','treasurer'));

-- =====================================================================
-- SEED DATA (editable/deletable — NOT hardcoded into app logic)
-- =====================================================================
insert into classrooms (school_code, grade_level, classroom_number, classroom_identifier)
values ('CMC', 'มัธยมปลาย', '5/1', 'CMC-M5/1');

-- 24 students seeded against the classroom above
insert into students (student_id, prefix, first_name, last_name, classroom_id)
select v.student_id, v.prefix, v.first_name, v.last_name, c.id
from (values
  ('STU001','นาย','สราวุฒิ','สมบูรณ์'),
  ('STU002','นาย','จีรายุ','จันทเขียน'),
  ('STU003','นาย','สมบูรณ์',null),
  ('STU004','นาย','อาร์ธี','วรรณวิภูมิษ'),
  ('STU005','นางสาว','กรชกร','ณ เชียงใหม่'),
  ('STU006','นาย','เตชัส','คำนวล'),
  ('STU007','นางสาว','เมษา','ลาภะ'),
  ('STU008','นาย','กฤชวิน','พฤกษมาศ'),
  ('STU009','นาย','ณัฐพงษ์','วงศ์สะอาด'),
  ('STU010','นาย','ภาวัต','ภิระบรรณ์'),
  ('STU011','นางสาว','บุญรัตน์','กิตติศัพท์โตมร'),
  ('STU012','นางสาว','ศศิวรรณ','จันทร์ดวง'),
  ('STU013','นางสาว','นฤมล','คำโพธิ์'),
  ('STU014','นางสาว','พรีชา','ลือยศ'),
  ('STU015','นาย','ธนบดี','บริสุทธิ์'),
  ('STU016','นางสาว','ภัทรธิดา','มณฑา'),
  ('STU017','นางสาว','พัทธธีรา','ทิพย์พิมล'),
  ('STU018','นางสาว','อัญลิชา','ทะบือ'),
  ('STU019','นางสาว','ณภัทร','วงศ์คาบวรัตน์'),
  ('STU020','นางสาว','พิชชาภา','เดชอนันต์'),
  ('STU021','นางสาว','ธิดาพร','สุธรรม'),
  ('STU022','นางสาว','ธัญญารัตน์','เลาหมู่'),
  ('STU023','นาย','เจริญ','แซ่ย่าง'),
  ('STU024','นางสาว','รัชนีกร','กำเนิดครู')
) as v(student_id, prefix, first_name, last_name)
cross join (select id from classrooms where classroom_identifier = 'CMC-M5/1') c;
