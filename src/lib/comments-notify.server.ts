import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function dispatchCommentNotification({
  bannerId,
  commentId,
  authorId,
  parentId,
  content,
  isAdminReply = false,
}: {
  bannerId: string;
  commentId?: string;
  authorId: string;
  parentId?: string | null;
  content: string;
  isAdminReply?: boolean;
}): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed || !authorId || !bannerId) return;

  const preview = trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;

  try {
    // 1. Resolve author display name
    let authorName = "مستخدم";
    if (isAdminReply) {
      authorName = "مكتب علي شوفرليت";
    } else {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", authorId)
        .maybeSingle();
      if (profile?.full_name) {
        authorName = profile.full_name;
      }
    }

    // 2. If this is a REPLY (parentId provided)
    if (parentId) {
      const { data: parent } = await supabaseAdmin
        .from("banner_comments")
        .select("user_id")
        .eq("id", parentId)
        .maybeSingle();

      const recipientId = parent?.user_id;
      // Do not notify self if replying to own comment
      if (recipientId && recipientId !== authorId) {
        // Dedup check in last 15 seconds
        const cutoff = new Date(Date.now() - 15000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", recipientId)
          .eq("type", "banner_reply")
          .eq("status", bannerId)
          .gt("created_at", cutoff)
          .limit(1);

        if (!recent || recent.length === 0) {
          await supabaseAdmin.from("notifications").insert({
            user_id: recipientId,
            type: "banner_reply",
            status: bannerId, // used for deep linking to the banner/reel
            title: isAdminReply ? "رد من مكتب علي شوفرليت" : "رد جديد على تعليقك",
            body: `${authorName}: "${preview}"`,
          });
        }
      }
    } else {
      // 3. This is a TOP-LEVEL comment (parentId is null)
      // Only notify admins and staff if a user/customer commented
      if (!isAdminReply) {
        // Fetch banner title for context
        const { data: banner } = await supabaseAdmin
          .from("banners")
          .select("title_ar")
          .eq("id", bannerId)
          .maybeSingle();
        const bannerTitle = banner?.title_ar ? `على ${banner.title_ar}` : "على العرض";

        // Query all admin user_ids
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        // Query all staff user_ids
        const { data: staff } = await supabaseAdmin
          .from("staff_permissions")
          .select("user_id");

        const recipientSet = new Set<string>();
        for (const a of admins ?? []) recipientSet.add(a.user_id);
        for (const s of staff ?? []) recipientSet.add(s.user_id);
        recipientSet.delete(authorId); // do not notify commenter

        const cutoff = new Date(Date.now() - 15000).toISOString();

        for (const recipientId of recipientSet) {
          const { data: recent } = await supabaseAdmin
            .from("notifications")
            .select("id")
            .eq("user_id", recipientId)
            .eq("type", "banner_comment")
            .eq("status", bannerId)
            .gt("created_at", cutoff)
            .limit(1);

          if (!recent || recent.length === 0) {
            await supabaseAdmin.from("notifications").insert({
              user_id: recipientId,
              type: "banner_comment",
              status: bannerId, // used for deep linking to the banner/reel
              title: `تعليق جديد ${bannerTitle}`,
              body: `${authorName}: "${preview}"`,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[comments-notify] Failed to dispatch notification:", err);
  }
}

/**
 * HTTP handler for POST /api/banner-comments/notify
 * Called by the Flutter app (or Web) after a comment or reply is inserted.
 */
export async function handleCommentNotify(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Verify the JWT token
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user?.id) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const callerId = userData.user.id;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { banner_id, comment_id, parent_id, content, is_admin_reply } = body ?? {};
  if (!banner_id || !content) {
    return new Response(JSON.stringify({ error: "Missing banner_id or content" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await dispatchCommentNotification({
    bannerId: String(banner_id),
    commentId: comment_id ? String(comment_id) : undefined,
    authorId: callerId,
    parentId: parent_id ? String(parent_id) : null,
    content: String(content),
    isAdminReply: Boolean(is_admin_reply),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
