import { ApplicationServerKeys, generatePushHTTPRequest, setWebCrypto } from "webpush-webcrypto";

// webpush-webcrypto looks for globalThis.crypto via `self`. On the Cloudflare
// Worker runtime `self.crypto` is set, but be defensive and provide it explicitly.
try {
  if (typeof globalThis !== "undefined" && (globalThis as any).crypto) {
    setWebCrypto((globalThis as any).crypto);
  }
} catch (_) {}

const STATUS_TITLES: Record<string, string> = {
  pending: "بانتظار مراجعة طلب الاستبدال",
  in_review: "قسم الاستبدال يراجع طلبك",
  approved: "تمت الموافقة على طلب الاستبدال",
  rejected: "تم رفض طلب الاستبدال",
  resolved: "تم إنجاز طلب الاستبدال",
};

let cachedKeys: Promise<ApplicationServerKeys> | undefined;
function keys(): Promise<ApplicationServerKeys> {
  if (cachedKeys) return cachedKeys;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Missing WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY");
  cachedKeys = ApplicationServerKeys.fromJSON({ publicKey, privateKey });
  return cachedKeys;
}

export async function sendReplacementPush(input: {
  userId: string;
  productName: string;
  status: string;
  requestId: string;
}): Promise<{ sent: number; removed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", input.userId);
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  const applicationServerKeys = await keys();
  const subject = process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@example.com";
  const title = STATUS_TITLES[input.status] ?? "تحديث على طلب الاستبدال";
  const body = input.productName;
  const payload = JSON.stringify({
    title,
    body,
    url: `/replacements/${input.requestId}`,
    tag: `replacement-${input.requestId}`,
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        const req = await generatePushHTTPRequest({
          payload,
          applicationServerKeys,
          target: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          adminContact: subject,
          ttl: 60 * 60 * 24,
          urgency: "normal",
        });
        const res = await fetch(req.endpoint, {
          method: "POST",
          headers: req.headers,
          body: req.body,
        });
        if (res.ok || res.status === 201 || res.status === 202) {
          sent++;
        } else if (res.status === 404 || res.status === 410) {
          // Subscription is gone — clean up
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        } else {
          const text = await res.text().catch(() => "");
          console.error("[push] non-ok response", res.status, text);
        }
      } catch (err) {
        console.error("[push] endpoint error", err);
      }
    })
  );

  return { sent, removed };
}

export async function sendBroadcastPush(input: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; removed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  const applicationServerKeys = await keys();
  const subject = process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@example.com";
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? "/offers",
    tag: input.tag ?? `banner-${Date.now()}`,
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        const req = await generatePushHTTPRequest({
          payload,
          applicationServerKeys,
          target: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          adminContact: subject,
          ttl: 60 * 60 * 24,
          urgency: "normal",
        });
        const res = await fetch(req.endpoint, { method: "POST", headers: req.headers, body: req.body });
        if (res.ok || res.status === 201 || res.status === 202) {
          sent++;
        } else if (res.status === 404 || res.status === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        } else {
          const text = await res.text().catch(() => "");
          console.error("[push] non-ok response", res.status, text);
        }
      } catch (err) {
        console.error("[push] endpoint error", err);
      }
    }),
  );

  return { sent, removed };
}