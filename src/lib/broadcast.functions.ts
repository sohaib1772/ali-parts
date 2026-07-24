import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminOtp } from "@/integrations/supabase/require-admin-otp";

/**
 * Admin broadcast — the in-app delivery layer.
 *
 * The actual write is `public.admin_broadcast_notification`, a SECURITY DEFINER
 * function, because `notifications` has RLS on with no INSERT policy for any
 * client role. The checks are deliberately doubled up:
 *
 *   - here, so the request is rejected before it reaches the database and so the
 *     admin-OTP gate applies exactly as it does to every other privileged action;
 *   - in SQL, on `auth.uid()`, so the RPC is still safe if called directly with a
 *     signed-in non-admin token.
 *
 * The RPC is invoked with `context.supabase` (the caller's authenticated client),
 * NOT the service-role client — `auth.uid()` must resolve to the admin for the
 * in-database check to mean anything. Using supabaseAdmin here would make
 * auth.uid() NULL and the SQL guard would reject it.
 */

/** Mirrors the limits enforced in SQL. Kept in sync deliberately: the client
 *  gets a fast, localized error; the database is what actually guarantees it. */
export const BROADCAST_TITLE_MAX = 80;
export const BROADCAST_BODY_MAX = 300;

/** Audiences understood by `admin_broadcast_recipients`. Extending targeting
 *  means adding a branch there and a member here — no change to the call shape. */
export type BroadcastAudience = "all_customers" | "all_users" | "single_user";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

const AudienceInput = z.object({
  audience: z.enum(["all_customers", "all_users", "single_user"]).default("all_customers"),
  user_id: z.string().uuid().nullable().optional(),
});

const SendInput = AudienceInput.extend({
  title: z.string().trim().min(1, "العنوان مطلوب").max(BROADCAST_TITLE_MAX),
  body: z.string().trim().max(BROADCAST_BODY_MAX).default(""),
});

/** How many recipients the current audience resolves to. Drives the count the
 *  admin sees before confirming. */
export const adminBroadcastAudienceCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AudienceInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: count, error } = await context.supabase.rpc("admin_broadcast_audience_count", {
      p_audience: data.audience,
      // Omitted rather than nulled, so the SQL DEFAULT applies.
      p_user_id: data.user_id ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { count: (count as number) ?? 0 };
  });

/** Send the broadcast. Returns the number of rows actually written. */
export const sendAdminBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);

    const { data: sent, error } = await context.supabase.rpc("admin_broadcast_notification", {
      p_title: data.title,
      p_body: data.body,
      p_audience: data.audience,
      // Omitted rather than nulled, so the SQL DEFAULT applies.
      p_user_id: data.user_id ?? undefined,
    });
    if (error) throw new Error(error.message);

    const count = (sent as number) ?? 0;

    // ---------------------------------------------------------------------
    // FCM PUSH HOOK GOES HERE.
    //
    // The in-app rows are committed by this point, so push is a strictly
    // additive second delivery step: a failure here must NOT fail the request,
    // because the notification has already been delivered in-app. Mirror the
    // existing web-push broadcast in banner-push.functions.ts:
    //
    //   try {
    //     const { sendBroadcastPush } = await import("./web-push.server");
    //     await sendBroadcastPush({ title: data.title, body: data.body,
    //                               url: "/notifications", tag: "admin-broadcast" });
    //   } catch (err) {
    //     console.error("[push] admin broadcast failed", err);
    //   }
    //
    // To push only to this audience rather than everyone, resolve device tokens
    // from the same `admin_broadcast_recipients(p_audience, p_user_id)` set the
    // insert above used, so both channels always target one audience.
    // ---------------------------------------------------------------------

    return { ok: true as const, sent: count };
  });
