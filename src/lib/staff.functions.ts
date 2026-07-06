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

const CreateInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  full_name: z.string().trim().min(1).max(100),
  can_orders: z.boolean().default(false),
  can_products: z.boolean().default(false),
  can_replacements: z.boolean().default(false),
});

const UpdateInput = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(6).max(72).optional().or(z.literal("").transform(() => undefined)),
  can_orders: z.boolean().optional(),
  can_products: z.boolean().optional(),
  can_replacements: z.boolean().optional(),
});

const IdInput = z.object({ user_id: z.string().uuid() });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message ?? "فشل إنشاء الحساب");

    const userId = created.user.id;

    // Ensure profile has the name
    await supabaseAdmin.from("profiles").upsert(
      { id: userId, full_name: data.full_name },
      { onConflict: "id" },
    );

    const { error: permErr } = await supabaseAdmin.from("staff_permissions").insert({
      user_id: userId,
      full_name: data.full_name,
      can_orders: data.can_orders,
      can_products: data.can_products,
      can_replacements: data.can_replacements,
    });
    if (permErr) {
      // Roll back the auth user on permission-insert failure so we don't leave orphans.
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(permErr.message);
    }

    return { ok: true, user_id: userId };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }

    const patch: Record<string, unknown> = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.can_orders !== undefined) patch.can_orders = data.can_orders;
    if (data.can_products !== undefined) patch.can_products = data.can_products;
    if (data.can_replacements !== undefined) patch.can_replacements = data.can_replacements;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("staff_permissions")
        .update(patch)
        .eq("user_id", data.user_id);
      if (error) throw new Error(error.message);

      if (data.full_name !== undefined) {
        await supabaseAdmin
          .from("profiles")
          .update({ full_name: data.full_name })
          .eq("id", data.user_id);
      }
    }

    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("لا يمكنك حذف حسابك.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Remove permissions first (cascade from auth.users would also handle it,
    // but be explicit so RLS side-effects apply immediately).
    await supabaseAdmin.from("staff_permissions").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staff, error } = await supabaseAdmin
      .from("staff_permissions")
      .select("user_id, full_name, can_orders, can_products, can_replacements, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = staff ?? [];
    if (rows.length === 0) return { staff: [] as any[] };

    // Fetch emails from auth
    const emailMap = new Map<string, string | null>();
    for (let page = 1; page <= 20; page++) {
      const { data, error: e } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (e) break;
      for (const u of data?.users ?? []) emailMap.set(u.id, u.email ?? null);
      if ((data?.users ?? []).length < 200) break;
    }

    return {
      staff: rows.map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        email: emailMap.get(r.user_id) ?? null,
        can_orders: r.can_orders,
        can_products: r.can_products,
        can_replacements: r.can_replacements,
        created_at: r.created_at,
      })),
    };
  });