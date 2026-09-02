import { useState } from "react";
import { GraduationCap, Wallet, User } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Classroom, Role, SessionUser, StudentMatch } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

const LOGIN_FN_URL = import.meta.env.VITE_SUPABASE_LOGIN_FN_URL as string;

interface Props {
  classroom: Classroom;
  onBack: () => void;
}

export default function StepRole({ classroom, onBack }: Props) {
  const { setUser } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [matches, setMatches] = useState<StudentMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function completeLogin(payload: {
    role: Role;
    code?: string;
    studentDbId?: string;
    displayNameFallback?: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(LOGIN_FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: classroom.id,
          role: payload.role,
          code: payload.code,
          studentDbId: payload.studentDbId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        setLoading(false);
        return;
      }

      // Exchange the one-time action link for a real Supabase session.
      const linkUrl = new URL(json.actionLink);
      const tokenHash = linkUrl.searchParams.get("token_hash") ?? linkUrl.searchParams.get("token");
      if (tokenHash) {
        await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: tokenHash,
        });
      }

      const sessionUser: SessionUser = {
        role: json.role,
        name: json.name,
        classroomId: classroom.id,
        classroomIdentifier: classroom.classroom_identifier,
        studentDbId: payload.studentDbId,
      };
      setUser(sessionUser);
    } catch {
      setError("การเชื่อมต่อมีปัญหา กรุณาตรวจสอบอินเทอร์เน็ต");
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!studentName.trim()) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("find_student_by_name", {
      p_classroom_id: classroom.id,
      p_first_name: studentName.trim(),
    });
    setLoading(false);
    if (rpcError) {
      setError("การเชื่อมต่อมีปัญหา กรุณาตรวจสอบอินเทอร์เน็ต");
      return;
    }
    if (!data || data.length === 0) {
      setError("ไม่พบชื่อในระบบ\nไม่สามารถเข้าสู่ระบบได้");
      return;
    }
    setMatches(data);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 animate-[fadeIn_300ms_ease-out]">
      <div className="w-full max-w-md bg-white dark:bg-navy-light rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs text-gray-400">{classroom.classroom_identifier}</p>
          <h2 className="text-xl font-bold">เลือกบทบาทของคุณ</h2>
        </div>

        {!role && (
          <div className="grid grid-cols-1 gap-3">
            <RoleCard icon={<GraduationCap />} label="ครู (Teacher)" onClick={() => setRole("teacher")} />
            <RoleCard icon={<Wallet />} label="เหรัญญิก (Treasurer)" onClick={() => setRole("treasurer")} />
            <RoleCard icon={<User />} label="นักเรียน (Student)" onClick={() => setRole("student")} />
          </div>
        )}

        {(role === "teacher" || role === "treasurer") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              completeLogin({ role, code });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">รหัสผ่าน</label>
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
            <button
              disabled={loading || !code}
              className="w-full rounded-xl bg-brand-purple text-white py-3 font-medium disabled:opacity-50 active:scale-[0.98] transition-all duration-250"
            >
              {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        )}

        {role === "student" && !matches && (
          <form onSubmit={handleStudentSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อ (ไม่ต้องใส่นามสกุล)</label>
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="เช่น ธนบดี"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
            <button
              disabled={loading || !studentName.trim()}
              className="w-full rounded-xl bg-brand-purple text-white py-3 font-medium disabled:opacity-50 active:scale-[0.98] transition-all duration-250"
            >
              {loading ? "กำลังค้นหา..." : "ค้นหาชื่อ"}
            </button>
          </form>
        )}

        {role === "student" && matches && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">พบ {matches.length} รายชื่อ กรุณายืนยันตัวตน</p>
            {matches.map((m) => (
              <button
                key={m.id}
                disabled={loading}
                onClick={() => completeLogin({ role: "student", studentDbId: m.id })}
                className="w-full text-left rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-3 hover:border-brand-purple transition-all duration-250"
              >
                {m.prefix}
                {m.first_name} {m.last_name}
                <span className="block text-xs text-gray-400">{m.student_id}</span>
              </button>
            ))}
            {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
          </div>
        )}

        <button
          onClick={() => (role ? setRole(null) : onBack())}
          className="text-sm text-gray-400 hover:text-brand-purple transition-colors"
        >
          ← ย้อนกลับ
        </button>
      </div>
    </div>
  );
}

function RoleCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-4 hover:border-brand-purple hover:bg-brand-purple/5 transition-all duration-250 active:scale-[0.98]"
    >
      <span className="text-brand-purple">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
