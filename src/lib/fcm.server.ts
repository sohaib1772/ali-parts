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
    .select("token")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const tokens = (rows ?? []).map((r: { token: string }) => r.token);
  if (tokens.length === 0) return { sent: 0, removed: 0, tokens: 0 };

  const { projectId, jwt } = await getClient();
  const accessToken = (await jwt.getAccessToken()).token; // cached by JWT client
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    tokens.map(async (token) => {
      const message = {
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: { priority: "HIGH" as const, notification: { sound: "default" } },
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
          return;
        }
        const text = await res.text().catch(() => "");
        if (isDeadTokenError(res.status, text)) {
          dead.push(token);
        } else {
          console.error("[fcm] send failed", res.status, text.slice(0, 300));
        }
      } catch (err) {
        console.error("[fcm] network error", err);
      }
    }),
  );

  if (dead.length > 0) {
    await supabaseAdmin.from("device_tokens").delete().in("token", dead);
  }

  return { sent, removed: dead.length, tokens: tokens.length };
}
