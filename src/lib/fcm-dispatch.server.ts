import { sendFcmToUser, type FcmPayload } from "@/lib/fcm.server";

/**
 * Internal endpoint the DB calls (async, via net.http_post) once per inserted
 * notification row. It is NOT a user-facing route: it authenticates with a
 * shared secret (FCM_DISPATCH_SECRET), not a user session, because the caller is
 * Postgres, not a browser. See migration 20260725120000 (dispatch_notification_push).
 *
 * Flow: {notification_id, secret} -> load the row with the service role ->
 * derive the tap deep-link from its type/order_id -> fan out to that user's FCM
 * tokens. Because every in-app notification funnels through public.notifications,
 * this one endpoint mirrors order, replacement, banner, broadcast and block
 * events without knowing anything about them individually.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Map a notification row to the FCM `data` the client uses for deep-linking and deduplication. */
function dataForNotification(row: {
  id: string;
  type: string | null;
  order_id: string | null;
  product_id?: string | null;
  status?: string | null;
}): Record<string, string> {
  const data: Record<string, string> = {
    notification_id: row.id,
    type: row.type ?? "",
  };
  if (row.status) {
    data.status = row.status;
    if (row.type === "banner_comment" || row.type === "banner_reply") {
      data.banner_id = row.status;
      data.url = "/offers";
    }
  }
  if (row.product_id) {
    data.product_id = row.product_id;
    if (row.type === "new_product") {
      data.url = `/product/${row.product_id}`;
    }
  }
  if (row.order_id) {
    data.order_id = row.order_id;
    if (row.type === "admin_new_order") {
      data.url = "/admin";
    }
  } else if ((row.type ?? "").startsWith("replacement") || row.type === "admin_new_replacement") {
    data.url = row.type === "admin_new_replacement" ? "/admin" : "/replacements";
  } else if (!data.url) {
    data.url = "/notifications";
  }
  return data;
}

export async function handleFcmDispatch(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = process.env.FCM_DISPATCH_SECRET;
  if (!secret) {
    // Not configured on this server — treat as disabled, not an error.
    console.error("[fcm-dispatch] FCM_DISPATCH_SECRET is not set");
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notification_logs").insert({
        event_type: "dispatch_error",
        status: "failure",
        platform: "server",
        title: "خطأ في تهيئة سر FCM Dispatch",
        message: "المتغير FCM_DISPATCH_SECRET غير مضبوط على هذا السيرفر.",
      });
    } catch {}
    return new Response(JSON.stringify({ ok: false, reason: "not_configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  let payload: { notification_id?: unknown; secret?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const provided = typeof payload.secret === "string" ? payload.secret : "";
  if (!timingSafeEqual(provided, secret)) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notification_logs").insert({
        event_type: "dispatch_auth_failed",
        status: "failure",
        platform: "server",
        title: "فشل التحقق من كلمة سر FCM Dispatch",
        message: "طلب غير مصرح به وصل إلى webhook الإشعارات (كلمة السر غير متطابقة).",
      });
    } catch {}
    return new Response("Forbidden", { status: 403 });
  }

  const notificationId = typeof payload.notification_id === "string" ? payload.notification_id : "";
  if (!notificationId) {
    return new Response("Bad Request", { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id, type, title, body, order_id, product_id, image_url, status")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    console.error("[fcm-dispatch] load failed", error.message);
    try {
      await supabaseAdmin.from("notification_logs").insert({
        event_type: "dispatch_load_failed",
        status: "failure",
        platform: "server",
        title: "فشل تحميل الإشعار من الداتابيس",
        message: "تعذر قراءة بيانات الإشعار المطلوب إرساله.",
        error_details: error.message,
        metadata: { notification_id: notificationId },
      });
    } catch {}
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  if (!row) {
    // Row may have been deleted between insert and dispatch — nothing to do.
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const fcm: FcmPayload = {
    title: row.title ?? "إشعار",
    body: row.body ?? "",
    ...(row.image_url ? { image: row.image_url } : {}),
    data: dataForNotification(row),
  };

  try {
    const result = await sendFcmToUser(row.user_id, fcm);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[fcm-dispatch] send failed", err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
