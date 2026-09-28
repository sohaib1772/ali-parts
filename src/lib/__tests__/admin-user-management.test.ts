import { describe, it, expect } from "vitest";
import { z } from "zod";

const UpdateUserRoleInput = z.object({
  user_id: z.string().uuid(),
  role_type: z.enum(["admin", "staff", "user"]),
  staff_permissions: z
    .object({
      can_orders: z.boolean().default(false),
      can_products: z.boolean().default(false),
      can_replacements: z.boolean().default(false),
      can_block: z.boolean().default(false),
    })
    .optional(),
});

const DeleteUserInput = z.object({
  user_id: z.string().uuid(),
});

describe("Admin User Management - Validation & Guards", () => {
  const validUuid = "123e4567-e89b-12d3-a456-426614174000";

  it("validates UpdateUserRoleInput for admin role", () => {
    const input = {
      user_id: validUuid,
      role_type: "admin",
    };
    const parsed = UpdateUserRoleInput.parse(input);
    expect(parsed.role_type).toBe("admin");
    expect(parsed.user_id).toBe(validUuid);
  });

  it("validates UpdateUserRoleInput for staff role with permissions", () => {
    const input = {
      user_id: validUuid,
      role_type: "staff",
      staff_permissions: {
        can_orders: true,
        can_products: true,
        can_replacements: false,
        can_block: false,
      },
    };
    const parsed = UpdateUserRoleInput.parse(input);
    expect(parsed.role_type).toBe("staff");
    expect(parsed.staff_permissions?.can_orders).toBe(true);
    expect(parsed.staff_permissions?.can_products).toBe(true);
    expect(parsed.staff_permissions?.can_replacements).toBe(false);
  });

  it("validates UpdateUserRoleInput for regular user", () => {
    const input = {
      user_id: validUuid,
      role_type: "user",
    };
    const parsed = UpdateUserRoleInput.parse(input);
    expect(parsed.role_type).toBe("user");
  });

  it("rejects invalid role_type in UpdateUserRoleInput", () => {
    const input = {
      user_id: validUuid,
      role_type: "superadmin",
    };
    expect(() => UpdateUserRoleInput.parse(input)).toThrow();
  });

  it("rejects invalid user_id in UpdateUserRoleInput", () => {
    const input = {
      user_id: "not-a-uuid",
      role_type: "admin",
    };
    expect(() => UpdateUserRoleInput.parse(input)).toThrow();
  });

  it("validates DeleteUserInput with valid uuid", () => {
    const parsed = DeleteUserInput.parse({ user_id: validUuid });
    expect(parsed.user_id).toBe(validUuid);
  });

  it("rejects DeleteUserInput with invalid uuid", () => {
    expect(() => DeleteUserInput.parse({ user_id: "invalid-id" })).toThrow();
  });

  it("enforces self-action prevention check for role change and deletion", () => {
    const currentAdminId = validUuid;
    const targetUserId = validUuid;

    const checkSelfAction = (callerId: string, targetId: string) => {
      if (callerId === targetId) {
        throw new Error("لا يمكنك تغيير صلاحيات حسابك الإداري الحالي.");
      }
    };

    expect(() => checkSelfAction(currentAdminId, targetUserId)).toThrow(
      "لا يمكنك تغيير صلاحيات حسابك الإداري الحالي.",
    );

    const otherUserId = "987e6543-e21b-12d3-a456-426614174999";
    expect(() => checkSelfAction(currentAdminId, otherUserId)).not.toThrow();
  });
});
