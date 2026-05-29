import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// H-2 — licenseService synchronous input guards
//
// These tests verify that every mutation entry point assertString-checks its
// figmaUserId (and email/flittOrderId where applicable) BEFORE any Mongoose
// call. The intent is to fail-fast on NoSQL operator injection (`{$ne: null}`)
// before it lands in a Mongo filter, even if a future caller forgets to
// validate upstream.
//
// We deliberately don't connect to Mongo here — Mongoose throws its own
// "buffering timed out" if a model method is awaited without a connection,
// and we want the synchronous assert to short-circuit before that.
// ============================================================================

// Mock the entire @w2w/api models layer to avoid Mongoose buffering noise
vi.mock("../src/models/License.js", async () => {
  const actual = await vi.importActual<typeof import("../src/models/License.js")>(
    "../src/models/License.js",
  );
  return {
    ...actual,
    License: {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateOne: vi.fn(),
      create: vi.fn(),
    },
  };
});
vi.mock("../src/models/LicenseAudit.js", () => ({
  LicenseAudit: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../src/services/metrics.js", () => ({
  metrics: {
    licenseEvent: vi.fn(),
  },
}));

const { licenseService } = await import("../src/services/licenseService.js");
const License = (await import("../src/models/License.js")).License as unknown as {
  findOne: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("licenseService.getOrCreate guards", () => {
  it("throws on operator-object figmaUserId before touching Mongo", async () => {
    await expect(
      licenseService.getOrCreate({ $ne: null } as unknown as string),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
    expect(License.findOne).not.toHaveBeenCalled();
  });

  it("throws on empty string figmaUserId", async () => {
    await expect(licenseService.getOrCreate("")).rejects.toThrow(
      /figmaUserId must be a non-empty string/,
    );
    expect(License.findOne).not.toHaveBeenCalled();
  });

  it("throws on numeric figmaUserId", async () => {
    await expect(
      licenseService.getOrCreate(42 as unknown as string),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
    expect(License.findOne).not.toHaveBeenCalled();
  });
});

describe("licenseService.useImport guards", () => {
  it("throws on operator-object figmaUserId", async () => {
    await expect(
      licenseService.useImport({ $gt: "" } as unknown as string),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
    expect(License.findOne).not.toHaveBeenCalled();
  });
});

describe("licenseService.setEmailIfMissing guards", () => {
  it("throws on operator-object figmaUserId", async () => {
    await expect(
      licenseService.setEmailIfMissing({ $ne: null } as unknown as string, "x@y.z"),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
    expect(License.updateOne).not.toHaveBeenCalled();
  });

  it("returns early (no throw) for empty email — preserves current behavior", async () => {
    const result = await licenseService.setEmailIfMissing("valid-id", "");
    expect(result).toEqual({ matched: 0, modified: 0 });
    expect(License.updateOne).not.toHaveBeenCalled();
  });

  it("throws on object-typed email (NoSQL injection)", async () => {
    await expect(
      licenseService.setEmailIfMissing("valid-id", { $ne: null } as unknown as string),
    ).rejects.toThrow(/email must be a non-empty string/);
    expect(License.updateOne).not.toHaveBeenCalled();
  });
});

describe("licenseService.applyOneTimePurchase guards", () => {
  it("throws on operator-object figmaUserId", async () => {
    await expect(
      licenseService.applyOneTimePurchase({
        figmaUserId: { $ne: null } as unknown as string,
        email: "x@y.z",
        flittOrderId: "ord1",
      }),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
    expect(License.findOne).not.toHaveBeenCalled();
    expect(License.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("throws on operator-object flittOrderId", async () => {
    await expect(
      licenseService.applyOneTimePurchase({
        figmaUserId: "valid-id",
        email: "x@y.z",
        flittOrderId: { $ne: null } as unknown as string,
      }),
    ).rejects.toThrow(/flittOrderId must be a non-empty string/);
    expect(License.findOne).not.toHaveBeenCalled();
  });
});

describe("licenseService.applyRefund guards", () => {
  it("throws on operator-object figmaUserId — prevents cross-user refund", async () => {
    await expect(
      licenseService.applyRefund({
        figmaUserId: { $ne: null } as unknown as string,
        flittOrderId: "ord1",
      }),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
    expect(License.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("throws on operator-object flittOrderId", async () => {
    await expect(
      licenseService.applyRefund({
        figmaUserId: "valid-id",
        flittOrderId: { $ne: null } as unknown as string,
      }),
    ).rejects.toThrow(/flittOrderId must be a non-empty string/);
    expect(License.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("licenseService.applySubscriptionActivation guards", () => {
  it("throws on operator-object inputs", async () => {
    await expect(
      licenseService.applySubscriptionActivation({
        figmaUserId: { $ne: null } as unknown as string,
        email: null,
        flittOrderId: "ord1",
      }),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
  });
});

describe("licenseService.applyRecurringCharge / applyFailedCharge guards", () => {
  it("applyRecurringCharge throws on operator-object", async () => {
    await expect(
      licenseService.applyRecurringCharge({
        figmaUserId: { $ne: null } as unknown as string,
      }),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
  });

  it("applyFailedCharge throws on operator-object", async () => {
    await expect(
      licenseService.applyFailedCharge({
        figmaUserId: { $ne: null } as unknown as string,
      }),
    ).rejects.toThrow(/figmaUserId must be a non-empty string/);
  });
  // P2-#11: applySubscriptionCancel removed; guard test removed with it.
});
