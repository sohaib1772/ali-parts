import { createMiddleware } from "@tanstack/react-start";

/**
 * Global client function-middleware: attach the admin device id to every serverFn RPC as the
 * `x-admin-device-id` header. It reuses the exact value the OTP flow stores in localStorage
 * (`admin_device_id`, written by getAdminDeviceId in the admin route), so the server can
 * verify the caller's OTP session for that device (see requireAdminOtp / admin_otp_verified).
 *
 * Registered in src/start.ts alongside attachSupabaseAuth. Client-only (no server imports).
 */
export const attachAdminDeviceId = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let deviceId = "";
    try {
      if (typeof window !== "undefined") {
        deviceId = window.localStorage.getItem("admin_device_id") ?? "";
      }
    } catch {
      /* ignore */
    }
    return next({ headers: deviceId ? { "x-admin-device-id": deviceId } : {} });
  },
);
