import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";

// Mirror Supabase session to a hardware-backed secure store on native
// (Keychain on iOS, EncryptedSharedPreferences / Keystore on Android) so
// the refresh token survives WebView storage wipes and is protected from
// other apps and casual on-device inspection. Cleared only on sign-out.
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

async function secureGet(key: string): Promise<string | null> {
  try {
    const v = await SecureStorage.get(key);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    // sync=false keeps the item on this device only (no iCloud Keychain sync).
    await SecureStorage.set(key, value, false, false);
  } catch { /* ignore */ }
}

async function secureRemove(key: string): Promise<void> {
  try { await SecureStorage.remove(key); } catch { /* ignore */ }
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

    // 1) Restore session from secure storage if localStorage doesn't have
    //    it. Migrate any legacy plain-Preferences copy into secure storage
    //    and delete the plaintext copy.
    (async () => {
      try {
        // One-time migration: move any plaintext Preferences copy into
        // the secure store, then delete it.
        try {
          const legacy = await Preferences.get({ key });
          if (legacy.value) {
            await secureSet(key, legacy.value);
            await Preferences.remove({ key });
          }
        } catch { /* ignore */ }

        const local = window.localStorage.getItem(key);
        if (!local) {
          const value = await secureGet(key);
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
          // Ensure secure copy exists.
          await secureSet(key, local);
        }
      } catch { /* ignore */ }
    })();

    // 2) Mirror future changes to secure storage.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_OUT" || !session) {
          await secureRemove(key);
          return;
        }
        const value = window.localStorage.getItem(key);
        if (value) await secureSet(key, value);
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