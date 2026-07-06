import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendBroadcastPush } = await import("./web-push.server");

    const title = "🔔 اختبار الإشعارات";
    const body = "هذا إشعار تجريبي من الإدارة للتأكد من وصول الإشعارات.";

    // Internal notifications for every user
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id");
    let internal = 0;
    if (profiles && profiles.length > 0) {
      const rows = profiles.map((p: any) => ({
        user_id: p.id,
        type: "promo",
        title,
        body,
      }));
      const { error: insErr } = await supabaseAdmin.from("notifications").insert(rows);
      if (insErr) console.error("[test-notif] internal insert error", insErr);
      else internal = rows.length;
    }

    // External web-push broadcast
    let sent = 0;
    let removed = 0;
    try {
      const res = await sendBroadcastPush({ title, body, url: "/notifications", tag: `test-${Date.now()}` });
      sent = res.sent;
      removed = res.removed;
    } catch (err) {
      console.error("[test-notif] push broadcast failed", err);
    }

    return { ok: true, internal, sent, removed };
  });