import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CYCLE_DURATION_MS,
  CYCLE_DURATION_YEARLY_MS,
  PLAN_LIMITS,
} from "../src/models/License.js";

// ============================================================================
// Mock the License model BEFORE importing the service
// ============================================================================

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockCreate = vi.fn();
const mockUpdateOne = vi.fn();

vi.mock("../src/models/License.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/models/License.js")>();
  return {
    ...actual,
    License: {
      findOne: (...args: unknown[]) => mockFindOne(...args),
      findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      updateOne: (...args: unknown[]) => mockUpdateOne(...args),
    },
  };
});

// LicenseAudit is best-effort and must not break tests. Mock with a no-op
// so audit writes succeed silently without an actual model connection.
vi.mock("../src/models/LicenseAudit.js", () => ({
  LicenseAudit: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

const {
  licenseService,
  resetCycleIfElapsed,
  cleanupExpiredCancellation,
  downgradeExpiredOneTimePro,
} = await import("../src/services/licenseService.js");

// ============================================================================
// Helpers
// ============================================================================

interface FakeLicense {
  figmaUserId: string;
  email: string | null;
  plan: "free" | "pro";
  status: "active" | "canceled" | "expired";
  cycleStartedAt: Date;
  cycleEndsAt: Date;
  usage: { imports: number; periodStartedAt: Date };
  subscription: unknown;
  save: ReturnType<typeof vi.fn>;
}

function makeLicense(overrides: Partial<FakeLicense> = {}): FakeLicense {
  const now = new Date();
  const cycleEnd = new Date(now.getTime() + CYCLE_DURATION_MS);
  return {
    figmaUserId: "u-1",
    email: null,
    plan: "free",
    status: "active",
    cycleStartedAt: now,
    cycleEndsAt: cycleEnd,
    usage: { imports: 0, periodStartedAt: now },
    subscription: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// resetCycleIfElapsed (pure)
// ============================================================================

describe("resetCycleIfElapsed", () => {
  it("returns false and does nothing when cycle is still active", () => {
    const license = makeLicense();
    const beforeStart = license.cycleStartedAt;
    const result = resetCycleIfElapsed(license as never);
    expect(result).toBe(false);
    expect(license.cycleStartedAt).toBe(beforeStart);
    expect(license.usage.imports).toBe(0);
  });

  it("rolls cycle forward and resets usage when cycleEndsAt is in the past", () => {
    const license = makeLicense({
      cycleStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS),
      cycleEndsAt: new Date(Date.now() - 30 * CYCLE_DURATION_MS),
      usage: { imports: 7, periodStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS) },
    });
    const result = resetCycleIfElapsed(license as never);
    expect(result).toBe(true);
    expect(license.usage.imports).toBe(0);
    expect(license.cycleEndsAt.getTime() - license.cycleStartedAt.getTime()).toBe(
      CYCLE_DURATION_MS,
    );
    expect(license.cycleEndsAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns false for an expired Pro license (Pro downgrade is handled elsewhere)", () => {
    const license = makeLicense({
      plan: "pro",
      cycleStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS),
      cycleEndsAt: new Date(Date.now() - 30 * CYCLE_DURATION_MS),
    });
    expect(resetCycleIfElapsed(license as never)).toBe(false);
    expect(license.plan).toBe("pro");
  });
});

// ============================================================================
// downgradeExpiredOneTimePro (pure)
// ============================================================================

describe("downgradeExpiredOneTimePro", () => {
  it("does nothing when Pro and cycle is still active", () => {
    const license = makeLicense({
      plan: "pro",
      cycleEndsAt: new Date(Date.now() + CYCLE_DURATION_MS),
      subscription: { autoRenew: false },
    });
    expect(downgradeExpiredOneTimePro(license as never)).toBe(false);
    expect(license.plan).toBe("pro");
  });

  it("does nothing for a Free license", () => {
    const license = makeLicense({
      plan: "free",
      cycleEndsAt: new Date(Date.now() - 1000),
    });
    expect(downgradeExpiredOneTimePro(license as never)).toBe(false);
  });

  it("does nothing for an expired subscription Pro (autoRenew=true)", () => {
    const license = makeLicense({
      plan: "pro",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { autoRenew: true },
    });
    expect(downgradeExpiredOneTimePro(license as never)).toBe(false);
    expect(license.plan).toBe("pro");
  });

  it("downgrades an expired one-time Pro (autoRenew=false) to fresh Free", () => {
    const license = makeLicense({
      plan: "pro",
      status: "active",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { flittOrderId: "old", autoRenew: false },
      usage: { imports: 99, periodStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS) },
    });
    expect(downgradeExpiredOneTimePro(license as never)).toBe(true);
    expect(license.plan).toBe("free");
    expect(license.status).toBe("active");
    expect(license.subscription).toBe(null);
    expect(license.usage.imports).toBe(0);
    expect(license.cycleEndsAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("downgrades a legacy expired Pro row that has no autoRenew field", () => {
    const license = makeLicense({
      plan: "pro",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { flittOrderId: "legacy" },
    });
    expect(downgradeExpiredOneTimePro(license as never)).toBe(true);
    expect(license.plan).toBe("free");
  });
});

// ============================================================================
// cleanupExpiredCancellation (pure)
// ============================================================================

describe("cleanupExpiredCancellation", () => {
  it("does nothing when status is active", () => {
    const license = makeLicense({ plan: "pro", status: "active" });
    expect(cleanupExpiredCancellation(license as never)).toBe(false);
    expect(license.plan).toBe("pro");
  });

  it("does nothing when canceled but cycle has not ended", () => {
    const license = makeLicense({
      plan: "pro",
      status: "canceled",
      cycleEndsAt: new Date(Date.now() + 1000),
    });
    expect(cleanupExpiredCancellation(license as never)).toBe(false);
    expect(license.plan).toBe("pro");
    expect(license.status).toBe("canceled");
  });

  it("downgrades to fresh Free when canceled and cycle has ended", () => {
    const license = makeLicense({
      plan: "pro",
      status: "canceled",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { flittOrderId: "old" },
      usage: { imports: 999, periodStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS) },
    });
    const result = cleanupExpiredCancellation(license as never);
    expect(result).toBe(true);
    expect(license.plan).toBe("free");
    expect(license.status).toBe("active");
    expect(license.subscription).toBe(null);
    expect(license.usage.imports).toBe(0);
    expect(license.cycleEndsAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// licenseService.getOrCreate
// ============================================================================

describe("licenseService.getOrCreate", () => {
  it("creates a new Free license when none exists", async () => {
    mockFindOne.mockResolvedValue(null);
    const created = makeLicense();
    mockCreate.mockResolvedValue(created);

    const license = await licenseService.getOrCreate("new-user");

    expect(mockFindOne).toHaveBeenCalledWith({ figmaUserId: "new-user" });
    expect(mockCreate).toHaveBeenCalledWith({ figmaUserId: "new-user" });
    expect(license).toBe(created);
  });

  it("returns existing license without saving when nothing changed", async () => {
    const existing = makeLicense();
    mockFindOne.mockResolvedValue(existing);

    const license = await licenseService.getOrCreate("u-1");

    expect(license).toBe(existing);
    expect(existing.save).not.toHaveBeenCalled();
  });

  it("rolls cycle forward + saves when cycle has elapsed", async () => {
    const existing = makeLicense({
      cycleStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS),
      cycleEndsAt: new Date(Date.now() - 30 * CYCLE_DURATION_MS),
      usage: { imports: 5, periodStartedAt: new Date(Date.now() - 60 * CYCLE_DURATION_MS) },
    });
    mockFindOne.mockResolvedValue(existing);

    const license = await licenseService.getOrCreate("u-1");

    expect(license.usage.imports).toBe(0);
    expect(license.cycleEndsAt.getTime()).toBeGreaterThan(Date.now());
    expect(existing.save).toHaveBeenCalledOnce();
  });

  it("downgrades expired-canceled Pro to Free + saves", async () => {
    const existing = makeLicense({
      plan: "pro",
      status: "canceled",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { flittOrderId: "old" },
    });
    mockFindOne.mockResolvedValue(existing);

    const license = await licenseService.getOrCreate("u-1");

    expect(license.plan).toBe("free");
    expect(license.status).toBe("active");
    expect(license.subscription).toBe(null);
    expect(existing.save).toHaveBeenCalledOnce();
  });

  it("downgrades expired one-time Pro to Free + saves", async () => {
    const existing = makeLicense({
      plan: "pro",
      status: "active",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { flittOrderId: "ot", autoRenew: false },
    });
    mockFindOne.mockResolvedValue(existing);

    const license = await licenseService.getOrCreate("u-1");

    expect(license.plan).toBe("free");
    expect(license.subscription).toBe(null);
    expect(existing.save).toHaveBeenCalledOnce();
  });

  it("does NOT downgrade an expired subscription Pro (autoRenew=true)", async () => {
    const existing = makeLicense({
      plan: "pro",
      status: "active",
      cycleEndsAt: new Date(Date.now() - 1000),
      subscription: { flittOrderId: "sub", autoRenew: true },
    });
    mockFindOne.mockResolvedValue(existing);

    const license = await licenseService.getOrCreate("u-1");

    expect(license.plan).toBe("pro");
    expect(existing.save).not.toHaveBeenCalled();
  });
});

// ============================================================================
// licenseService.useImport
// ============================================================================

describe("licenseService.useImport", () => {
  it("returns ok with decremented remaining for Free under limit", async () => {
    const existing = makeLicense({ plan: "free", usage: { imports: 3, periodStartedAt: new Date() } });
    mockFindOne.mockResolvedValue(existing);
    mockFindOneAndUpdate.mockResolvedValue(
      makeLicense({ plan: "free", usage: { imports: 4, periodStartedAt: new Date() } }),
    );

    const result = await licenseService.useImport("u-1");

    expect(result).toEqual({ ok: true, remaining: 6 });
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { figmaUserId: "u-1", "usage.imports": { $lt: PLAN_LIMITS.free.imports } },
      { $inc: { "usage.imports": 1 } },
      { new: true },
    );
  });

  it("returns limit_exceeded when atomic update returns null (gate fired)", async () => {
    const existing = makeLicense({ plan: "free", usage: { imports: 10, periodStartedAt: new Date() } });
    mockFindOne.mockResolvedValue(existing);
    mockFindOneAndUpdate.mockResolvedValue(null);

    const result = await licenseService.useImport("u-1");

    expect(result).toEqual({ error: "limit_exceeded" });
  });

  it("Pro plan bypasses the gate and reports remaining as Infinity", async () => {
    const existing = makeLicense({ plan: "pro", usage: { imports: 999, periodStartedAt: new Date() } });
    mockFindOne.mockResolvedValue(existing);
    mockFindOneAndUpdate.mockResolvedValue(existing);

    const result = await licenseService.useImport("u-1");

    expect(result).toEqual({ ok: true, remaining: Number.POSITIVE_INFINITY });
    // Pro uses unconditional update (no $lt clause)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { figmaUserId: "u-1" },
      { $inc: { "usage.imports": 1 } },
    );
  });
});

// ============================================================================
// licenseService.applySubscriptionActivation
// ============================================================================

describe("licenseService.applySubscriptionActivation", () => {
  it("upserts a Pro license with subscription metadata", async () => {
    const fakeNow = new Date("2026-05-04T10:00:00Z");
    vi.setSystemTime(fakeNow);

    const updated = makeLicense({
      plan: "pro",
      email: "user@example.com",
      subscription: { flittOrderId: "w2w_pro_u_1" },
    });
    mockFindOneAndUpdate.mockResolvedValue(updated);

    const result = await licenseService.applySubscriptionActivation({
      figmaUserId: "u-1",
      email: "user@example.com",
      flittOrderId: "w2w_pro_u_1",
    });

    expect(result).toBe(updated);
    const [filter, update, options] = mockFindOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ figmaUserId: "u-1" });
    expect(update.$set.plan).toBe("pro");
    expect(update.$set.status).toBe("active");
    expect(update.$set.email).toBe("user@example.com");
    expect((update.$set.subscription as { flittOrderId: string }).flittOrderId).toBe(
      "w2w_pro_u_1",
    );
    expect(options).toMatchObject({ new: true, upsert: true });
  });
});

// ============================================================================
// licenseService.applyOneTimePurchase
// ============================================================================

describe("licenseService.applyOneTimePurchase", () => {
  it("activates a fresh 30-day Pro cycle for a new / non-Pro user", async () => {
    const fakeNow = new Date("2026-05-10T10:00:00Z");
    vi.setSystemTime(fakeNow);
    mockFindOne.mockResolvedValue(null);
    const updated = makeLicense({ plan: "pro" });
    mockFindOneAndUpdate.mockResolvedValue(updated);

    const result = await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: "user@example.com",
      flittOrderId: "w2w_pro_u_1",
    });

    expect(result).toBe(updated);
    const [filter, update, options] = mockFindOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ figmaUserId: "u-1" });
    expect(update.$set.plan).toBe("pro");
    expect(update.$set.status).toBe("active");
    expect(update.$set.email).toBe("user@example.com");
    expect(update.$set["usage.imports"]).toBe(0);
    const cycleEnd = update.$set.cycleEndsAt as Date;
    expect(cycleEnd.getTime() - fakeNow.getTime()).toBe(CYCLE_DURATION_MS);
    const sub = update.$set.subscription as {
      autoRenew: boolean;
      reminderSentAt: Date | null;
      nextBillingAt: Date;
      flittOrderId: string;
      lastDuration: "monthly" | "yearly";
    };
    expect(sub.autoRenew).toBe(false);
    expect(sub.reminderSentAt).toBe(null);
    expect(sub.flittOrderId).toBe("w2w_pro_u_1");
    expect(sub.nextBillingAt.getTime()).toBe(cycleEnd.getTime());
    expect(sub.lastDuration).toBe("monthly");
    expect(options).toMatchObject({ new: true, upsert: true });
  });

  it("activates a fresh 365-day Pro cycle and persists lastDuration=yearly", async () => {
    const fakeNow = new Date("2026-05-10T10:00:00Z");
    vi.setSystemTime(fakeNow);
    mockFindOne.mockResolvedValue(null);
    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: "user@example.com",
      flittOrderId: "w2w_pro_u_1_yr",
      duration: "yearly",
    });

    const [, update] = mockFindOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    const cycleEnd = update.$set.cycleEndsAt as Date;
    expect(cycleEnd.getTime() - fakeNow.getTime()).toBe(
      CYCLE_DURATION_YEARLY_MS,
    );
    const sub = update.$set.subscription as {
      lastDuration: "monthly" | "yearly";
    };
    expect(sub.lastDuration).toBe("yearly");
  });

  it("stacks +30 days onto cycleEndsAt for an already-active Pro within renewal window (5d remaining)", async () => {
    const fakeNow = new Date("2026-05-10T10:00:00Z");
    vi.setSystemTime(fakeNow);
    // 5 days remaining — INSIDE the 7-day monthly renewal window, so the
    // webhook can legitimately land and stack onto the existing cycle.
    const existingEnd = new Date(fakeNow.getTime() + 5 * 24 * 60 * 60 * 1000);
    mockFindOne.mockResolvedValue(
      makeLicense({ plan: "pro", cycleEndsAt: existingEnd }),
    );
    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: null,
      flittOrderId: "w2w_pro_u_1_renew",
    });

    const [, update] = mockFindOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    const cycleEnd = update.$set.cycleEndsAt as Date;
    // Within window → full stack honored: existing 5 days + 30 days = 35 days
    expect(cycleEnd.getTime()).toBe(existingEnd.getTime() + CYCLE_DURATION_MS);
  });

  it("P2-#1: caps stack at renewal window + duration when webhook lands outside window", async () => {
    // This shouldn't normally happen (/api/checkout/create blocks it), but a
    // race condition (license read failed in /create → fallthrough to Flitt
    // → webhook arrives) could let one through. Defensive cap engages here.
    const fakeNow = new Date("2026-05-10T10:00:00Z");
    vi.setSystemTime(fakeNow);
    // 20 days remaining — OUTSIDE the 7-day monthly renewal window, but
    // STILL below the 37-day cap, so the floor (existing=20d) doesn't kick in.
    const existingEnd = new Date(fakeNow.getTime() + 20 * 24 * 60 * 60 * 1000);
    mockFindOne.mockResolvedValue(
      makeLicense({ plan: "pro", cycleEndsAt: existingEnd }),
    );
    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: null,
      flittOrderId: "w2w_pro_u_1_renew",
    });

    const [, update] = mockFindOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    const cycleEnd = update.$set.cycleEndsAt as Date;
    // Capped: now + (7 days renewal window + 30 days duration) = 37 days
    const expectedMaxMs = fakeNow.getTime() + (7 + 30) * 24 * 60 * 60 * 1000;
    expect(cycleEnd.getTime()).toBe(expectedMaxMs);
    // NOT the naive 50-day stack (20 + 30).
    expect(cycleEnd.getTime()).toBeLessThan(
      existingEnd.getTime() + CYCLE_DURATION_MS,
    );
  });

  it("P3-#1: cap NEVER shrinks existing access (floor at existing time)", async () => {
    // Scenario from the post-Phase-2 audit: user has 100 days remaining
    // (e.g. yearly purchase from before the cap shipped). /create fail-open
    // lets a $16 purchase through. Webhook lands.
    //
    // BEFORE the floor: min(naive 130d, cap 37d) = 37d → user LOST 63 days
    // AFTER the floor:  min(130d, max(37d, 100d)) = 100d → existing kept
    //
    // The user still paid $16 and gained 0 new days (they shouldn't have
    // been able to buy in the first place — operator should refund), but
    // they did NOT lose their pre-existing access.
    const fakeNow = new Date("2026-05-10T10:00:00Z");
    vi.setSystemTime(fakeNow);
    const existingEnd = new Date(fakeNow.getTime() + 100 * 24 * 60 * 60 * 1000);
    mockFindOne.mockResolvedValue(
      makeLicense({ plan: "pro", cycleEndsAt: existingEnd }),
    );
    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: null,
      flittOrderId: "w2w_pro_u_1_unfortunate",
    });

    const [, update] = mockFindOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    const cycleEnd = update.$set.cycleEndsAt as Date;
    // Floor preserves existing 100 days — does NOT clamp to 37d.
    expect(cycleEnd.getTime()).toBe(existingEnd.getTime());
    // And does NOT stack to naive 130 days (cap still prevents abuse).
    expect(cycleEnd.getTime()).toBeLessThan(
      existingEnd.getTime() + CYCLE_DURATION_MS,
    );
  });

  it("does NOT stack onto a stale past cycleEndsAt (expired Pro renews fresh)", async () => {
    const fakeNow = new Date("2026-05-10T10:00:00Z");
    vi.setSystemTime(fakeNow);
    mockFindOne.mockResolvedValue(
      makeLicense({
        plan: "pro",
        cycleEndsAt: new Date(fakeNow.getTime() - 5 * 24 * 60 * 60 * 1000),
      }),
    );
    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: null,
      flittOrderId: "w2w_pro_u_1",
    });

    const [, update] = mockFindOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    const cycleEnd = update.$set.cycleEndsAt as Date;
    expect(cycleEnd.getTime() - fakeNow.getTime()).toBe(CYCLE_DURATION_MS);
  });

  it("resets reminderSentAt to null on every purchase", async () => {
    mockFindOne.mockResolvedValue(null);
    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyOneTimePurchase({
      figmaUserId: "u-1",
      email: null,
      flittOrderId: "o1",
    });

    const [, update] = mockFindOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    const sub = update.$set.subscription as { reminderSentAt: Date | null };
    expect(sub.reminderSentAt).toBe(null);
  });
});

