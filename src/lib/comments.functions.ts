import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AddBannerCommentInput = z.object({
  bannerId: z.string().uuid(),
  content: z.string().trim().min(1).max(1000),
  parentId: z.string().uuid().optional().nullable(),
  isAdminReply: z.boolean().optional().default(false),
});

export const addBannerComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AddBannerCommentInput.parse(data))
  .handler(async ({ data, context }) => {
    const content = data.content.trim();

    const { data: banner, error: bannerError } = await context.supabase
      .from("banners")
      .select("id")
      .eq("id", data.bannerId)
      .eq("is_active", true)
      .maybeSingle();
    if (bannerError) throw new Error(bannerError.message);
    if (!banner) throw new Error("Banner not available");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("is_blocked")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.is_blocked) {
      throw new Error("حسابك محظور من التعليق بسبب مخالفة سابقة.");
    }

    let isAdminReply = false;
    if (data.isAdminReply) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (isAdmin) {
        isAdminReply = true;
      } else {
        const { data: staff } = await context.supabase
          .from("staff_permissions")
          .select("user_id")
          .eq("user_id", context.userId)
          .maybeSingle();
        isAdminReply = !!staff;
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("banner_comments")
      .insert({
        banner_id: data.bannerId,
        user_id: context.userId,
        parent_id: data.parentId || null,
        content,
        is_admin_reply: isAdminReply,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    // Dispatch in-app and push notifications for comment / reply
    try {
      const { dispatchCommentNotification } = await import("./comments-notify.server");
      await dispatchCommentNotification({
        bannerId: data.bannerId,
        commentId: row.id,
        authorId: context.userId,
        parentId: data.parentId || null,
        content,
        isAdminReply,
      });
    } catch (notifErr) {
      console.warn("[comments] Failed to dispatch comment notification:", notifErr);
    }

    return row;
  });