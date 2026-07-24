import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * FCM push registration for the native (Capacitor) shell.
 *
 * Web/browser users never reach any of this — every entry point returns early
 * unless `Capacitor.isNativePlatform()`. The web bundle also never ships
 * @capacitor/push-notifications: it is only ever dynamically imported inside the
 * native branch, so the import is tree-shaken out of the browser build.
 *
 * The in-app notification system (realtime popup + bell badge) is unchanged and
 * is what foreground/last-mile delivery relies on. FCM is purely the "app is
 * closed / backgrounded" channel: the OS shows a system notification, and
 * tapping it deep-links into the relevant screen.
 */

/** Where a tapped notification should land, given the FCM `data` payload the
 *  server attaches. Kept here so the routing rules live in one place. */
export function deepLinkForPush(data: Record<string, unknown> | undefined): string {
  const orderId = typeof data?.order_id === "string" ? data.order_id : "";
  const replacementId = typeof data?.replacement_id === "string" ? data.replacement_id : "";
  const url = typeof data?.url === "string" ? data.url : "";
  if (orderId) return `/orders/${orderId}`;
  if (replacementId) return `/replacements/${replacementId}`;
  if (url.startsWith("/")) return url;
  return "/notifications";
}

let started = false;

/**
 * Idempotent. Safe to call on every auth change / mount; it wires the native
 * listeners once, then only re-runs permission+register on later calls (cheap,
 * and how a token gets (re)issued after the user grants permission later).
 *
 * @param onNavigate deep-link handler, given a path like "/orders/123".
 */
export async function initNativePush(onNavigate: (path: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Only push for a signed-in user — a token with no owner is useless, and
  // register_device_token requires auth.uid().
  const { data: sessionRes } = await supabase.auth.getSession();
  if (!sessionRes.session?.user) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  if (!started) {
    started = true;

    // Token issued (first time AND on every FCM rotation) -> upsert. The RPC
    // reassigns the token to the current user, covering shared-device re-login.
    await PushNotifications.addListener("registration", (token) => {
      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
      void supabase
        .rpc("register_device_token", { p_token: token.value, p_platform: platform })
        .then(({ error }) => {
          if (error) console.error("[push] register_device_token failed", error.message);
        });
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[push] registration error", err);
    });

    // Tapped from the system tray while backgrounded/closed -> deep-link.
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification?.data as Record<string, unknown> | undefined;
      onNavigate(deepLinkForPush(data));
    });

    // Foreground receipt: the in-app realtime popup already shows this, so we
    // deliberately do nothing here and let that own the foreground experience.
  }

  // Ask only if not already decided. `receive: 'granted'` means a token can be
  // requested; anything else means the user declined — respected silently.
  const perm = await PushNotifications.checkPermissions();
  let receive = perm.receive;
  if (receive === "prompt" || receive === "prompt-with-rationale") {
    receive = (await PushNotifications.requestPermissions()).receive;
  }
  if (receive !== "granted") return;

  // Triggers the 'registration' listener above with the FCM token.
  await PushNotifications.register();
}
