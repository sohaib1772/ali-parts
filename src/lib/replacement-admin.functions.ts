import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminOtp } from "@/integrations/supabase/require-admin-otp";

const VALID_STATUSES = ["pending", "in_review", "approved", "rejected", "resolved"] as const;
type Status = (typeof VALID_STATUSES)[number];

export const adminUpdateReplacementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: Status }) => {
    if (!input || typeof input.id !== "string" || !input.id) throw new Error("id required");
    if (!VALID_STATUSES.includes(input.status)) throw new Error("invalid status");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    await requireAdminOtp(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendReplacementPush } = await import("./web-push.server");

    const { data: updated, error } = await supabaseAdmin
      .from("replacement_requests")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id, user_id, product_name_ar, status")
      .single();
    if (error || !updated) throw new Error(error?.message ?? "Update failed");

    // Fire-and-forget: don't block admin UI if push fails
    try {
      await sendReplacementPush({
        userId: (updated as any).user_id,
        productName: (updated as any).product_name_ar ?? "طلب استبدال",
        status: (updated as any).status,
        requestId: (updated as any).id,
      });
    } catch (err) {
      console.error("[push] send failed", err);
    }

    return { ok: true };
  });