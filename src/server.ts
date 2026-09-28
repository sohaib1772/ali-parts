import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const pathname = new URL(request.url).pathname;

      // Digital Asset Links for Android App Links domain verification
      if (pathname === "/.well-known/assetlinks.json") {
        return new Response(
          JSON.stringify([
            {
              relation: ["delegate_permission/common.handle_all_urls"],
              target: {
                namespace: "android_app",
                package_name: "com.mkteb.ali.chevrolet",
                sha256_cert_fingerprints: [
                  "F5:FC:61:DC:01:A9:40:BA:1F:9F:82:4A:AB:A2:5E:38:BC:7F:8A:23:BB:0C:3E:D5:06:E4:09:CB:BF:2D:37:FC",
                ],
              },
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
              "cache-control": "public, max-age=86400",
            },
          },
        );
      }

      // CORS Preflight
      if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "Content-Type, Authorization",
          },
        });
      }

      // Internal FCM dispatch endpoint the database posts to (net.http_post).
      // Handled here, ahead of the SSR router, so it needs no user-facing route
      // and authenticates by shared secret rather than a session.
      if (pathname === "/api/internal/fcm-dispatch") {
        const { handleFcmDispatch } = await import("./lib/fcm-dispatch.server");
        return await handleFcmDispatch(request);
      }

      // Comment & reply notification dispatch endpoint for mobile & web clients
      if (pathname === "/api/banner-comments/notify") {
        const { handleCommentNotify } = await import("./lib/comments-notify.server");
        return await handleCommentNotify(request);
      }

      // Admin database backup download endpoint
      if (pathname === "/api/admin/backup") {
        const { handleAdminBackup } = await import("./lib/backup.server");
        return await handleAdminBackup(request);
      }

      // Admin storage & images backup download endpoint
      if (pathname === "/api/admin/backup-storage") {
        const { handleAdminStorageBackup } = await import("./lib/storage-backup.server");
        return await handleAdminStorageBackup(request);
      }

      // Admin orders archiving endpoints (protected by server env secret)
      if (pathname === "/api/admin/archive-all-orders" || pathname === "/api/admin/archive-orders") {
        const { handleAdminArchiveOrders } = await import("./lib/orders-archive.server");
        return await handleAdminArchiveOrders(request);
      }

      if (pathname === "/api/admin/delete-orders") {
        const { handleAdminDeleteOrders } = await import("./lib/orders-archive.server");
        return await handleAdminDeleteOrders(request);
      }

      if (pathname === "/api/admin/unarchive-order") {
        const { handleAdminUnarchiveOrder } = await import("./lib/orders-archive.server");
        return await handleAdminUnarchiveOrder(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
