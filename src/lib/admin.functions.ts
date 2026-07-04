import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

const SetPasswordInput = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(6).max(72),
});

export const adminSetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetPasswordInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const perPage = 200;
    const all: Array<{
      id: string;
      email: string | null;
      phone: string | null;
      created_at: string | null;
      last_sign_in_at: string | null;
    }> = [];
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

    // Enrich with profile info (full_name, is_blocked)
    const ids = all.map((u) => u.id);
    let profileMap = new Map<string, { full_name: string | null; phone: string | null; is_blocked: boolean | null }>();
    if (ids.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, phone, is_blocked")
        .in("id", ids);
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { full_name: p.full_name, phone: p.phone, is_blocked: p.is_blocked });
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
  });