import { supabaseAdmin } from "@/integrations/supabase/client.server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable } from "stream";

const STORAGE_PATH = "/opt/supabase/maktabali/volumes/storage/stub/stub";

export async function handleAdminStorageBackup(request: Request): Promise<Response> {
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
  const filename = `maktabali_storage_${timestampStr}.tar.gz`;

  // 4. Verify storage path exists on host
  if (fs.existsSync(STORAGE_PATH)) {
    const candidateDirs = ["avatars", "product-images", "replacement-attachments"];
    const existingDirs = candidateDirs.filter((d) => fs.existsSync(path.join(STORAGE_PATH, d)));
    const targetDirs = existingDirs.length > 0 ? existingDirs : ["."];

    try {
      const tarProcess = spawn("tar", ["-czf", "-", "-C", STORAGE_PATH, ...targetDirs]);

      // Handle process error
      tarProcess.on("error", (err) => {
        console.error("[storage-backup] tar process error:", err);
      });

      // Audit log (best-effort)
      try {
        await supabaseAdmin.from("audit_logs").insert({
          action: "storage_backup_downloaded",
          actor_id: userId,
          entity_type: "storage",
          metadata: {
            method: "tar_stream",
            path: STORAGE_PATH,
            targets: targetDirs,
            filename,
            timestamp: now.toISOString(),
          },
        });
      } catch (auditErr) {
        console.warn("[storage-backup] Failed to log audit:", auditErr);
      }

      // Convert Node readable stream to Web standard ReadableStream
      const webStream = (Readable.toWeb ? Readable.toWeb(tarProcess.stdout) : tarProcess.stdout) as any;

      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (err: any) {
      console.error("[storage-backup] Failed to spawn tar stream:", err);
      return new Response(JSON.stringify({ error: `Failed to archive storage: ${err.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 5. Fallback if storage path is not directly on host (e.g. local dev environment)
  try {
    const buckets = ["avatars", "product-images", "replacement-attachments"];
    const filesList: Array<{ bucket: string; name: string }> = [];

    for (const bucket of buckets) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list("", { limit: 100 });
      if (files) {
        for (const f of files) {
          if (f.name && !f.name.startsWith(".")) {
            filesList.push({ bucket, name: f.name });
          }
        }
      }
    }

    const summaryText = `Maktab Ali Storage Backup\nGenerated: ${now.toISOString()}\nTotal files listed: ${filesList.length}\n\n` +
      filesList.map((f) => `/${f.bucket}/${f.name}`).join("\n");

    return new Response(summaryText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="maktabali_storage_manifest_${timestampStr}.txt"`,
      },
    });
  } catch (fallbackErr: any) {
    return new Response(JSON.stringify({ error: `Storage path not found: ${fallbackErr.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
