-- =====================================================================
-- LOGIN-TIME LOOKUP FUNCTIONS
-- These run as SECURITY DEFINER so they can be called by anonymous
-- (unauthenticated) clients during Step 1 / Step 2 of login, WITHOUT
-- exposing the underlying tables directly (RLS still blocks direct
-- table reads for anon). Actual session creation happens in the
-- `login` Edge Function (server-side, uses service role key).
-- =====================================================================

-- STEP 1: find classroom by school code + grade + number
create or replace function find_classroom(
  p_school_code text,
  p_grade_level grade_level_enum,
  p_classroom_number text
) returns table (id uuid, classroom_identifier text)
language sql
security definer
set search_path = public
as $$
  select id, classroom_identifier
  from classrooms
  where upper(school_code) = upper(p_school_code)
    and grade_level = p_grade_level
    and classroom_number = p_classroom_number
    and active = true;
$$;

-- STEP 2 (teacher/treasurer): role codes are stored server-side only,
-- never in a client-readable table. Checked inside the Edge Function
-- against an environment secret (TEACHER_CODE / TREASURER_CODE), not SQL.
-- (Kept out of the DB on purpose — see README "Role Codes".)

-- STEP 2 (student): find matching students by first name within a classroom
create or replace function find_student_by_name(
  p_classroom_id uuid,
  p_first_name text
) returns table (id uuid, student_id text, prefix text, first_name text, last_name text)
language sql
security definer
set search_path = public
as $$
  select id, student_id, prefix, first_name, last_name
  from students
  where classroom_id = p_classroom_id
    and active = true
    and first_name = p_first_name;
$$;

-- Lock down: only allow execution, not direct table access, from anon role
revoke all on function find_classroom from public;
revoke all on function find_student_by_name from public;
grant execute on function find_classroom to anon, authenticated;
grant execute on function find_student_by_name to anon, authenticated;
