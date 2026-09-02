import { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { Role } from "../types";

export default function RequireRole({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <p className="text-4xl">🚫</p>
          <p className="font-medium text-red-500">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
