import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/login/LoginPage";
import PaymentCheckPage from "./pages/payments/PaymentCheckPage";
import StudentDashboard from "./pages/dashboard/StudentDashboard";
import BalanceCard from "./components/BalanceCard";
import RequireRole from "./components/RequireRole";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">กำลังโหลด...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/payments"
            element={
              <RequireRole allow={["teacher", "treasurer"]}>
                <PaymentCheckPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

function Home() {
  const { user } = useAuth();
  if (user!.role === "student") return <StudentDashboard />;
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">
        Dashboard {user!.role === "teacher" ? "ครู" : "เหรัญญิก"}
      </h1>
      <BalanceCard classroomId={user!.classroomId} />
      <Link
        to="/payments"
        className="inline-block rounded-xl bg-brand-purple text-white px-5 py-2.5 text-sm font-medium hover:bg-brand-violet transition-all duration-250"
      >
        ไปหน้าเช็คเงิน →
      </Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <Link to="/" className="font-semibold hover:text-brand-purple transition-colors">
          {user?.name}
          <span className="block text-xs text-gray-400 font-normal">
            {roleLabel(user!.role)} · {user?.classroomIdentifier}
          </span>
        </Link>
        <button onClick={() => setConfirmingLogout(true)} className="text-sm text-red-500 hover:underline">
          ออกจากระบบ
        </button>
      </header>

      {children}

      {confirmingLogout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 animate-[fadeIn_200ms_ease-out]">
          <div className="bg-white dark:bg-navy-light rounded-2xl p-6 max-w-sm w-full space-y-4">
            <p className="font-medium">ยืนยันการออกจากระบบ?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmingLogout(false)} className="px-4 py-2 rounded-lg text-sm">
                ยกเลิก
              </button>
              <button onClick={logout} className="px-4 py-2 rounded-lg text-sm bg-red-500 text-white">
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roleLabel(role: string) {
  if (role === "teacher") return "ครู";
  if (role === "treasurer") return "เหรัญญิก";
  return "นักเรียน";
}
