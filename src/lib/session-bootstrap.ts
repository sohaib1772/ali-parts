import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { supabase } from "@/integrations/supabase/client";

// Eagerly restore a persisted Supabase session BEFORE any route's
// `beforeLoad` runs `supabase.auth.getUser()`. Without this, on a fresh
// native app launch the WebView `localStorage` may be empty for a beat and
// the auth gate would redirect to /auth even though we have a valid refresh
// token in the hardware-backed secure store. Awaiting this promise closes
// that race.

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

async function restore(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;
  const key = getStorageKey();
  if (!key) return;

  try {
    // localStorage already has it — done.
    if (window.localStorage.getItem(key)) return;

    // Prefer hardware-backed secure store.
    let value: string | null = null;
    try {
      const v = await SecureStorage.get(key);
      if (typeof v === "string" && v.length > 0) value = v;
    } catch { /* ignore */ }

    // One-time migration from legacy plaintext Preferences copy.
    if (!value) {
      try {
        const legacy = await Preferences.get({ key });
        if (legacy.value) {
          value = legacy.value;
          try { await SecureStorage.set(key, value, false, false); } catch { /* ignore */ }
          try { await Preferences.remove({ key }); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    if (!value) return;

    // Prime localStorage so Supabase picks it up, then explicitly set the
    // session so in-memory client state is populated without waiting for
    // the next tab focus / visibility event.
    window.localStorage.setItem(key, value);
    try {
      const parsed = JSON.parse(value);
      if (parsed?.access_token && parsed?.refresh_token) {
        await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
      }
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

// Kick off restoration at module load. Anything that must wait for the
// restored session should `await sessionRestorePromise`.
export const sessionRestorePromise: Promise<void> = restore();