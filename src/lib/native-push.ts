import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * FCM push registration for the native (Capacitor) shell.
 *
 * Mounted from the AUTHENTICATED layout (src/routes/_authenticated/route.tsx),
 * not from /auth and not from the app root. That layout's beforeLoad awaits the
 * session restore and guarantees a signed-in user before it renders, so this
 * runs for EVERY logged-in session — fresh Google login via Custom Tab, an
 * existing session, or a cold launch while already signed in — without
 * depending on which auth event fired (SIGNED_IN vs INITIAL_SESSION).
 *
 * Web/browser users never reach any of this: every entry returns early unless
 * Capacitor.isNativePlatform(), and @capacitor/push-notifications is only ever
 * dynamically imported inside that branch, so it is absent from the web bundle.
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

// Process-lifetime guards. These persist across route navigations (the module
// is evaluated once), which is what makes registration fire ONCE PER SESSION
// rather than on every screen mount of the authenticated layout.
let listenersWired = false;      // plugin listeners added once per process
let attemptedForUser: string | null = null; // last user we ran the flow for
let inFlight = false;            // guards against a concurrent first run

/**
 * Request permission (once), obtain the FCM token, and upsert it. Idempotent and
 * cheap to call on every authenticated mount:
 *
 *  - Same user, already attempted this session  -> returns immediately.
 *  - A DIFFERENT user (shared device re-login)   -> re-runs so the token is
 *    reassigned to whoever is now signed in.
 *  - Permission DENIED                           -> skips gracefully: no loop,
 *    no throw, and marked attempted so it does not re-prompt every navigation.
 *    A denied user who enables notifications in Android settings is picked up on
 *    the next cold launch.
 *
 * @param userId     the signed-in user's id (from the authenticated route context)
 * @param onNavigate deep-link handler, given a path like "/orders/123"
 */
export async function registerNativePush(
  userId: string,
  onNavigate: (path: string) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // web: no-op
  if (!userId) return;
  if (attemptedForUser === userId) return;   // once per session for this user
  if (inFlight) return;                       // a first run is already underway

  inFlight = true;
  // Claim the attempt up front so rapid re-mounts during the await below don't
  // start a second run. Denial included: we deliberately don't retry this session.
  attemptedForUser = userId;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    if (!listenersWired) {
      listenersWired = true;

      // Token issued (first grant AND every FCM rotation) -> upsert. The RPC
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

    // Ask only if not already decided. Anything other than 'granted' means the
    // user declined — respected silently, no loop, no crash.
    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive === "prompt" || receive === "prompt-with-rationale") {
      receive = (await PushNotifications.requestPermissions()).receive;
    }
    if (receive !== "granted") return;

    // Triggers the 'registration' listener above with the FCM token.
    await PushNotifications.register();
  } catch (err) {
    // Never let a native/permission hiccup crash the authenticated layout.
    console.error("[push] init failed", err);
  } finally {
    inFlight = false;
  }
}
