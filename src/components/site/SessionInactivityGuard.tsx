import { useEffect } from "react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const TIMEOUT_MS = 3 * 60 * 1_000;
const WARNING_MS = 30 * 1_000;
const ACTIVITY_KEY = "drop-session-last-activity";
const WARNING_ID = "session-inactivity-warning";

export function SessionInactivityGuard() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let authenticated = false;
    let signingOut = false;
    let warned = false;
    let lastWrite = 0;

    const readLastActivity = () => Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now();

    const registerActivity = () => {
      if (!authenticated || signingOut) return;
      const now = Date.now();
      if (now - lastWrite < 5_000) return;
      lastWrite = now;
      localStorage.setItem(ACTIVITY_KEY, String(now));
      if (warned) {
        warned = false;
        toast.dismiss(WARNING_ID);
      }
    };

    const checkInactivity = async () => {
      if (!authenticated || signingOut) return;
      const remaining = TIMEOUT_MS - (Date.now() - readLastActivity());
      if (remaining <= 0) {
        signingOut = true;
        toast.dismiss(WARNING_ID);
        localStorage.removeItem(ACTIVITY_KEY);
        await supabase.auth.signOut({ scope: "local" });
        authenticated = false;
        toast.warning("Sua sessão foi encerrada após 3 minutos de inatividade.");
        return;
      }
      if (remaining <= WARNING_MS && !warned) {
        warned = true;
        toast.warning("Sua sessão será encerrada em 30 segundos por inatividade.", {
          id: WARNING_ID,
          duration: WARNING_MS,
        });
      }
    };

    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      authenticated = Boolean(data.session);
      if (authenticated && !localStorage.getItem(ACTIVITY_KEY)) registerActivity();
      await checkInactivity();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, registerActivity, { passive: true }),
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkInactivity();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(() => void checkInactivity(), 5_000);
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      authenticated = Boolean(session);
      signingOut = false;
      if (event === "SIGNED_IN") {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
        lastWrite = Date.now();
      }
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(ACTIVITY_KEY);
        toast.dismiss(WARNING_ID);
      }
    });
    void initialize();

    return () => {
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, registerActivity),
      );
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
