import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Classroom, GradeLevel } from "../../types";

const GRADE_OPTIONS: GradeLevel[] = ["มัธยมปลาย", "มัธยมต้น", "ประถมปลาย", "ประถมต้น"];

interface Props {
  onFound: (classroom: Classroom) => void;
}

export default function StepClassroom({ onFound }: Props) {
  const [schoolCode, setSchoolCode] = useState("");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel | "">("");
  const [classroomNumber, setClassroomNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = schoolCode.trim() && gradeLevel && classroomNumber.trim() && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("find_classroom", {
      p_school_code: schoolCode.trim(),
      p_grade_level: gradeLevel,
      p_classroom_number: classroomNumber.trim(),
    });

    setLoading(false);

    if (rpcError) {
      setError("การเชื่อมต่อมีปัญหา กรุณาตรวจสอบอินเทอร์เน็ต");
      return;
    }
    if (!data || data.length === 0) {
      setError("ไม่พบห้องเรียนนี้ในระบบ\nกรุณาตรวจสอบรหัสโรงเรียน ระดับชั้น และเลขห้อง");
      return;
    }
    onFound(data[0]);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 animate-[fadeIn_300ms_ease-out]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-navy-light rounded-2xl shadow-xl p-8 space-y-6"
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-brand-purple">CLASS FUND</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ระบบจัดการเงินกองกลางห้องเรียน
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">รหัสย่อโรงเรียน</label>
            <input
              value={schoolCode}
              onChange={(e) => setSchoolCode(e.target.value)}
              placeholder="เช่น CMC"
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all duration-250"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">เลขห้อง</label>
            <input
              value={classroomNumber}
              onChange={(e) => setClassroomNumber(e.target.value)}
              placeholder="เช่น 5/1"
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all duration-250"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ระดับชั้น</label>
            <div className="grid grid-cols-2 gap-2">
              {GRADE_OPTIONS.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setGradeLevel(g)}
                  className={`rounded-xl border px-3 py-2 text-sm transition-all duration-250 ${
                    gradeLevel === g
                      ? "border-brand-purple bg-brand-purple/10 text-brand-purple font-medium"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 whitespace-pre-line bg-red-50 dark:bg-red-950/40 rounded-lg p-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-brand-purple text-white py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-violet transition-all duration-250 active:scale-[0.98]"
        >
          {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
