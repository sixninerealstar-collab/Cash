import { useEffect, useState } from "react";
import { fetchMyPayments, WeeklyPaymentRow } from "../../lib/api/payments";
import { friendlyError } from "../../lib/errors";
import { useAuth } from "../../contexts/AuthContext";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WeeklyPaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.studentDbId) return;
    fetchMyPayments(user.classroomId, user.studentDbId)
      .then(setRows)
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  const overdue = rows.filter((r) => r.status === "unpaid");
  const owed = overdue.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">สวัสดี {user?.name}</h1>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="animate-pulse h-32 rounded-2xl bg-gray-100 dark:bg-navy-light" />
      ) : (
        <>
          {owed > 0 && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 p-4">
              <p className="text-sm text-red-500 font-medium">ยอดค้างจ่าย ฿{owed}</p>
              <p className="text-xs text-red-400">{overdue.length} สัปดาห์</p>
            </div>
          )}

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl p-3 text-center transition-all duration-250 ${
                  r.status === "paid"
                    ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                    : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300"
                }`}
              >
                <p className="text-xs">สัปดาห์ {r.week}</p>
                <p className="text-lg">{r.status === "paid" ? "✅" : "❌"}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