// ============================================================================
// licenseService.applyRecurringCharge
// ============================================================================

describe("licenseService.applyRecurringCharge", () => {
  it("extends nextBillingAt by 30 days, resets usage, clears failureCount", async () => {
    const fakeNow = new Date("2026-05-04T10:00:00Z");
    vi.setSystemTime(fakeNow);

    mockFindOneAndUpdate.mockResolvedValue(makeLicense({ plan: "pro" }));

    await licenseService.applyRecurringCharge({ figmaUserId: "u-1" });

    const [filter, update] = mockFindOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter).toEqual({ figmaUserId: "u-1", plan: "pro" });
    expect(update.$set["usage.imports"]).toBe(0);
    expect(update.$set["subscription.failureCount"]).toBe(0);
    const newCycleEnd = update.$set["subscription.nextBillingAt"] as Date;
    expect(newCycleEnd.getTime() - fakeNow.getTime()).toBe(CYCLE_DURATION_MS);
  });

  it("returns null if no Pro license matches the filter", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    const result = await licenseService.applyRecurringCharge({ figmaUserId: "ghost" });
    expect(result).toBe(null);
  });
});

// ============================================================================
// licenseService.applyFailedCharge
// ============================================================================

describe("licenseService.applyFailedCharge", () => {
  it("increments failureCount and stamps lastFailedAt", async () => {
    mockFindOneAndUpdate.mockResolvedValue(makeLicense());
    await licenseService.applyFailedCharge({ figmaUserId: "u-1" });

    const [filter, update] = mockFindOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $inc: Record<string, number> },
    ];
    expect(filter).toEqual({ figmaUserId: "u-1" });
    expect(update.$inc).toEqual({ "subscription.failureCount": 1 });
    expect(update.$set["subscription.lastFailedAt"]).toBeInstanceOf(Date);
  });
});

