import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminOtpEnabled } from "@/integrations/supabase/require-admin-otp";

const VERIFICATION_TTL_SECONDS = 10 * 60; // 10m
const REMEMBER_DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30d
const CHALLENGE_TTL_SECONDS = 10 * 60; // 10m
const MAX_ATTEMPTS = 5;

async function isAdminOrStaff(ctx: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isStaff }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("is_staff", { _uid: ctx.userId }),
  ]);
  return { isAdmin: !!isAdmin, isStaff: !!isStaff };
}

async function hashCode(code: string, userId: string): Promise<string> {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const enc = new TextEncoder().encode(`${userId}:${code}:${salt}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  const shown = u.slice(0, Math.min(2, u.length));
  return `${shown}${"*".repeat(Math.max(1, u.length - shown.length))}@${d}`;
}

async function logOtpEvent(params: {
  event:
    | "request"
    | "request_rate_limited"
    | "request_failed"
    | "verify_success"
    | "verify_wrong_code"
    | "verify_no_active"
    | "verify_expired"
    | "verify_max_attempts"
    | "revoke";
  user_id?: string | null;
  device_id?: string | null;
  detail?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_otp_events").insert({
      event: params.event,
      user_id: params.user_id ?? null,
      device_id: params.device_id ?? null,
      detail: params.detail ?? null,
    });
  } catch (e) {
    console.error("logOtpEvent failed", e);
  }
}

export const listAdminOtpEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await isAdminOrStaff(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("admin_otp_events")
      .select("id, event, user_id, device_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const StatusInput = z.object({ device_id: z.string().min(1).max(128).optional() });

export const adminOtpStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    // OTP disabled (default): the client never renders the OTP gate. Admin
    // authorization is still enforced server-side on every privileged function.
    if (!adminOtpEnabled()) {
      return { required: false, verified: true, email: null } as const;
    }
    const { isAdmin, isStaff } = await isAdminOrStaff(context);
    if (!isAdmin && !isStaff) {
      return { required: false, verified: true, email: null } as const;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const deviceId = data.device_id ?? "";
    const { data: v } = await supabaseAdmin
      .from("admin_otp_verifications")
      .select("expires_at")
      .eq("user_id", context.userId)
      .eq("device_id", deviceId)
      .maybeSingle();
    const verified = !!v && new Date(v.expires_at).getTime() > Date.now();
    const email = process.env.ADMIN_OTP_EMAIL ?? "";
    return {
      required: true,
      verified,
      expiresAt: v?.expires_at ?? null,
      email: email ? maskEmail(email) : null,
      hasEmail: !!email,
    };
  });

export const requestAdminOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin, isStaff } = await isAdminOrStaff(context);
    if (!isAdmin && !isStaff) throw new Error("Forbidden");

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("لم يتم إعداد مفتاح البريد");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: actor } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const toEmail = process.env.ADMIN_OTP_EMAIL;
    if (!toEmail) {
      throw new Error("لم يتم إعداد بريد الإدارة");
    }

    // Rate-limit: at most 1 unconsumed challenge per 30s per user
    const { data: recent } = await supabaseAdmin
      .from("admin_otp_challenges")
      .select("created_at")
      .eq("user_id", context.userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      const age = Date.now() - new Date(recent.created_at).getTime();
      if (age < 30_000) {
        const wait = Math.ceil((30_000 - age) / 1000);
        await logOtpEvent({
          event: "request_rate_limited",
          user_id: context.userId,
          detail: `wait ${wait}s`,
        });
        throw new Error(`الرجاء الانتظار ${wait} ثانية قبل طلب رمز جديد`);
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code, context.userId);
    const expires_at = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();

    // Invalidate previous challenges
    await supabaseAdmin
      .from("admin_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("consumed_at", null);

    const { error: insErr } = await supabaseAdmin
      .from("admin_otp_challenges")
      .insert({ user_id: context.userId, code_hash, expires_at });
    if (insErr) throw new Error(insErr.message);

    const actorName =
      (actor?.user?.user_metadata as any)?.full_name ||
      actor?.user?.email ||
      actor?.user?.phone ||
      context.userId.slice(0, 8);

    const html = `
<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;background:#f6f7fb;padding:24px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e5e7eb">
    <h2 style="margin:0 0 8px;color:#0f172a">رمز تحقق دخول الإدارة</h2>
    <p style="color:#475569;margin:0 0 16px">تم طلب دخول لوحة الإدارة بواسطة: <b>${actorName}</b></p>
    <div style="font-size:34px;letter-spacing:8px;font-weight:800;background:#0f172a;color:#fff;text-align:center;border-radius:12px;padding:18px 12px;margin:12px 0">${code}</div>
    <p style="color:#64748b;font-size:13px;margin:12px 0 0">صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px">إذا لم يكن هذا الطلب منك، تجاهل الرسالة وغيّر كلمة المرور فوراً.</p>
  </div>
</body></html>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Admin Login <onboarding@resend.dev>",
        to: [toEmail],
        subject: `رمز دخول الإدارة: ${code}`,
        html,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Resend send failed", resp.status, text);
      let detail = text;
      try {
        const j = JSON.parse(text);
        detail = j?.message || j?.error || text;
      } catch {}
      await logOtpEvent({
        event: "request_failed",
        user_id: context.userId,
        detail: String(detail).slice(0, 500),
      });
      throw new Error(`تعذر إرسال رمز التحقق: ${detail}`);
    }

    await logOtpEvent({ event: "request", user_id: context.userId, detail: maskEmail(toEmail) });
    return { ok: true, email: maskEmail(toEmail), expiresAt: expires_at };
  });

