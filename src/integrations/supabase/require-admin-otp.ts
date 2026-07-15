import { getRequest } from "@tanstack/react-start/server";

/**
 * Server-side admin OTP enforcement.
 *
 * Call this inside a privileged admin/staff server function AFTER the existing
 * requireSupabaseAuth middleware + assertAdmin/role check. It is ADDED ON TOP of those —
 * it does not replace them.
 *
 * It throws unless the caller has completed a NON-EXPIRED admin OTP verification for their
 * device. The device id arrives as the `x-admin-device-id` request header, attached to every
 * serverFn RPC by the global `attachAdminDeviceId` client middleware (the same value the OTP
 * flow stores in localStorage as `admin_device_id`). The `admin_otp_verified` SECURITY
 * DEFINER function checks admin_otp_verifications for a non-expired (auth.uid(), device_id)
 * row — the exact same (user_id, device_id, expires_at) check adminOtpStatus performs.
 */
export async function requireAdminOtp(context: { supabase: any }): Promise<void> {
  const request = getRequest();
  const deviceId = request?.headers?.get("x-admin-device-id") ?? "";
  const { data: verified, error } = await context.supabase.rpc("admin_otp_verified", {
    p_device_id: deviceId,
  });
  if (error) throw new Error(error.message);
  if (!verified) throw new Error("مطلوب تحقق OTP للإدارة قبل تنفيذ هذا الإجراء");
}
