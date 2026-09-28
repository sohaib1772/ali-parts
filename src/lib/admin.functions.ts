import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminOtp } from "@/integrations/supabase/require-admin-otp";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function assertModerator(ctx: { supabase: any; userId: string }) {
  // Allow admins OR staff members with can_block permission.
  const [{ data: isAdmin }, { data: canBlock }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("staff_can", { _uid: ctx.userId, _perm: "block" }),
  ]);
  if (!isAdmin && !canBlock) throw new Error("Forbidden");
}

const SetPasswordInput = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(6).max(72),
});

const SetBlockedInput = z.object({
  user_id: z.string().uuid(),
  blocked: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

const UpdateUserRoleInput = z.object({
  user_id: z.string().uuid(),
  role_type: z.enum(["admin", "staff", "user"]),
  staff_permissions: z
    .object({
      can_orders: z.boolean().default(false),
      can_products: z.boolean().default(false),
      can_replacements: z.boolean().default(false),
      can_block: z.boolean().default(false),
    })
    .optional(),
});

const DeleteUserInput = z.object({
  user_id: z.string().uuid(),
});

export const adminSetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetPasswordInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetBlockedInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    if (data.user_id === context.userId) throw new Error("لا يمكنك حظر حسابك الإداري.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const blocked = data.blocked;
    const title = blocked ? "تم حظر حسابك من التعليقات" : "تم رفع الحظر عن حسابك";
    const body = data.reason || (blocked
      ? "تم حظرك بسبب تعليق مخالف لقوانين المجتمع. يرجى الالتزام بالكلام المحترم وتجنب الإساءة أو السبام أو المحتوى غير اللائق."
      : "تم رفع الحظر عن حسابك، يمكنك الآن التفاعل والتعليق بشكل طبيعي مع الالتزام بالقوانين.");

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.user_id, is_blocked: blocked }, { onConflict: "id" });
    if (profileError) throw new Error(profileError.message);

    const { error: logError } = await supabaseAdmin.from("user_block_log").insert({
      user_id: data.user_id,
      actor_id: context.userId,
      action: blocked ? "block" : "unblock",
    });
    if (logError) throw new Error(logError.message);

    const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
      user_id: data.user_id,
      type: "account_status",
      title,
      body,
    });
    if (notificationError) throw new Error(notificationError.message);

    return { ok: true, blocked };
  });

