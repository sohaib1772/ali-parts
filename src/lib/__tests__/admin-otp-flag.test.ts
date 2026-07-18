import { describe, it, expect, vi, afterEach } from "vitest";

// requireAdminOtp reads the device id from the server request; in unit tests there
// is no request context, so getRequest() returns undefined (the real code uses
// optional chaining and falls back to an empty device id).
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => undefined,
}));

import { requireAdminOtp, adminOtpEnabled } from "@/integrations/supabase/require-admin-otp";

// EXACT reproduction of the role guard every privileged server function runs
// BEFORE requireAdminOtp (assertAdmin / inline has_role + throw). This is step 2
// (authorization). It is a separate statement from the OTP check and is not
// touched by the ADMIN_OTP_ENABLED flag.
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

// A privileged server function as composed in production:
//   requireSupabaseAuth (middleware, gives context.userId) -> assertAdmin -> requireAdminOtp
async function privilegedCall(ctx: { supabase: any; userId: string }) {
  await assertAdmin(ctx); // step 2: role check
  await requireAdminOtp(ctx); // step 3: OTP (flag-gated)
  return "OK";
}

function makeSupabase({ isAdmin, otpVerified }: { isAdmin: boolean; otpVerified: boolean }) {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name === "has_role") return { data: isAdmin, error: null };
      if (name === "admin_otp_verified") return { data: otpVerified, error: null };
      return { data: null, error: null };
    }),
  };
}

const ORIGINAL = process.env.ADMIN_OTP_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_OTP_ENABLED;
  else process.env.ADMIN_OTP_ENABLED = ORIGINAL;
});

describe("ADMIN_OTP_ENABLED flag — default and parsing", () => {
  it("defaults to OFF when absent, empty, or not 'true'", () => {
    delete process.env.ADMIN_OTP_ENABLED;
    expect(adminOtpEnabled()).toBe(false);
    process.env.ADMIN_OTP_ENABLED = "";
    expect(adminOtpEnabled()).toBe(false);
    process.env.ADMIN_OTP_ENABLED = "false";
    expect(adminOtpEnabled()).toBe(false);
    process.env.ADMIN_OTP_ENABLED = "0";
    expect(adminOtpEnabled()).toBe(false);
  });
  it("is ON only for 'true' (case-insensitive)", () => {
    process.env.ADMIN_OTP_ENABLED = "true";
    expect(adminOtpEnabled()).toBe(true);
    process.env.ADMIN_OTP_ENABLED = "TRUE";
    expect(adminOtpEnabled()).toBe(true);
  });
});

describe("Authorization is preserved when OTP is OFF (default)", () => {
  it("NON-ADMIN is still BLOCKED by the role check (critical regression guard)", async () => {
    process.env.ADMIN_OTP_ENABLED = "false";
    const ctx = { userId: "u-customer", supabase: makeSupabase({ isAdmin: false, otpVerified: false }) };
    await expect(privilegedCall(ctx)).rejects.toThrow("Forbidden");
  });

  it("ADMIN with NO OTP verification row is now ALLOWED (the point of the change)", async () => {
    process.env.ADMIN_OTP_ENABLED = "false";
    const ctx = { userId: "u-admin", supabase: makeSupabase({ isAdmin: true, otpVerified: false }) };
    await expect(privilegedCall(ctx)).resolves.toBe("OK");
    // OTP verification RPC must NOT be consulted when the flag is off.
    const called = ctx.supabase.rpc.mock.calls.map((c: any[]) => c[0]);
    expect(called).toContain("has_role");
    expect(called).not.toContain("admin_otp_verified");
  });

  it("requireAdminOtp is a pure NO-OP when off (never touches supabase)", async () => {
    process.env.ADMIN_OTP_ENABLED = "false";
    const supabase = { rpc: vi.fn() };
    await expect(requireAdminOtp({ supabase })).resolves.toBeUndefined();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("Flag genuinely gates OTP when ON", () => {
  it("ADMIN WITHOUT verification is BLOCKED by OTP", async () => {
    process.env.ADMIN_OTP_ENABLED = "true";
    const ctx = { userId: "u-admin", supabase: makeSupabase({ isAdmin: true, otpVerified: false }) };
    await expect(privilegedCall(ctx)).rejects.toThrow();
  });

  it("ADMIN WITH verification is ALLOWED", async () => {
    process.env.ADMIN_OTP_ENABLED = "true";
    const ctx = { userId: "u-admin", supabase: makeSupabase({ isAdmin: true, otpVerified: true }) };
    await expect(privilegedCall(ctx)).resolves.toBe("OK");
  });

  it("NON-ADMIN is blocked by the role check before OTP even runs", async () => {
    process.env.ADMIN_OTP_ENABLED = "true";
    const ctx = { userId: "u-customer", supabase: makeSupabase({ isAdmin: false, otpVerified: true }) };
    await expect(privilegedCall(ctx)).rejects.toThrow("Forbidden");
  });
});