// P2-#11: `describe("licenseService.applySubscriptionCancel", ...)` removed
// with the method it covered. One-time payment model has no cancel path.

// ============================================================================
// licenseService.applyRefund (chargeback / reversal)
// ============================================================================

describe("licenseService.applyRefund", () => {
  it("revokes Pro when current subscription.flittOrderId matches refunded order", async () => {
    const revokedLicense = makeLicense({
      plan: "free",
      status: "active",
      email: "user@example.com",
    });
    mockFindOneAndUpdate.mockResolvedValue(revokedLicense);

    const result = await licenseService.applyRefund({
      figmaUserId: "u-1",
      flittOrderId: "w2w_pro_u-1_123",
    });

    expect(result.revoked).toBe(true);
    expect(result.license).toBe(revokedLicense);

    const [filter, update] = mockFindOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    // Filter MUST scope by flittOrderId — refunds for older orders must not
    // touch the current subscription.
    expect(filter).toEqual({
      figmaUserId: "u-1",
      plan: "pro",
      "subscription.flittOrderId": "w2w_pro_u-1_123",
    });
    expect(update.$set.plan).toBe("free");
    expect(update.$set.status).toBe("active");
    expect(update.$set.subscription).toBe(null);
    expect(update.$set["usage.imports"]).toBe(0);
  });

  it("does not revoke when refund is for an older (already replaced) order", async () => {
    // findOneAndUpdate returns null because the orderId in the filter doesn't
    // match the user's current subscription — they've since renewed.
    mockFindOneAndUpdate.mockResolvedValue(null);
    mockFindOne.mockResolvedValue(makeLicense({ plan: "pro" }));

    const result = await licenseService.applyRefund({
      figmaUserId: "u-1",
      flittOrderId: "w2w_pro_u-1_OLD",
    });

    expect(result.revoked).toBe(false);
    expect(result.license).not.toBe(null);
  });

  it("returns revoked=false when user does not exist", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    mockFindOne.mockResolvedValue(null);

    const result = await licenseService.applyRefund({
      figmaUserId: "ghost",
      flittOrderId: "w2w_pro_ghost_1",
    });

    expect(result.revoked).toBe(false);
    expect(result.license).toBe(null);
  });
});

