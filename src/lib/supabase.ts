import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publicKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

let browserClient: SupabaseClient | null | undefined;

export function isSupabaseConfigured() {
  return Boolean(url && publicKey && !url.includes("SEU-PROJETO"));
}

export function getSupabaseConfig() {
  return isSupabaseConfigured() ? { url: url!, publicKey: publicKey! } : null;
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const config = getSupabaseConfig();
  browserClient = config
    ? createClient(config.url, config.publicKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  return browserClient;
}

export function useAdminAccess() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;

    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (active) setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (active) setIsAdmin(profile?.role === "admin");
    };

    void check();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void check(), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return isAdmin;
}
