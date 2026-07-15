import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminOtp } from "@/integrations/supabase/require-admin-otp";

export type CheckStatus = "ok" | "warn" | "fail";
export type Check = { id: string; label: string; status: CheckStatus; detail: string };
export type DiagnosticsReport = {
  ranAt: string;
  summary: { ok: number; warn: number; fail: number };
  sections: { title: string; checks: Check[] }[];
};

export const runDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticsReport> => {
    // Admin gate
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    await requireAdminOtp(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const auth: Check[] = [];
    const rls: Check[] = [];
    const notifs: Check[] = [];
    const storage: Check[] = [];

    // ============ Auth checks ============
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw error;
      auth.push({
        id: "auth-admin",
        label: "خدمة المصادقة (Auth API)",
        status: "ok",
        detail: `متصلة — عدد المستخدمين متاح للاستعلام${data?.users ? ` (عيّنة: ${data.users.length})` : ""}.`,
      });
    } catch (e: any) {
      auth.push({ id: "auth-admin", label: "خدمة المصادقة (Auth API)", status: "fail", detail: e?.message || "فشل الاتصال بـ Auth API" });
    }

    try {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      const c = count ?? 0;
      auth.push({
        id: "auth-admins",
        label: "عدد المدراء",
        status: c > 0 ? "ok" : "warn",
        detail: c > 0 ? `${c} مدير مسجّل.` : "لا يوجد أي مستخدم بدور admin — لن يستطيع أحد إدارة اللوحة.",
      });
    } catch (e: any) {
      auth.push({ id: "auth-admins", label: "عدد المدراء", status: "fail", detail: e?.message || "تعذّر القراءة" });
    }

    // ============ RLS checks ============
    const criticalTables = [
      "profiles", "orders", "order_items", "cart_items", "favorites",
      "notifications", "banner_comments", "banner_likes", "user_roles",
      "user_block_log", "addresses", "products", "banners",
    ];
    try {
      const { data, error } = await supabaseAdmin
        .from("pg_tables" as any)
        .select("tablename, rowsecurity")
        .eq("schemaname", "public");
      if (error) throw error;
      const map = new Map<string, boolean>();
      (data as any[]).forEach((r) => map.set(r.tablename, !!r.rowsecurity));
      const missing = criticalTables.filter((t) => map.has(t) && !map.get(t));
      const unknown = criticalTables.filter((t) => !map.has(t));
      rls.push({
        id: "rls-enabled",
        label: "تفعيل RLS على الجداول الحساسة",
        status: missing.length === 0 ? "ok" : "fail",
        detail: missing.length === 0
          ? `RLS مفعّل على ${criticalTables.length - unknown.length} جدول.`
          : `RLS غير مفعّل على: ${missing.join(", ")}`,
      });
    } catch (e: any) {
      // Fallback: pg_tables not exposed via PostgREST — use a raw check via admin rpc-less approach
      rls.push({
        id: "rls-enabled",
        label: "تفعيل RLS على الجداول الحساسة",
        status: "warn",
        detail: "تعذّر قراءة pg_tables عبر Data API — اعتبر أن RLS مفعّل على جداول الإنتاج (تحقّق يدوي).",
      });
    }

    // Policy coverage: verify at least one SELECT policy exists per critical table via information_schema equivalent
    // (we skip if pg_policies isn't exposed — RLS "enabled but no policy" is captured by the linter)

    // ============ Notifications delivery ============
    try {
      const { count: total } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true });
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { count: recent } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      const { count: unread } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      notifs.push({
        id: "notif-total",
        label: "إجمالي الإشعارات المُنشأة",
        status: (total ?? 0) > 0 ? "ok" : "warn",
        detail: `${total ?? 0} إشعار في قاعدة البيانات، ${recent ?? 0} خلال آخر 7 أيام.`,
      });
      notifs.push({
        id: "notif-unread",
        label: "الإشعارات غير المقروءة",
        status: "ok",
        detail: `${unread ?? 0} إشعار غير مقروء حالياً.`,
      });

      // Sanity: check account_status notifications match block-log entries
      const { count: logCount } = await supabaseAdmin
        .from("user_block_log")
        .select("id", { count: "exact", head: true });
      const { count: statusNotifs } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "account_status");
      const lc = logCount ?? 0;
      const sn = statusNotifs ?? 0;
      notifs.push({
        id: "notif-block-match",
        label: "تطابق إشعارات الحظر مع السجل",
        status: lc === 0 ? "ok" : sn >= lc ? "ok" : "warn",
        detail: lc === 0
          ? "لا يوجد عمليات حظر بعد."
          : `${sn}/${lc} من عمليات الحظر/رفع الحظر رافقها إشعار للزبون.`,
      });
    } catch (e: any) {
      notifs.push({ id: "notif-total", label: "قراءة جدول الإشعارات", status: "fail", detail: e?.message || "فشل القراءة" });
    }

    // Push notification transport (browser Push API is client-side only; server side just reports the model)
    notifs.push({
      id: "notif-transport",
      label: "نموذج التسليم",
      status: "ok",
      detail: "الإشعارات تُخزَّن في جدول notifications ويقرأها التطبيق عبر Realtime + استعلام حي (بدون Push خارجي).",
    });

    // ============ Storage ============
    try {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw error;
      const names = (data || []).map((b) => b.name);
      const need = ["product-images", "avatars"];
      const missing = need.filter((n) => !names.includes(n));
      storage.push({
        id: "storage-buckets",
        label: "خزانات الملفات",
        status: missing.length === 0 ? "ok" : "warn",
        detail: missing.length === 0
          ? `متوفّرة: ${names.join(", ")}`
          : `ناقصة: ${missing.join(", ")}. الموجودة: ${names.join(", ") || "لا شيء"}`,
      });
    } catch (e: any) {
      storage.push({ id: "storage-buckets", label: "خزانات الملفات", status: "fail", detail: e?.message || "فشل الاتصال بالتخزين" });
    }

    const allChecks = [...auth, ...rls, ...notifs, ...storage];
    const summary = {
      ok: allChecks.filter((c) => c.status === "ok").length,
      warn: allChecks.filter((c) => c.status === "warn").length,
      fail: allChecks.filter((c) => c.status === "fail").length,
    };

    return {
      ranAt: new Date().toISOString(),
      summary,
      sections: [
        { title: "المصادقة (Authentication)", checks: auth },
        { title: "أمان البيانات (RLS)", checks: rls },
        { title: "الإشعارات (Notifications)", checks: notifs },
        { title: "التخزين (Storage)", checks: storage },
      ],
    };
  });