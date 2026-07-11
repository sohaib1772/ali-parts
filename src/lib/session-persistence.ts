import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";

// Mirror Supabase session to Capacitor Preferences so that native app
// restarts (where WebView localStorage may be cleared) still keep the user
// signed in. Only ever cleared on explicit sign-out.
function getStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return null;
  }
}

export function SessionPersistence() {
  const router = useRouter();
  useEffect(() => {
    // Auto-refresh token when tab becomes visible again (web + native).
    const refreshIfNeeded = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;
        const expiresAt = (session.expires_at ?? 0) * 1000;
        // Refresh proactively if session expires within the next 60 seconds.
        if (expiresAt - Date.now() < 60_000) {
          await supabase.auth.refreshSession();
        }
      } catch { /* ignore */ }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let appListenerHandle: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) refreshIfNeeded();
      }).then((h) => { appListenerHandle = h; }).catch(() => {});
    }

    if (!Capacitor.isNativePlatform()) {
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    const key = getStorageKey();
    if (!key) {
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        appListenerHandle?.remove().catch(() => {});
      };
    }
    let cancelled = false;

    // 1) Restore session from Preferences if localStorage doesn't have it.
    (async () => {
      try {
        const local = window.localStorage.getItem(key);
        if (!local) {
          const { value } = await Preferences.get({ key });
          if (cancelled || !value) return;
          window.localStorage.setItem(key, value);
          try {
            const parsed = JSON.parse(value);
            if (parsed?.access_token && parsed?.refresh_token) {
              await supabase.auth.setSession({
                access_token: parsed.access_token,
                refresh_token: parsed.refresh_token,
              });
              router.invalidate();
            }
          } catch { /* ignore */ }
        } else {
          // Ensure Preferences copy exists.
          await Preferences.set({ key, value: local });
        }
      } catch { /* ignore */ }
    })();

    // 2) Mirror future changes to Preferences.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_OUT" || !session) {
          await Preferences.remove({ key });
          return;
        }
        const value = window.localStorage.getItem(key);
        if (value) await Preferences.set({ key, value });
      } catch { /* ignore */ }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      appListenerHandle?.remove().catch(() => {});
    };
  }, [router]);
  return null;
}