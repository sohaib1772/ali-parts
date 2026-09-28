import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: Admin access required");
}

export type NotificationLogItem = {
  id: string;
  created_at: string;
  user_id: string | null;
  event_type: string;
  status: "success" | "failure" | "warning" | "info";
  platform: string | null;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  token_preview: string | null;
  title: string | null;
  message: string | null;
  error_details: string | null;
  metadata: Record<string, unknown>;
  user?: {
    full_name: string | null;
    phone: string | null;
  } | null;
};

export type NotificationLogStats = {
  total24h: number;
  failures24h: number;
  successes24h: number;
  iosCount: number;
  androidCount: number;
  webCount: number;
};

const ListLogsInput = z.object({
  status: z.enum(["all", "failure", "success", "warning", "info"]).default("all"),
  platform: z.enum(["all", "ios", "android", "web", "server"]).default("all"),
  search: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(300).default(100),
  offset: z.number().int().min(0).default(0),
});

export const listNotificationLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListLogsInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{
    logs: NotificationLogItem[];
    stats: NotificationLogStats;
  }> => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch query with filters
    let query = supabaseAdmin
      .from("notification_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.status !== "all") {
      query = query.eq("status", data.status);
    }

    if (data.platform !== "all") {
      query = query.eq("platform", data.platform);
    }

    if (data.search && data.search.trim()) {
      const term = data.search.trim();
      // Search title, message, error_details, or token_preview
      query = query.or(
        `title.ilike.%${term}%,message.ilike.%${term}%,error_details.ilike.%${term}%,token_preview.ilike.%${term}%,device_model.ilike.%${term}%`,
      );
    }

    const { data: rows, error } = await query;
    if (error) {
      console.warn("[listNotificationLogs] query notice (table might not exist yet):", error.message);
      return {
        logs: [],
        stats: {
          total24h: 0,
          failures24h: 0,
          successes24h: 0,
          iosCount: 0,
          androidCount: 0,
          webCount: 0,
        },
      };
    }

    const rawLogs = (rows ?? []) as Array<Omit<NotificationLogItem, "user">>;

    // 2. Fetch associated user profiles
    const userIds = Array.from(
      new Set(rawLogs.map((r) => r.user_id).filter(Boolean)),
    ) as string[];

    const userMap = new Map<string, { full_name: string | null; phone: string | null }>();

    if (userIds.length > 0) {
      try {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", userIds);

        if (profiles) {
          for (const p of profiles) {
            userMap.set(p.id, { full_name: p.full_name, phone: p.phone });
          }
        }
      } catch (profErr) {
        console.warn("[listNotificationLogs] profiles fetch notice:", profErr);
      }
    }

    const logs: NotificationLogItem[] = rawLogs.map((r) => ({
      ...r,
      user: r.user_id ? userMap.get(r.user_id) ?? null : null,
    }));

    // 3. Compute stats for last 24 hours
    let total24h = 0;
    let failures24h = 0;
    let successes24h = 0;
    let iosCount = 0;
    let androidCount = 0;
    let webCount = 0;

    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentRows } = await supabaseAdmin
        .from("notification_logs")
        .select("status, platform")
        .gte("created_at", since24h);

      if (recentRows) {
        total24h = recentRows.length;
        for (const row of recentRows) {
          if (row.status === "failure") failures24h++;
          if (row.status === "success") successes24h++;
          if (row.platform === "ios") iosCount++;
          else if (row.platform === "android") androidCount++;
          else if (row.platform === "web") webCount++;
        }
      }
    } catch {}

    return {
      logs,
      stats: {
        total24h,
        failures24h,
        successes24h,
        iosCount,
        androidCount,
        webCount,
      },
    };
  });

const ClearLogsInput = z.object({
  keepDays: z.number().int().min(1).max(365).default(30),
});

export const clearOldNotificationLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearLogsInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - data.keepDays * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("notification_logs")
      .delete()
      .lt("created_at", cutoff);

    if (error) throw new Error(error.message);
    return { ok: true, cutoff };
  });
