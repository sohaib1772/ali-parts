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

const PreviewInput = z.object({
  old_rate: z.number().positive(),
  new_rate: z.number().positive(),
  rounding: z.number().int().min(0),
  excluded_ids: z.array(z.string().uuid()).default([]),
});

const ApplyInput = PreviewInput.extend({
  note: z.string().trim().max(200).optional(),
});

const RestoreInput = z.object({ backup_id: z.string().uuid() });

function computeNewPrice(current: number, oldRate: number, newRate: number, rounding: number): number {
  const raw = (current * newRate) / oldRate;
  if (rounding && rounding > 0) {
    return Math.max(0, Math.round(raw / rounding) * rounding);
  }
  return Math.max(0, Math.round(raw));
}

export const previewBulkPriceUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id, name_ar, price_iqd")
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);

    const excluded = new Set(data.excluded_ids);
    const items = (products ?? []).map((p: any) => {
      const cur = Number(p.price_iqd) || 0;
      const isExcluded = excluded.has(p.id);
      const next = isExcluded ? cur : computeNewPrice(cur, data.old_rate, data.new_rate, data.rounding);
      return {
        id: p.id,
        name_ar: p.name_ar,
        old_price: cur,
        new_price: next,
        diff: next - cur,
        excluded: isExcluded,
      };
    });
    return { items, count: items.length };
  });

export const applyBulkPriceUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id, price_iqd");
    if (error) throw new Error(error.message);

    const excluded = new Set(data.excluded_ids);
    const items: { id: string; old_price: number; new_price: number }[] = [];
    const updates: { id: string; new_price: number }[] = [];
    for (const p of products ?? []) {
      const cur = Number((p as any).price_iqd) || 0;
      if (excluded.has((p as any).id)) continue;
      const next = computeNewPrice(cur, data.old_rate, data.new_rate, data.rounding);
      if (next === cur) continue;
      items.push({ id: (p as any).id, old_price: cur, new_price: next });
      updates.push({ id: (p as any).id, new_price: next });
    }

    // Save backup first
    const { data: backup, error: backupErr } = await supabaseAdmin
      .from("price_update_backups")
      .insert({
        actor_id: context.userId,
        old_rate: data.old_rate,
        new_rate: data.new_rate,
        rounding: data.rounding,
        excluded_ids: data.excluded_ids,
        items,
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (backupErr) throw new Error(backupErr.message);

    // Apply updates in chunks
    const chunkSize = 100;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((u) =>
          supabaseAdmin.from("products").update({ price_iqd: u.new_price }).eq("id", u.id),
        ),
      );
    }

    return { ok: true, backup_id: backup.id, updated: updates.length };
  });

export const listPriceBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("price_update_backups")
      .select("id, created_at, old_rate, new_rate, rounding, note, items")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((b: any) => ({
      id: b.id,
      created_at: b.created_at,
      old_rate: Number(b.old_rate),
      new_rate: Number(b.new_rate),
      rounding: b.rounding,
      note: b.note,
      count: Array.isArray(b.items) ? b.items.length : 0,
    }));
  });

export const restorePriceBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RestoreInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: backup, error } = await supabaseAdmin
      .from("price_update_backups")
      .select("items")
      .eq("id", data.backup_id)
      .single();
    if (error) throw new Error(error.message);
    const items = (backup?.items ?? []) as Array<{ id: string; old_price: number }>;
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((it) =>
          supabaseAdmin.from("products").update({ price_iqd: it.old_price }).eq("id", it.id),
        ),
      );
    }
    return { ok: true, restored: items.length };
  });