import { JWT } from "google-auth-library";

/**
 * FCM HTTP v1 sender (server-only).
 *
 * Never import this from client code — it reads the Firebase service-account
 * key. The key is provided out of band, NEVER bundled and NEVER in git:
 *   - FCM_SERVICE_ACCOUNT_FILE — absolute path to the JSON key on the server, OR
 *   - FCM_SERVICE_ACCOUNT_JSON — the JSON itself (for envs without a file mount).
 *
 * OAuth access tokens are minted from the key and CACHED (~1h, refreshed a
 * minute early). google-auth-library's JWT client already caches internally, so
 * a single client instance is reused for the process lifetime rather than
 * re-signing per message.
 */

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedClient: { projectId: string; jwt: JWT } | undefined;

async function loadServiceAccount(): Promise<ServiceAccount> {
  const inline = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline) as ServiceAccount;

  const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (!file) {
    throw new Error("Missing FCM_SERVICE_ACCOUNT_FILE (or FCM_SERVICE_ACCOUNT_JSON)");
  }
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(file, "utf8")) as ServiceAccount;
}

async function getClient(): Promise<{ projectId: string; jwt: JWT }> {
  if (cachedClient) return cachedClient;
  const sa = await loadServiceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  cachedClient = { projectId: sa.project_id, jwt };
  return cachedClient;
}

export type FcmPayload = {
  title: string;
  body: string;
  /** Optional image URL to display in the push notification (rich push). */
  image?: string;
  /** Attached as FCM `data` (all values coerced to strings). Drives the
   *  client's tap deep-link — see deepLinkForPush in native-push.ts. */
  data?: Record<string, string>;
};

/** True for the FCM v1 errors that mean "this token is permanently dead". */
function isDeadTokenError(status: number, body: string): boolean {
  if (status === 404) return true; // UNREGISTERED
  if (status === 400 && body.includes("INVALID_ARGUMENT")) return true; // malformed token
  return body.includes("UNREGISTERED") || body.includes("NOT_FOUND");
}

/**
 * Send one payload to every device token a user has. Returns counts. Dead tokens
 * (UNREGISTERED / invalid) are deleted so the table self-heals. All network
 * errors are swallowed per-token — one bad token never blocks the rest, and push
 * failure never propagates to the caller (the in-app notification already landed).
 */
export async function sendFcmToUser(
  userId: string,
  payload: FcmPayload,
): Promise<{ sent: number; removed: number; tokens: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows, error } = await supabaseAdmin
    .from("device_tokens")
    .select("token, platform")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const deviceList = (rows ?? []) as Array<{ token: string; platform: string | null }>;
  if (deviceList.length === 0) {
    try {
      await supabaseAdmin.from("notification_logs").insert({
        user_id: userId,
        event_type: "no_tokens_found",
        status: "warning",
        platform: "server",
        title: payload.title,
        message: "تعذر إرسال الإشعار لعدم وجود أي جهاز مسجل لهذا المستخدم.",
        metadata: { payload },
      });
    } catch (logErr) {
      console.warn("[fcm] failed to insert no_tokens log:", logErr);
    }
    return { sent: 0, removed: 0, tokens: 0 };
  }

  const { projectId, jwt } = await getClient();
  const accessToken = (await jwt.getAccessToken()).token; // cached by JWT client
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    deviceList.map(async (device) => {
      const token = device.token;
      const platform = device.platform ?? "android";
      const preview =
        token.length > 14
          ? `${token.slice(0, 8)}...${token.slice(-6)}`
          : token.slice(0, 8);

      const message = {
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.image ? { image: payload.image } : {}),
          },
          data: payload.data ?? {},
          android: {
            priority: "HIGH" as const,
            notification: {
              sound: "default",
              defaultSound: true,
              defaultVibrateTimings: true,
              ...(payload.image ? { image: payload.image } : {}),
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title: payload.title,
                  body: payload.body,
                },
                sound: "default",
                badge: 1,
              },
            },
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
            ...(payload.image ? { fcm_options: { image: payload.image } } : {}),
          },
        },
      };

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (res.ok) {
          sent++;
          try {
            await supabaseAdmin.from("notification_logs").insert({
              user_id: userId,
              event_type: "push_send_success",
              status: "success",
              platform,
              token_preview: preview,
              title: payload.title,
              message: `تم تسليم إشعار FCM بنجاح إلى جهاز ${platform === "ios" ? "iPhone" : platform === "android" ? "Android" : "المتصفح"}.`,
              metadata: { payload },
            });
          } catch (e) {
            console.warn("[fcm] log success insert error:", e);
          }
          return;
        }

        const text = await res.text().catch(() => "");
        const isDead = isDeadTokenError(res.status, text);
        if (isDead) {
          dead.push(token);
        } else {
          console.error("[fcm] send failed", res.status, text.slice(0, 300));
        }

        try {
          await supabaseAdmin.from("notification_logs").insert({
            user_id: userId,
            event_type: isDead ? "push_token_unregistered" : "push_send_failed",
            status: isDead ? "warning" : "failure",
            platform,
            token_preview: preview,
            title: payload.title,
            message: isDead
              ? "فشل الإرسال: رمز الجهاز غير مسجل أو منتهي الصلاحية (UNREGISTERED) - تم حذف الرمز تلقائياً."
              : `فشل إرسال الإشعار من خادم FCM (كود: ${res.status}).`,
            error_details: `HTTP ${res.status}: ${text}`,
            metadata: { payload, httpStatus: res.status, rawResponse: text },
          });
        } catch (e) {
          console.warn("[fcm] log failure insert error:", e);
        }
      } catch (err) {
        console.error("[fcm] network error", err);
        try {
          await supabaseAdmin.from("notification_logs").insert({
            user_id: userId,
            event_type: "push_network_error",
            status: "failure",
            platform,
            token_preview: preview,
            title: payload.title,
            message: "خطأ اتصال أثناء التخاطب مع خوادم Google Firebase.",
            error_details: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
            metadata: { payload },
          });
        } catch (e) {
          console.warn("[fcm] log network error insert error:", e);
        }
      }
    }),
  );

  if (dead.length > 0) {
    await supabaseAdmin.from("device_tokens").delete().in("token", dead);
  }

  return { sent, removed: dead.length, tokens: deviceList.length };
}
