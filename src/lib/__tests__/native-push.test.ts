import { describe, it, expect } from "vitest";
import { deepLinkForPush } from "@/lib/native-push";

// deepLinkForPush turns an FCM data payload into the in-app path a tapped
// notification should open. The server (fcm-dispatch.server) builds these
// payloads, so the two must agree on the same keys.
describe("deepLinkForPush", () => {
  it("routes order notifications to that order", () => {
    expect(deepLinkForPush({ type: "order_status", order_id: "abc-123" })).toBe("/orders/abc-123");
  });

  it("order_id wins even if a url is also present", () => {
    expect(deepLinkForPush({ order_id: "x", url: "/notifications" })).toBe("/orders/x");
  });

  it("routes replacement notifications to the replacements list", () => {
    expect(deepLinkForPush({ type: "replacement_status", url: "/replacements" })).toBe("/replacements");
  });

  it("honours an explicit internal url", () => {
    expect(deepLinkForPush({ type: "admin_broadcast", url: "/notifications" })).toBe("/notifications");
  });

  it("falls back to /notifications when nothing routable is present", () => {
    expect(deepLinkForPush({ type: "promo" })).toBe("/notifications");
    expect(deepLinkForPush(undefined)).toBe("/notifications");
  });

  it("ignores a non-internal (absolute) url and falls back", () => {
    expect(deepLinkForPush({ url: "https://evil.example.com" })).toBe("/notifications");
  });
});
