import { describe, it, expect } from "vitest";
import { shouldShowNews, NEWS_ID } from "../ui/shared/whatsNew";
import type { License } from "../ui/shared/licenseClient";

function license(plan: "free" | "pro", used: number): License {
  return {
    figmaUserId: "user-1",
    email: null,
    plan,
    status: "active",
    cycleStartedAt: "2026-09-01T00:00:00.000Z",
    cycleEndsAt: "2026-10-01T00:00:00.000Z",
    usage: { imports: used, periodStartedAt: "2026-09-01T00:00:00.000Z" },
    limits: { imports: plan === "pro" ? null : 10 },
    subscription: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as unknown as License;
}

const base = { seenId: null as string | null, license: license("free", 1), blocked: false };

describe("shouldShowNews", () => {
  it("shows once to a user who has already imported", () => {
    expect(shouldShowNews(base)).toBe(true);
  });

  it("never shows the same news twice", () => {
    expect(shouldShowNews({ ...base, seenId: NEWS_ID })).toBe(false);
  });

  it("still shows when the seen id is an older news item", () => {
    expect(shouldShowNews({ ...base, seenId: "something-older" })).toBe(true);
  });

  it("waits until the license is known", () => {
    expect(shouldShowNews({ ...base, license: null })).toBe(false);
  });

  it("leaves a brand-new user's first session alone", () => {
    // Activation is 83% today; a promo before the first import must not risk it.
    expect(shouldShowNews({ ...base, license: license("free", 0) })).toBe(false);
  });

  it("shows to a Pro user even with no imports this cycle", () => {
    expect(shouldShowNews({ ...base, license: license("pro", 0) })).toBe(true);
  });

  it("yields to another open modal", () => {
    expect(shouldShowNews({ ...base, blocked: true })).toBe(false);
  });
});
