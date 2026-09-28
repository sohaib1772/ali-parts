import { supabaseAdmin } from "@/integrations/supabase/client.server";

function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return isFinite(val) ? String(val) : "NULL";
  if (typeof val === "string") {
    return `'${val.replace(/'/g, "''")}'`;
  }
  if (Array.isArray(val) || typeof val === "object") {
    const jsonStr = JSON.stringify(val);
    return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

const BACKUP_TABLES = [
  "categories",
  "brands",
  "car_models",
  "products",
  "banners",
  "profiles",
  "user_roles",
  "staff_permissions",
  "addresses",
  "orders",
  "order_items",
  "cart_items",
  "favorites",
  "notifications",
  "replacement_requests",
  "replacement_status_log",
  "banner_comments",
  "banner_likes",
  "app_settings",
  "stock_movements",
  "user_block_log",
  "device_tokens",
  "push_subscriptions",
  "audit_logs",
] as const;

export async function handleAdminBackup(request: Request): Promise<Response> {
  // Only GET or POST allowed
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1. Authenticate user from Bearer token
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;

  // 2. Authorize admin role
  const { data: roleRow, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || !roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Format filename with timestamp
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `maktabali_backup_${timestampStr}.sql`;

  let sqlDump: string | null = null;
  let methodUsed = "docker_pg_dump";

  // 4. Primary: Try docker exec pg_dump if host allows
  try {
    const { execSync } = await import("child_process");
    const out = execSync("docker exec -t supabase-db pg_dump -U postgres postgres", {
      maxBuffer: 100 * 1024 * 1024, // up to 100MB
      timeout: 120000,              // 2 minutes max
    });
    if (out && out.length > 500) {
      sqlDump = out.toString("utf-8");
    }
  } catch (err: any) {
    console.warn("[backup] docker pg_dump failed, using Supabase API fallback:", err?.message || err);
  }

  // 5. Fallback: Query all tables via supabaseAdmin and format SQL statements
  if (!sqlDump) {
    methodUsed = "api_snapshot";
    const sqlChunks: string[] = [];

    sqlChunks.push(`-- ========================================================
-- Maktab Ali Auto Parts Database Backup
-- Generated: ${now.toISOString()}
-- Source: api.maktabali.com
-- Mode: Full Table Data Snapshot
-- ========================================================
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

BEGIN;
`);

    const PAGE_SIZE = 1000;

    for (const table of BACKUP_TABLES) {
      try {
        let from = 0;
        let hasMore = true;
        let tableHeaderWritten = false;

        while (hasMore) {
          const { data: rows, error: tableErr } = await (supabaseAdmin as any)
            .from(table)
            .select("*")
            .range(from, from + PAGE_SIZE - 1);

          if (tableErr) {
            console.error(`[backup] Error reading table ${table}:`, tableErr.message);
            break;
          }

          if (rows && rows.length > 0) {
            if (!tableHeaderWritten) {
              sqlChunks.push(`\n--\n-- Data for Name: ${table}; Type: TABLE DATA; Schema: public\n--\n`);
              tableHeaderWritten = true;
            }

            for (const row of rows) {
              const keys = Object.keys(row);
              if (keys.length === 0) continue;
              const cols = keys.map((k) => `"${k}"`).join(", ");
              const values = keys.map((k) => escapeSqlValue(row[k])).join(", ");
              sqlChunks.push(`INSERT INTO public."${table}" (${cols}) VALUES (${values});\n`);
            }

            if (rows.length < PAGE_SIZE) {
              hasMore = false;
            } else {
              from += PAGE_SIZE;
            }
          } else {
            hasMore = false;
          }
        }
      } catch (err) {
        console.error(`[backup] Unexpected error backing up table ${table}:`, err);
      }
    }

    sqlChunks.push(`\nCOMMIT;\n\n-- PostgreSQL database dump complete\n`);
    sqlDump = sqlChunks.join("");
  }

  // 6. Log audit event
  try {
    await supabaseAdmin.from("audit_logs").insert({
      action: "database_backup_downloaded",
      actor_id: userId,
      entity_type: "database",
      metadata: {
        method: methodUsed,
        bytes: sqlDump.length,
        filename,
        generated_at: now.toISOString(),
      },
    });
  } catch (auditErr) {
    console.warn("[backup] Failed to write audit log:", auditErr);
  }

  // 7. Return download response
  return new Response(sqlDump, {
    status: 200,
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
