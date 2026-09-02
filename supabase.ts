import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Fails loudly in dev rather than silently falling back to fake data.
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them in .env.local"
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,      // <-- persistent login across refresh/close
    autoRefreshToken: true,
    storageKey: "class-fund-auth",
  },
});