export const adminUpdateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateUserRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    if (data.user_id === context.userId) {
      throw new Error("لا يمكنك تغيير صلاحيات حسابك الإداري الحالي.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role_type === "admin") {
      // Add admin role in user_roles
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
      if (roleErr) throw new Error(roleErr.message);

      // Clean up staff permissions since full admin access takes precedence
      await supabaseAdmin.from("staff_permissions").delete().eq("user_id", data.user_id);
    } else if (data.role_type === "staff") {
      // Remove admin role
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");

      // Ensure profile exists or get name
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", data.user_id)
        .maybeSingle();
      const fullName = prof?.full_name || "موظف";

      const perms = data.staff_permissions ?? {
        can_orders: false,
        can_products: false,
        can_replacements: false,
        can_block: false,
      };

      const { error: permErr } = await supabaseAdmin.from("staff_permissions").upsert(
        {
          user_id: data.user_id,
          full_name: fullName,
          can_orders: !!perms.can_orders,
          can_products: !!perms.can_products,
          can_replacements: !!perms.can_replacements,
          can_block: !!perms.can_block,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (permErr) throw new Error(permErr.message);
    } else {
      // Regular customer/user
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("staff_permissions").delete().eq("user_id", data.user_id);
    }

    return { ok: true, role_type: data.role_type };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteUserInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    if (data.user_id === context.userId) {
      throw new Error("لا يمكنك حذف حسابك الإداري الحالي.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Get profile details for snapshots & avatar cleanup
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone, avatar_url")
      .eq("id", data.user_id)
      .maybeSingle();

    const v_name = prof?.full_name || "حساب محذوف";
    const v_phone = prof?.phone || "";
    const deletedAt = new Date().toISOString();

    // 2. Remove avatar from storage if present
    if (prof?.avatar_url && prof.avatar_url.includes("/avatars/")) {
      try {
        const key = prof.avatar_url.split("/avatars/")[1]?.split("?")[0];
        if (key) await supabaseAdmin.storage.from("avatars").remove([key]);
      } catch (err) {
        console.warn("[adminDeleteUser] avatar cleanup warning:", err);
      }
    }

    // 3. Preserve order snapshots & decouple user_id (same as delete_my_account)
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, address")
      .eq("user_id", data.user_id);

    if (orders && orders.length > 0) {
      for (const ord of orders) {
        const addr =
          ord.address && typeof ord.address === "object" && !Array.isArray(ord.address)
            ? (ord.address as Record<string, any>)
            : {};
        const updatedAddr = {
          ...addr,
          full_name: addr.full_name || v_name,
          phone: addr.phone || v_phone,
          account_deleted_at: deletedAt,
        };
        await supabaseAdmin
          .from("orders")
          .update({ user_id: null, address: updatedAddr })
          .eq("id", ord.id);
      }
    }

    // 4. Decouple replacement requests
    await supabaseAdmin
      .from("replacement_requests")
      .update({ user_id: null })
      .eq("user_id", data.user_id);

    // 5. Delete personal rows across related tables
    await supabaseAdmin.from("cart_items").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("favorites").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("addresses").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("device_tokens").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("notifications").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("banner_comments").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("banner_likes").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("staff_permissions").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("admin_otp_verifications").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("admin_otp_challenges").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);

    // 6. Delete auth user
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (delErr) {
      console.warn("[adminDeleteUser] auth delete warning:", delErr.message);
    }

    return { ok: true, user_id: data.user_id };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    return await listUsersImpl(context);
  });

export const moderatorListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModerator(context);
    await requireAdminOtp(context);
    return await listUsersImpl(context);
  });

