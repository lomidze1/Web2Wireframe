import { describe, it, expect } from "vitest";
import { deriveQuota } from "../ui/shared/quota";
import type { License } from "../ui/shared/licenseClient";

function license(plan: "free" | "pro", used: number, limit: number | null): License {
  return {
    figmaUserId: "user-1",
    email: null,
    plan,
    status: "active",
    cycleStartedAt: "2026-09-01T00:00:00.000Z",
    cycleEndsAt: "2026-10-01T00:00:00.000Z",
    usage: { imports: used, periodStartedAt: "2026-09-01T00:00:00.000Z" },
    limits: { imports: limit },
    subscription: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as unknown as License;
}

describe("deriveQuota", () => {
  it("knows nothing without a license", () => {
    expect(deriveQuota(null)).toBeNull();
  });

  it("treats Pro as unlimited even if a numeric limit slipped through", () => {
    expect(deriveQuota(license("pro", 30, 10))).toEqual({ unlimited: true });
  });

  it("treats a null limit as unlimited", () => {
    expect(deriveQuota(license("free", 3, null))).toEqual({ unlimited: true });
  });

  it("counts what is left of the free allowance", () => {
    expect(deriveQuota(license("free", 1, 10))).toEqual({
      unlimited: false,
      remaining: 9,
      limit: 10,
      nearLimit: false,
    });
  });

  it("flags the last two imports as near the limit", () => {
    expect(deriveQuota(license("free", 8, 10))).toMatchObject({
      remaining: 2,
      nearLimit: true,
    });
  });

  it("never reports a negative remainder", () => {
    expect(deriveQuota(license("free", 12, 10))).toMatchObject({
      remaining: 0,
      nearLimit: true,
    });
  });
});
