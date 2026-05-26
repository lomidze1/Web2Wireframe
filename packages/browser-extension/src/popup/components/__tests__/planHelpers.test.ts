/**
 * Unit tests for popup/components/planHelpers.ts.
 *
 * Date math is anchored to a fixed `vi.setSystemTime` so the assertions
 * don't drift with the real clock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { License } from "../../../shared/types";
import {
  daysUntil,
  inDaysPhrase,
  limitText,
  planLabel,
  usagePillText,
} from "../planHelpers";

const NOW = new Date("2026-05-26T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function fakeLicense(overrides: Partial<License> = {}): License {
  return {
    figmaUserId: "u-1",
    email: null,
    plan: "free",
    status: "active",
    cycleStartedAt: "2026-05-01T00:00:00.000Z",
    cycleEndsAt: "2026-06-01T00:00:00.000Z",
    usage: { imports: 0, periodStartedAt: "2026-05-01T00:00:00.000Z" },
    limits: { imports: 10 },
    subscription: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// daysUntil
// ---------------------------------------------------------------------------

describe("daysUntil", () => {
  it("counts whole days to a far-future ISO", () => {
    // 10 days from NOW
    const iso = new Date(NOW.getTime() + 10 * 86_400_000).toISOString();
    expect(daysUntil(iso)).toBe(10);
  });

  it("returns 0 for an ISO exactly equal to now", () => {
    expect(daysUntil(NOW.toISOString())).toBe(0);
  });

  it("returns 0 for a past ISO (never negative)", () => {
    const past = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    expect(daysUntil(past)).toBe(0);
  });

  it("returns 0 for an invalid ISO string", () => {
    expect(daysUntil("not-a-date")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// inDaysPhrase
// ---------------------------------------------------------------------------

describe("inDaysPhrase", () => {
  it("returns 'today' when expiry is now or past", () => {
    expect(inDaysPhrase(NOW.toISOString())).toBe("today");
    const past = new Date(NOW.getTime() - 1000).toISOString();
    expect(inDaysPhrase(past)).toBe("today");
  });

  it("returns 'in 1 day' for the 1-day case", () => {
    const oneDay = new Date(NOW.getTime() + 86_400_000 - 1000).toISOString();
    expect(inDaysPhrase(oneDay)).toBe("in 1 day");
  });

  it("returns 'in N days' for the multi-day case", () => {
    const future = new Date(NOW.getTime() + 21 * 86_400_000).toISOString();
    expect(inDaysPhrase(future)).toBe("in 21 days");
  });
});

// ---------------------------------------------------------------------------
// planLabel
// ---------------------------------------------------------------------------

describe("planLabel", () => {
  it("returns 'FREE' for a free license regardless of subscription", () => {
    expect(planLabel(fakeLicense())).toBe("FREE");
  });

  it("returns 'PRO · MONTHLY' when subscription.lastDuration is monthly", () => {
    expect(
      planLabel(
        fakeLicense({
          plan: "pro",
          subscription: {
            flittOrderId: "ord_1",
            activatedAt: "2026-05-01T00:00:00.000Z",
            nextBillingAt: "2026-06-01T00:00:00.000Z",
            canceledAt: null,
            lastFailedAt: null,
            failureCount: 0,
            autoRenew: true,
            lastDuration: "monthly",
          },
        }),
      ),
    ).toBe("PRO · MONTHLY");
  });

  it("returns 'PRO · YEARLY' when subscription.lastDuration is yearly", () => {
    expect(
      planLabel(
        fakeLicense({
          plan: "pro",
          subscription: {
            flittOrderId: "ord_2",
            activatedAt: "2026-05-01T00:00:00.000Z",
            nextBillingAt: "2027-05-01T00:00:00.000Z",
            canceledAt: null,
            lastFailedAt: null,
            failureCount: 0,
            autoRenew: false,
            lastDuration: "yearly",
          },
        }),
      ),
    ).toBe("PRO · YEARLY");
  });

  it("returns bare 'PRO' when subscription is null (legacy doc)", () => {
    expect(planLabel(fakeLicense({ plan: "pro", subscription: null }))).toBe(
      "PRO",
    );
  });
});

// ---------------------------------------------------------------------------
// limitText
// ---------------------------------------------------------------------------

describe("limitText", () => {
  it("formats the free quota as 'N/10 imports this month'", () => {
    expect(
      limitText(fakeLicense({ usage: { imports: 3, periodStartedAt: "" } })),
    ).toBe("3/10 imports this month");
  });

  it("formats the pro plan as 'N imports this cycle (unlimited)'", () => {
    expect(
      limitText(
        fakeLicense({
          plan: "pro",
          limits: { imports: null },
          usage: { imports: 0, periodStartedAt: "" },
        }),
      ),
    ).toBe("0 imports this cycle (unlimited)");
  });
});

// ---------------------------------------------------------------------------
// usagePillText (footer)
// ---------------------------------------------------------------------------

describe("usagePillText", () => {
  it("returns '0/10' when no license is loaded (unpaired)", () => {
    expect(usagePillText(null)).toBe("0/10");
  });

  it("returns 'N/10' for a free license with N imports used", () => {
    expect(
      usagePillText(fakeLicense({ usage: { imports: 3, periodStartedAt: "" } })),
    ).toBe("3/10");
  });

  it("returns 'Pro' for a pro license regardless of usage", () => {
    expect(
      usagePillText(
        fakeLicense({
          plan: "pro",
          limits: { imports: null },
          usage: { imports: 7, periodStartedAt: "" },
        }),
      ),
    ).toBe("Pro");
  });
});