async function listUsersImpl(context: { supabase: any; userId: string }) {
  let all: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  }> = [];

  let fetchedFromAuth = false;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const perPage = 200;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const users = data?.users ?? [];
      for (const u of users) {
        all.push({
          id: u.id,
          email: u.email ?? null,
          phone: (u.user_metadata as any)?.phone ?? u.phone ?? null,
          created_at: u.created_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
      if (users.length < perPage) break;
    }
    fetchedFromAuth = true;
  } catch (err) {
    console.warn("[adminListUsers] Service role admin auth listing failed or key missing, falling back to profiles table:", err);
  }

  let profileMap = new Map<string, { full_name: string | null; phone: string | null; is_blocked: boolean | null; created_at?: string | null }>();
  let rolesSet = new Set<string>();
  let staffMap = new Map<string, { can_orders: boolean; can_products: boolean; can_replacements: boolean; can_block: boolean }>();

  if (fetchedFromAuth) {
    // Enrich with profile info (full_name, is_blocked)
    const ids = all.map((u) => u.id);
    if (ids.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, phone, is_blocked")
        .in("id", ids);
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { full_name: p.full_name, phone: p.phone, is_blocked: p.is_blocked });
      }

      // Fetch user roles
      try {
        const { data: roles } = await context.supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        for (const r of roles ?? []) {
          if (r.role === "admin") rolesSet.add(r.user_id);
        }
      } catch (err) {
        console.warn("[adminListUsers] user_roles fetch warning:", err);
      }

      // Fetch staff permissions
      try {
        const { data: staff } = await context.supabase
          .from("staff_permissions")
          .select("user_id, can_orders, can_products, can_replacements, can_block")
          .in("user_id", ids);
        for (const s of staff ?? []) {
          staffMap.set(s.user_id, {
            can_orders: !!s.can_orders,
            can_products: !!s.can_products,
            can_replacements: !!s.can_replacements,
            can_block: !!s.can_block,
          });
        }
      } catch (err) {
        console.warn("[adminListUsers] staff_permissions fetch warning:", err);
      }
    }
  } else {
    // Fallback: fetch all profiles directly using admin's context
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name, phone, is_blocked, created_at");
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, phone: p.phone, is_blocked: p.is_blocked, created_at: p.created_at });
      all.push({
        id: p.id,
        email: null,
        phone: p.phone ?? null,
        created_at: p.created_at ?? null,
        last_sign_in_at: p.created_at ?? null,
      });
    }

    const ids = all.map((u) => u.id);
    if (ids.length > 0) {
      try {
        const { data: roles } = await context.supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        for (const r of roles ?? []) {
          if (r.role === "admin") rolesSet.add(r.user_id);
        }
      } catch {}

      try {
        const { data: staff } = await context.supabase
          .from("staff_permissions")
          .select("user_id, can_orders, can_products, can_replacements, can_block")
          .in("user_id", ids);
        for (const s of staff ?? []) {
          staffMap.set(s.user_id, {
            can_orders: !!s.can_orders,
            can_products: !!s.can_products,
            can_replacements: !!s.can_replacements,
            can_block: !!s.can_block,
          });
        }
      } catch {}
    }
  }

  // Fetch device tokens for push notifications (FCM tokens)
  const deviceTokenMap = new Map<string, Array<{ token: string; platform: string; last_seen: string }>>();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin ?? context.supabase;
    const { data: tokens } = await client
      .from("device_tokens")
      .select("user_id, token, platform, last_seen")
      .order("last_seen", { ascending: false });
    for (const t of tokens ?? []) {
      const list = deviceTokenMap.get(t.user_id) ?? [];
      list.push({
        token: t.token,
        platform: t.platform ?? "android",
        last_seen: t.last_seen,
      });
      deviceTokenMap.set(t.user_id, list);
    }
  } catch (err) {
    console.warn("[adminListUsers] device_tokens fetch warning:", err);
  }

  const now = Date.now();
  const ACTIVE_MS = 15 * 60 * 1000;
  let activeCount = 0;
  const enriched = all.map((u) => {
    const prof = profileMap.get(u.id);
    const last = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
    const isActive = last > 0 && now - last <= ACTIVE_MS;
    if (isActive) activeCount++;

    const isAdmin = rolesSet.has(u.id);
    const staffPerms = staffMap.get(u.id) ?? null;
    const isStaff =
      !isAdmin &&
      !!staffPerms &&
      (staffPerms.can_orders || staffPerms.can_products || staffPerms.can_replacements || staffPerms.can_block);

    const userTokens = deviceTokenMap.get(u.id) ?? [];

    return {
      ...u,
      full_name: prof?.full_name ?? null,
      profile_phone: prof?.phone ?? null,
      is_blocked: prof?.is_blocked ?? false,
      is_active: isActive,
      is_admin: isAdmin,
      is_staff: isStaff,
      staff_permissions: staffPerms,
      device_tokens: userTokens,
      fcm_token: userTokens[0]?.token ?? null,
      device_platform: userTokens[0]?.platform ?? null,
    };
  });

  enriched.sort((a, b) => {
    const ta = a.last_sign_in_at ? Date.parse(a.last_sign_in_at) : 0;
    const tb = b.last_sign_in_at ? Date.parse(b.last_sign_in_at) : 0;
    return tb - ta;
  });

  return {
    total: enriched.length,
    active: activeCount,
    users: enriched,
  };
}

/**
 * Clear ALL FCM device tokens from the database. Users will automatically
 * re-register a fresh token the next time they open the app (see native-push.ts).
 * This is useful when stale/broken tokens (especially on iOS) cause push
 * notifications to silently fail after the first delivery.
 */
export const adminClearAllFcmTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Count before deleting so we can report back.
    const { count } = await supabaseAdmin
      .from("device_tokens")
      .select("*", { count: "exact", head: true });

    // Delete all rows. The neq filter on a non-nullable column is a Supabase
    // workaround to delete all rows (there is no .deleteAll()).
    const { error } = await supabaseAdmin
      .from("device_tokens")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);

    return { ok: true, cleared: count ?? 0 };
  });