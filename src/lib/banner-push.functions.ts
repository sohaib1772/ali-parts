import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminOtp } from "@/integrations/supabase/require-admin-otp";

export const broadcastBannerPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bannerId: string }) => {
    if (!input || typeof input.bannerId !== "string" || !input.bannerId) {
      throw new Error("bannerId required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    await requireAdminOtp(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendBroadcastPush } = await import("./web-push.server");

    const { data: banner, error } = await supabaseAdmin
      .from("banners")
      .select("id, title_ar, subtitle_ar, video_url")
      .eq("id", data.bannerId)
      .maybeSingle();
    if (error || !banner) throw new Error(error?.message ?? "Banner not found");

    const isReel = !!(banner as any).video_url;
    const title = isReel ? "ريلز جديد 🎬" : "عرض حصري جديد 🎉";
    const body =
      (banner as any).title_ar ||
      (banner as any).subtitle_ar ||
      (isReel ? "شاهد أحدث الريلز الآن" : "شاهد أحدث العروض الحصرية الآن");

    try {
      const res = await sendBroadcastPush({ title, body, url: "/offers", tag: `banner-${banner.id}` });
      return { ok: true, ...res };
    } catch (err) {
      console.error("[push] broadcast failed", err);
      return { ok: false };
    }
  });