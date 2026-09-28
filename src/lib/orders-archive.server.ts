import { supabaseAdmin } from "@/integrations/supabase/client.server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authenticateAdmin(request: Request): Promise<{ ok: boolean; error?: string; status?: number; userId?: string }> {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, error: "Unauthorized: Missing token", status: 401 };
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return { ok: false, error: "Unauthorized: Invalid session", status: 401 };
  }

  const userId = userData.user.id;

  const { data: roleRow, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || !roleRow) {
    return { ok: false, error: "Forbidden: Admin access required", status: 403 };
  }

  return { ok: true, userId };
}

/**
 * Endpoint: POST /api/admin/archive-all-orders or POST /api/admin/archive-orders
 * Body: { secret: string, order_ids?: string[] }
 * Checks secret against process.env.ORDERS_ARCHIVE_SECRET
 * Sets is_archived = true for either selected orders or all active orders
 */
export async function handleAdminArchiveOrders(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1. Authenticate admin
  const auth = await authenticateAdmin(request);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status ?? 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Parse request payload
  let body: { secret?: unknown; order_ids?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "بيانات الطلب غير صالحة" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const providedSecret = typeof body?.secret === "string" ? body.secret.trim() : "";
  if (!providedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "يرجى إدخال الرمز السري" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Verify secret code from process.env.ORDERS_ARCHIVE_SECRET
  const expectedSecret = process.env.ORDERS_ARCHIVE_SECRET || "maktabali_archive_2026";
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ ok: false, error: "الرمز السري غير صحيح" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4. Archive selected orders or all active orders
  const selectedIds = Array.isArray(body?.order_ids)
    ? (body.order_ids as string[]).filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];

  let query = supabaseAdmin
    .from("orders")
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
    } as any);

  if (selectedIds.length > 0) {
    query = query.in("id", selectedIds);
  } else {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.error("[archive-orders] failed to archive:", error);
    return new Response(JSON.stringify({ ok: false, error: "تعذر أرشفة الطلبات: " + error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const count = data?.length ?? 0;
  return new Response(JSON.stringify({ ok: true, count, message: `تمت أرشفة ${count} طلب بنجاح` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Keep backward compatibility
export const handleAdminArchiveAllOrders = handleAdminArchiveOrders;

/**
 * Endpoint: POST /api/admin/delete-orders
 * Body: { secret: string, order_ids: string[] }
 * Checks secret against process.env.ORDERS_ARCHIVE_SECRET
 * Permanently deletes specified orders
 */
export async function handleAdminDeleteOrders(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1. Authenticate admin
  const auth = await authenticateAdmin(request);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status ?? 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Parse request payload
  let body: { secret?: unknown; order_ids?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "بيانات الطلب غير صالحة" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const providedSecret = typeof body?.secret === "string" ? body.secret.trim() : "";
  if (!providedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "يرجى إدخال الرمز السري" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Verify secret code
  const expectedSecret = process.env.ORDERS_ARCHIVE_SECRET || "maktabali_archive_2026";
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ ok: false, error: "الرمز السري غير صحيح" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orderIds = Array.isArray(body?.order_ids)
    ? (body.order_ids as string[]).filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];

  if (orderIds.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "يرجى تحديد طلب واحد على الأقل للحذف" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4. Delete orders
  const { data, error } = await supabaseAdmin
    .from("orders")
    .delete()
    .in("id", orderIds)
    .select("id");

  if (error) {
    console.error("[delete-orders] failed to delete:", error);
    return new Response(JSON.stringify({ ok: false, error: "تعذر حذف الطلبات: " + error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const count = data?.length ?? 0;
  return new Response(JSON.stringify({ ok: true, count, message: `تم حذف ${count} طلب بنجاح` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Endpoint: POST /api/admin/unarchive-order
 * Body: { order_id: string }
 * Restores an order back to active state
 */
export async function handleAdminUnarchiveOrder(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await authenticateAdmin(request);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status ?? 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { order_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "بيانات الطلب غير صالحة" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orderId = typeof body?.order_id === "string" ? body.order_id : "";
  if (!orderId) {
    return new Response(JSON.stringify({ ok: false, error: "معرف الطلب مطلوب" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabaseAdmin
    .from("orders")
    .update({
      is_archived: false,
      archived_at: null,
    } as any)
    .eq("id", orderId);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, message: "تمت استعادة الطلب إلى القائمة النشطة بنجاح" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
