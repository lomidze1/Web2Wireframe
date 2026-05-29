import { describe, it, expect } from "vitest";
import {
  serializeLicense,
  serializeLicenseForPlugin,
} from "../src/lib/serializeLicense.js";

// ============================================================================
// M-3 — flittOrderId redaction in plugin/extension responses
// ============================================================================

function fakeProLicense() {
  const now = new Date("2026-05-04T10:00:00Z");
  return {
    figmaUserId: "u-1",
    email: "u1@example.com",
    plan: "pro" as const,
    status: "active" as const,
    cycleStartedAt: now,
    cycleEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    usage: { imports: 5, periodStartedAt: now },
    subscription: {
      flittOrderId: "w2w_pro_u-1_1736000000000",
      activatedAt: now,
      nextBillingAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      canceledAt: null,
      lastChargeAt: now,
      lastFailedAt: null,
      failureCount: 0,
      autoRenew: false,
      reminderSentAt: null,
      lastDuration: "monthly" as const,
    },
    createdAt: now,
    updatedAt: now,
  } as unknown as Parameters<typeof serializeLicense>[0];
}

function fakeFreeLicense() {
  const now = new Date("2026-05-04T10:00:00Z");
  return {
    figmaUserId: "u-2",
    email: null,
    plan: "free" as const,
    status: "active" as const,
    cycleStartedAt: now,
    cycleEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    usage: { imports: 0, periodStartedAt: now },
    subscription: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as Parameters<typeof serializeLicense>[0];
}

describe("serializeLicenseForPlugin (M-3)", () => {
  it("omits subscription.flittOrderId from Pro license output", () => {
    const out = serializeLicenseForPlugin(fakeProLicense());
    expect(out.subscription).not.toBeNull();
    expect(out.subscription).not.toHaveProperty("flittOrderId");
    // Other subscription fields must still be present.
    expect(out.subscription?.lastDuration).toBe("monthly");
    expect(out.subscription?.autoRenew).toBe(false);
    expect(out.subscription?.canceledAt).toBeNull();
  });

  it("returns subscription:null for a Free license", () => {
    const out = serializeLicenseForPlugin(fakeFreeLicense());
    expect(out.subscription).toBeNull();
  });

  it("preserves all non-subscription fields", () => {
    const out = serializeLicenseForPlugin(fakeProLicense());
    expect(out.figmaUserId).toBe("u-1");
    expect(out.email).toBe("u1@example.com");
    expect(out.plan).toBe("pro");
    expect(out.status).toBe("active");
    expect(out.limits.imports).toBeNull(); // Pro = unlimited
  });

  it("internal serializeLicense() STILL includes flittOrderId (admin path)", () => {
    const full = serializeLicense(fakeProLicense());
    expect(full.subscription).not.toBeNull();
    expect(full.subscription).toHaveProperty(
      "flittOrderId",
      "w2w_pro_u-1_1736000000000",
    );
  });

  it("no flittOrderId leak anywhere in JSON-stringified response", () => {
    const out = serializeLicenseForPlugin(fakeProLicense());
    const json = JSON.stringify(out);
    expect(json).not.toContain("w2w_pro_u-1_");
    expect(json).not.toContain("flittOrderId");
  });
});
