import { getRequest } from "@tanstack/react-start/server";

/**
 * Feature flag for admin OTP. OTP is OPT-IN: it is only enforced when
 * ADMIN_OTP_ENABLED is exactly "true". When the env var is absent or anything
 * else, OTP is disabled (the default), and admins sign in with email + password
 * only. Re-enable by setting ADMIN_OTP_ENABLED=true and configuring an email
 * provider (RESEND_API_KEY + ADMIN_OTP_EMAIL) — no code change required.
 */
export function adminOtpEnabled(): boolean {
  return (process.env.ADMIN_OTP_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * Server-side admin OTP enforcement.
 *
 * Call this inside a privileged admin/staff server function AFTER the existing
 * requireSupabaseAuth middleware + assertAdmin/role check. It is ADDED ON TOP of those —
 * it does not replace them.
 *
 * When the ADMIN_OTP_ENABLED flag is off (default), this is a NO-OP: it returns
 * successfully without checking OTP. It NEVER performs the auth or role check itself —
 * those already ran in the caller (requireSupabaseAuth + assertAdmin/has_role) and are
 * completely unaffected by this flag, so disabling OTP does not weaken authorization.
 *
 * When the flag is on, it throws unless the caller has completed a NON-EXPIRED admin OTP
 * verification for their device. The device id arrives as the `x-admin-device-id` request
 * header, attached to every serverFn RPC by the global `attachAdminDeviceId` client
 * middleware (the same value the OTP flow stores in localStorage as `admin_device_id`). The
 * `admin_otp_verified` SECURITY DEFINER function checks admin_otp_verifications for a
 * non-expired (auth.uid(), device_id) row — the exact same (user_id, device_id, expires_at)
 * check adminOtpStatus performs.
 */
export async function requireAdminOtp(context: { supabase: any }): Promise<void> {
  // OTP disabled (default): skip the OTP check. The caller's requireSupabaseAuth +
  // role check have ALREADY run and still guard this function.
  if (!adminOtpEnabled()) return;
  const request = getRequest();
  const deviceId = request?.headers?.get("x-admin-device-id") ?? "";
  const { data: verified, error } = await context.supabase.rpc("admin_otp_verified", {
    p_device_id: deviceId,
  });
  if (error) throw new Error(error.message);
  if (!verified) throw new Error("مطلوب تحقق OTP للإدارة قبل تنفيذ هذا الإجراء");
}
