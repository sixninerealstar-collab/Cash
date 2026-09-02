// supabase/functions/login/index.ts
// Deploy: supabase functions deploy login
// Secrets required (set via `supabase secrets set`):
//   TEACHER_CODE, TREASURER_CODE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
//
// This function is the ONLY place role codes are checked and the ONLY
// place that creates authenticated sessions. Frontend never sees the
// service role key or the role codes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEACHER_CODE = Deno.env.get("TEACHER_CODE")!;
const TREASURER_CODE = Deno.env.get("TREASURER_CODE")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Body = {
  classroomId: string;
  role: "teacher" | "treasurer" | "student";
  code?: string;        // for teacher / treasurer
  studentDbId?: string; // for student (chosen after name search, students.id)
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { classroomId, role, code, studentDbId } = body;
  if (!classroomId || !role) return json({ error: "Missing classroomId or role" }, 400);

  // Verify the classroom exists and is active
  const { data: classroom, error: classroomErr } = await admin
    .from("classrooms")
    .select("id, classroom_identifier, active")
    .eq("id", classroomId)
    .eq("active", true)
    .single();
  if (classroomErr || !classroom) {
    return json({ error: "ไม่พบห้องเรียนนี้ในระบบ" }, 404);
  }

  let displayName = "";
  let studentRowId: string | null = null;

  if (role === "teacher") {
    if (code !== TEACHER_CODE) return json({ error: "รหัสไม่ถูกต้อง" }, 401);
    displayName = "ครู";
  } else if (role === "treasurer") {
    if (code !== TREASURER_CODE) return json({ error: "รหัสไม่ถูกต้อง" }, 401);
    displayName = "เหรัญญิก";
  } else if (role === "student") {
    if (!studentDbId) return json({ error: "กรุณาเลือกชื่อนักเรียน" }, 400);
    const { data: student, error: studentErr } = await admin
      .from("students")
      .select("id, student_id, prefix, first_name, last_name, classroom_id, active")
      .eq("id", studentDbId)
      .eq("classroom_id", classroomId)
      .eq("active", true)
      .single();
    if (studentErr || !student) {
      return json({ error: "ไม่พบชื่อในระบบ ไม่สามารถเข้าสู่ระบบได้" }, 404);
    }
    displayName = `${student.prefix ?? ""}${student.first_name} ${student.last_name ?? ""}`.trim();
    studentRowId = student.id;
  } else {
    return json({ error: "Invalid role" }, 400);
  }

  // Look for an existing app_users row for this identity, else create one.
  // A synthetic, unguessable email is used purely as the auth.users anchor;
  // nobody ever logs in with a password — sessions are minted here only.
  const anchorKey =
    role === "student"
      ? `student-${studentRowId}`
      : `${role}-${classroomId}`;
  const syntheticEmail = `${anchorKey}@classfund.internal`;

  let authUserId: string;
  const { data: existingUser } = await admin
    .from("app_users")
    .select("id, auth_user_id")
    .eq("classroom_id", classroomId)
    .eq("role", role)
    .eq("student_id", studentRowId)
    .maybeSingle();

  if (existingUser?.auth_user_id) {
    authUserId = existingUser.auth_user_id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: { classroom_id: classroomId, role },
    });
    if (createErr || !created.user) {
      return json({ error: "สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่" }, 500);
    }
    authUserId = created.user.id;

    await admin.from("app_users").insert({
      auth_user_id: authUserId,
      role,
      name: displayName,
      classroom_id: classroomId,
      student_id: studentRowId,
    });
  }

  // Mint a session (magic-link token exchanged immediately server-side)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: syntheticEmail,
  });
  if (linkErr || !linkData) return json({ error: "สร้าง session ไม่สำเร็จ" }, 500);

  return json({
    ok: true,
    actionLink: linkData.properties.action_link, // frontend follows this once to establish session
    classroomIdentifier: classroom.classroom_identifier,
    role,
    name: displayName,
  });
});
