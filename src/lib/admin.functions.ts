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
    }

    const now = Date.now();
    const ACTIVE_MS = 15 * 60 * 1000;
    let activeCount = 0;
    const enriched = all.map((u) => {
      const prof = profileMap.get(u.id);
      const last = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
      const isActive = last > 0 && now - last <= ACTIVE_MS;
      if (isActive) activeCount++;
      return {
        ...u,
        full_name: prof?.full_name ?? null,
        profile_phone: prof?.phone ?? null,
        is_blocked: prof?.is_blocked ?? false,
        is_active: isActive,
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