// ============================================================================
// licenseService.setEmailIfMissing — fires from the Figma OAuth callback
// ============================================================================

describe("licenseService.setEmailIfMissing", () => {
  it("returns zero counts and skips DB call when email is empty", async () => {
    const result = await licenseService.setEmailIfMissing("u-1", "");
    expect(result).toEqual({ matched: 0, modified: 0 });
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("calls License.updateOne with the null-or-missing email filter", async () => {
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await licenseService.setEmailIfMissing(
      "u-42",
      "owner@example.com",
    );

    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mockUpdateOne.mock.calls[0];
    expect(filter).toEqual({
      figmaUserId: "u-42",
      $or: [{ email: null }, { email: "" }, { email: { $exists: false } }],
    });
    expect(update).toEqual({ $set: { email: "owner@example.com" } });
    expect(options).toEqual({ upsert: false });
    expect(result).toEqual({ matched: 1, modified: 1 });
  });

  it("backfills a legacy doc whose email is an empty string", async () => {
    // Regression: older rows stored `email: ""`. The filter must treat "" as
    // "missing" (alongside null / not-present) so the Figma-provided email can
    // backfill — otherwise the extension/plugin shows a blank email forever.
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await licenseService.setEmailIfMissing(
      "u-99",
      "owner@example.com",
    );

    const [filter] = mockUpdateOne.mock.calls[0];
    expect(filter.$or).toContainEqual({ email: "" });
    expect(result).toEqual({ matched: 1, modified: 1 });
  });

  it("returns matched=1 modified=0 when the doc already has the same email", async () => {
    // Real Mongo behavior: filter requires email null/missing — if the doc
    // already has the email set (or any other email), matchedCount is 0.
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const result = await licenseService.setEmailIfMissing(
      "u-42",
      "owner@example.com",
    );

    expect(result).toEqual({ matched: 0, modified: 0 });
  });
});
