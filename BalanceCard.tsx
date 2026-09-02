import { useEffect, useState } from "react";
import { fetchFundSummary, FundSummary } from "../lib/api/payments";
import { friendlyError } from "../lib/errors";

export default function BalanceCard({ classroomId }: { classroomId: string }) {
  const [summary, setSummary] = useState<FundSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFundSummary(classroomId)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => !cancelled && setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!summary) return <div className="animate-pulse h-24 rounded-2xl bg-gray-100 dark:bg-navy-light" />;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="ยอดเงินกองกลาง" value={`฿${summary.balance.toLocaleString()}`} highlight />
      <Stat label="เงินเข้าทั้งหมด" value={`฿${summary.total_income.toLocaleString()}`} color="text-green-500" />
      <Stat label="เงินออกทั้งหมด" value={`฿${summary.total_expense.toLocaleString()}`} color="text-red-500" />
      <Stat label="จ่ายแล้วสัปดาห์ล่าสุด" value={`${summary.paid_count} / ${summary.student_count}`} />
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm transition-all duration-300 ${
        highlight
          ? "bg-brand-purple text-white"
          : "bg-white dark:bg-navy-light"
      }`}
    >
      <p className={`text-xs ${highlight ? "text-white/70" : "text-gray-400"}`}>{label}</p>
      <p className={`text-xl font-bold mt-1 ${color ?? ""}`}>{value}</p>
    </div>
  );
}
