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

export function useCurrentUserName() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (active) setName(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      const fullName =
        profile?.full_name?.trim() ||
        (typeof data.user.user_metadata.full_name === "string"
          ? data.user.user_metadata.full_name.trim()
          : "") ||
        data.user.email?.split("@")[0] ||
        "Cliente";
      if (active) setName(fullName.split(/\s+/)[0]);
    };

    void load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void load(), 0);
    });
    const refresh = () => void load();
    window.addEventListener("drop-profile-updated", refresh);
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("drop-profile-updated", refresh);
    };
  }, []);

  return name;
}
