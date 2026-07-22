import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";

/**
 * OAuth for the native (Capacitor) shell.
 *
 * The WebView cannot run the provider flow itself. Two separate walls:
 *
 *  1. Capacitor treats any host other than `server.url`'s as external and
 *     fires an ACTION_VIEW intent (Bridge.launchIntent). The very first hop —
 *     api.maktabali.com — already escapes to Chrome, so the session would land
 *     in Chrome's storage and the app would stay signed out.
 *  2. Google rejects OAuth from an embedded WebView with `disallowed_useragent`,
 *     so simply allow-listing the hosts would not help either.
 *
 * So the provider runs in a Chrome Custom Tab (a real browser, real UA) and
 * hands control back through a custom scheme that Android routes to this app.
 *
 * PKCE survives the round trip because the code verifier never leaves the
 * WebView: `signInWithOAuth` writes it to the client's localStorage while
 * building the URL, and `exchangeCodeForSession` reads it back from there. The
 * Custom Tab only ever carries the user to the provider and the `?code=` back.
 */

/** Must match the intent-filter in android/app/src/main/AndroidManifest.xml
 *  AND the Supabase redirect allow-list entry. */
export const NATIVE_REDIRECT_URL = "com.mkteb.ali.chevrolet://auth";

/**
 * `browserFinished` also fires on the success path, because the deep link
 * raises the app and we close the tab ourselves. This is how long we wait for
 * the `appUrlOpen` that a real redirect produces before concluding the user
 * simply dismissed the tab. Long enough to lose the race reliably, short
 * enough that a cancel does not feel like a hang.
 */
const CANCEL_GRACE_MS = 1200;

export type NativeOAuthResult =
  | { status: "signed-in" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Pull the OAuth parameters out of a redirect URL.
 *
 * Written against the raw string rather than `new URL()`: the redirect uses a
 * non-special scheme, where URL parsing rules differ between engines, and the
 * payload can arrive as a query (PKCE `?code=`) or as a fragment (a provider
 * error, or an implicit-flow response). Query wins when a key appears in both.
 */
export function paramsFromRedirect(raw: string): URLSearchParams {
  const queryAt = raw.indexOf("?");
  const hashAt = raw.indexOf("#");
  const chunks: string[] = [];
  if (queryAt !== -1) chunks.push(raw.slice(queryAt + 1).split("#")[0]);
  if (hashAt !== -1) chunks.push(raw.slice(hashAt + 1).split("?")[0]);

  const merged = new URLSearchParams();
  for (const chunk of chunks) {
    new URLSearchParams(chunk).forEach((value, key) => {
      if (!merged.has(key)) merged.set(key, value);
    });
  }
  return merged;
}

/**
 * Turn a returned redirect URL into a session. Every failure path produces a
 * message — a login screen that silently stops responding is indistinguishable
 * from a broken app.
 */
export async function completeFromRedirect(url: string): Promise<NativeOAuthResult> {
  const params = paramsFromRedirect(url);

  // The provider (or Supabase) refused: surface its own wording, it is more
  // specific than anything we could invent.
  const providerError = params.get("error_description") ?? params.get("error");
  if (providerError) return { status: "error", message: providerError };

  const code = params.get("code");
  if (!code) {
    return { status: "error", message: "لم يصل رمز الدخول من المزوّد" };
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { status: "error", message: error.message };

  return { status: "signed-in" };
}

/**
 * Run the whole native flow and resolve once it has actually concluded —
 * signed in, cancelled, or failed. It never resolves on "the tab opened", so
 * the caller can hold its spinner until there is something real to show.
 */
export async function signInWithProviderNative(
  provider: "google" | "apple",
): Promise<NativeOAuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_REDIRECT_URL,
      // Hand us the URL instead of navigating the WebView to it — navigating
      // is exactly what escapes to Chrome and loses the session.
      skipBrowserRedirect: true,
    },
  });

  if (error) return { status: "error", message: error.message };
  if (!data?.url) {
    return { status: "error", message: "تعذّر إنشاء رابط تسجيل الدخول" };
  }

  let settle!: (result: NativeOAuthResult) => void;
  const concluded = new Promise<NativeOAuthResult>((resolve) => {
    settle = resolve;
  });
  let settled = false;
  const finish = (result: NativeOAuthResult) => {
    if (settled) return;
    settled = true;
    settle(result);
  };

  // Registered before the tab opens, so a fast redirect cannot outrun them.
  const urlHandle = await App.addListener("appUrlOpen", ({ url }) => {
    if (!url || !url.startsWith(NATIVE_REDIRECT_URL)) return; // some other deep link
    void (async () => {
      await Browser.close().catch(() => { /* already gone */ });
      finish(await completeFromRedirect(url));
    })();
  });

  const finishedHandle = await Browser.addListener("browserFinished", () => {
    setTimeout(() => finish({ status: "cancelled" }), CANCEL_GRACE_MS);
  });

  try {
    await Browser.open({ url: data.url });
    return await concluded;
  } catch {
    return { status: "error", message: "تعذّر فتح صفحة تسجيل الدخول" };
  } finally {
    await urlHandle.remove().catch(() => { /* ignore */ });
    await finishedHandle.remove().catch(() => { /* ignore */ });
  }
}