const VerifyInput = z.object({
  code: z.string().regex(/^\d{6}$/, "رمز غير صالح"),
  remember: z.boolean().optional(),
  device_id: z.string().min(1).max(128),
});

export const verifyAdminOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { isAdmin, isStaff } = await isAdminOrStaff(context);
    if (!isAdmin && !isStaff) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ch, error } = await supabaseAdmin
      .from("admin_otp_challenges")
      .select("id, code_hash, expires_at, consumed_at, attempts")
      .eq("user_id", context.userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ch) {
      await logOtpEvent({
        event: "verify_no_active",
        user_id: context.userId,
        device_id: data.device_id,
      });
      throw new Error("لا يوجد رمز نشط. اطلب رمزاً جديداً.");
    }
    if (new Date(ch.expires_at).getTime() < Date.now()) {
      await logOtpEvent({
        event: "verify_expired",
        user_id: context.userId,
        device_id: data.device_id,
      });
      throw new Error("انتهت صلاحية الرمز. اطلب رمزاً جديداً.");
    }
    if ((ch.attempts ?? 0) >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("admin_otp_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", ch.id);
      await logOtpEvent({
        event: "verify_max_attempts",
        user_id: context.userId,
        device_id: data.device_id,
        detail: `attempts=${ch.attempts}`,
      });
      throw new Error("عدد المحاولات تجاوز الحد. اطلب رمزاً جديداً.");
    }

    const expected = await hashCode(data.code, context.userId);
    if (expected !== ch.code_hash) {
      await supabaseAdmin
        .from("admin_otp_challenges")
        .update({ attempts: (ch.attempts ?? 0) + 1 })
        .eq("id", ch.id);
      await logOtpEvent({
        event: "verify_wrong_code",
        user_id: context.userId,
        device_id: data.device_id,
        detail: `attempt=${(ch.attempts ?? 0) + 1}`,
      });
      throw new Error("رمز غير صحيح");
    }

    // Consume challenge and create verification session
    const nowIso = new Date().toISOString();
    const ttl = data.remember ? REMEMBER_DEVICE_TTL_SECONDS : VERIFICATION_TTL_SECONDS;
    const expires_at = new Date(Date.now() + ttl * 1000).toISOString();
    await supabaseAdmin
      .from("admin_otp_challenges")
      .update({ consumed_at: nowIso })
      .eq("id", ch.id);
    await supabaseAdmin
      .from("admin_otp_verifications")
      .upsert(
        { user_id: context.userId, device_id: data.device_id, verified_at: nowIso, expires_at },
        { onConflict: "user_id,device_id" },
      );

    await logOtpEvent({
      event: "verify_success",
      user_id: context.userId,
      device_id: data.device_id,
      detail: data.remember ? "remember=30d" : "session=10m",
    });
    return { ok: true, expiresAt: expires_at };
  });
