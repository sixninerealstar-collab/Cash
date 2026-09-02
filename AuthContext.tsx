import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { SessionUser } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_KEY = "class-fund-session-user"; // UI-level cache only; real auth = Supabase session

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On load: check for a real Supabase session first (source of truth).
    // The cached SessionUser is only display metadata to avoid a flash of
    // the login screen — it is never trusted for permission checks.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const cached = localStorage.getItem(LOCAL_KEY);
        if (cached) setUserState(JSON.parse(cached));
      } else {
        localStorage.removeItem(LOCAL_KEY);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUserState(null);
        localStorage.removeItem(LOCAL_KEY);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function setUser(u: SessionUser | null) {
    setUserState(u);
    if (u) localStorage.setItem(LOCAL_KEY, JSON.stringify(u));
    else localStorage.removeItem(LOCAL_KEY);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
