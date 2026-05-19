import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
  License,
  PLAN_LIMITS,
  PLAN_PRICES,
  CYCLE_DURATION_MS,
  type ILicense,
  type LicensePlan,
  type LicenseStatus,
} from "../src/models/License.js";

// ============================================================================
// Constants
// ============================================================================

describe("License constants", () => {
  it("PLAN_LIMITS.free.imports = 10", () => {
    expect(PLAN_LIMITS.free.imports).toBe(10);
  });

  it("PLAN_LIMITS.pro.imports = Infinity (unlimited)", () => {
    expect(PLAN_LIMITS.pro.imports).toBe(Number.POSITIVE_INFINITY);
  });

  it("PLAN_PRICES.pro = $16 (1600 cents)", () => {
    expect(PLAN_PRICES.pro.priceCents).toBe(1600);
    expect(PLAN_PRICES.pro.period).toBe("month");
    expect(PLAN_PRICES.pro.currency).toBe("USD");
  });

  it("CYCLE_DURATION_MS = 30 days", () => {
    expect(CYCLE_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// ============================================================================
// Schema introspection (no DB connection required)
// ============================================================================

describe("License schema definition", () => {
  it("registers as 'License' Mongoose model", () => {
    expect(License.modelName).toBe("License");
  });

  it("has figmaUserId as required + unique + indexed", () => {
    const path = License.schema.path("figmaUserId");
    expect(path).toBeDefined();
    expect(path.isRequired).toBe(true);
    // @ts-expect-error — _index is an internal Mongoose property
    const indexInfo = path._index;
    expect(indexInfo).toBeTruthy();
    if (typeof indexInfo === "object" && indexInfo) {
      expect(indexInfo.unique).toBe(true);
    }
  });

  it("has email as optional + indexed (defaults to null)", () => {
    const path = License.schema.path("email");
    expect(path).toBeDefined();
    expect(path.isRequired).toBeFalsy();
    expect(path.defaultValue).toBe(null);
  });

  it("plan enum is exactly ['free', 'pro']", () => {
    const path = License.schema.path("plan") as mongoose.SchemaType & {
      enumValues?: string[];
    };
    expect(path.enumValues).toEqual(["free", "pro"]);
    expect(path.defaultValue).toBe("free");
  });

  it("status enum is exactly ['active', 'canceled', 'expired']", () => {
    const path = License.schema.path("status") as mongoose.SchemaType & {
      enumValues?: string[];
    };
    expect(path.enumValues).toEqual(["active", "canceled", "expired"]);
    expect(path.defaultValue).toBe("active");
  });

  it("has cycleStartedAt + cycleEndsAt fields", () => {
    expect(License.schema.path("cycleStartedAt")).toBeDefined();
    expect(License.schema.path("cycleEndsAt")).toBeDefined();
  });

  it("has usage subdocument with imports + periodStartedAt", () => {
    const usagePath = License.schema.path("usage");
    expect(usagePath).toBeDefined();
    // The nested schema is accessible via .schema
    const usageSchema = (usagePath as mongoose.SchemaType & {
      schema?: mongoose.Schema;
    }).schema;
    expect(usageSchema?.path("imports")).toBeDefined();
    expect(usageSchema?.path("periodStartedAt")).toBeDefined();
  });

  it("has subscription subdocument (default null)", () => {
    const subPath = License.schema.path("subscription");
    expect(subPath).toBeDefined();
    expect(subPath.defaultValue).toBe(null);
  });

  it("subscription subdocument requires flittOrderId/activatedAt/nextBillingAt", () => {
    const subPath = License.schema.path("subscription");
    const subSchema = (subPath as mongoose.SchemaType & {
      schema?: mongoose.Schema;
    }).schema;
    expect(subSchema?.path("flittOrderId").isRequired).toBe(true);
    expect(subSchema?.path("activatedAt").isRequired).toBe(true);
    expect(subSchema?.path("nextBillingAt").isRequired).toBe(true);
  });

  it("subscription subdocument has autoRenew (default false) + reminderSentAt (default null), both optional", () => {
    const subPath = License.schema.path("subscription");
    const subSchema = (subPath as mongoose.SchemaType & {
      schema?: mongoose.Schema;
    }).schema;
    const autoRenew = subSchema?.path("autoRenew");
    const reminderSentAt = subSchema?.path("reminderSentAt");
    expect(autoRenew).toBeDefined();
    expect(autoRenew?.defaultValue).toBe(false);
    expect(autoRenew?.isRequired).toBeFalsy();
    expect(reminderSentAt).toBeDefined();
    expect(reminderSentAt?.defaultValue).toBe(null);
    expect(reminderSentAt?.isRequired).toBeFalsy();
  });

  it("registers timestamps (createdAt/updatedAt)", () => {
    expect(License.schema.path("createdAt")).toBeDefined();
    expect(License.schema.path("updatedAt")).toBeDefined();
  });
});

// ============================================================================
// Default values from schema (instantiate without saving)
// ============================================================================

describe("License default values on new()", () => {
  it("plan defaults to 'free'", () => {
    const doc = new License({ figmaUserId: "u-1" });
    expect(doc.plan).toBe("free");
  });

  it("status defaults to 'active' (no trial state)", () => {
    const doc = new License({ figmaUserId: "u-2" });
    expect(doc.status).toBe("active");
  });

  it("email defaults to null", () => {
    const doc = new License({ figmaUserId: "u-3" });
    expect(doc.email).toBe(null);
  });

  it("subscription defaults to null", () => {
    const doc = new License({ figmaUserId: "u-4" });
    expect(doc.subscription).toBe(null);
  });

  it("usage.imports defaults to 0", () => {
    const doc = new License({ figmaUserId: "u-5" });
    expect(doc.usage.imports).toBe(0);
  });

  it("cycleEndsAt defaults to ~30 days after cycleStartedAt", () => {
    const before = Date.now();
    const doc = new License({ figmaUserId: "u-6" });
    const after = Date.now();

    const start = doc.cycleStartedAt.getTime();
    const end = doc.cycleEndsAt.getTime();

    expect(start).toBeGreaterThanOrEqual(before);
    expect(start).toBeLessThanOrEqual(after);
    expect(end - start).toBeGreaterThanOrEqual(CYCLE_DURATION_MS - 100);
    expect(end - start).toBeLessThanOrEqual(CYCLE_DURATION_MS + 100);
  });
});

// ============================================================================
// Validation (sync — no DB)
// ============================================================================

describe("License validation", () => {
  it("rejects when figmaUserId is missing", async () => {
    const doc = new License({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.figmaUserId).toBeDefined();
  });

  it("rejects invalid plan", async () => {
    const doc = new License({ figmaUserId: "u", plan: "plus" });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.plan).toBeDefined();
  });

  it("rejects invalid status", async () => {
    const doc = new License({ figmaUserId: "u", status: "trial" });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.status).toBeDefined();
  });

  it("accepts valid free license", () => {
    const doc = new License({ figmaUserId: "u", plan: "free", status: "active" });
    expect(doc.validateSync()).toBeUndefined();
  });

  it("accepts valid pro license with subscription", () => {
    const doc = new License({
      figmaUserId: "u",
      plan: "pro",
      status: "active",
      email: "user@example.com",
      subscription: {
        flittOrderId: "w2w_pro_u_1",
        activatedAt: new Date(),
        nextBillingAt: new Date(Date.now() + CYCLE_DURATION_MS),
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ============================================================================
// Type-level smoke (compile-only)
// ============================================================================

describe("Type exports", () => {
  it("exports LicensePlan and LicenseStatus types usable at runtime checks", () => {
    const validPlans: LicensePlan[] = ["free", "pro"];
    const validStatuses: LicenseStatus[] = ["active", "canceled", "expired"];
    expect(validPlans).toHaveLength(2);
    expect(validStatuses).toHaveLength(3);
  });

  it("ILicense interface is usable as a structural type", () => {
    const sample: Partial<ILicense> = {
      figmaUserId: "u",
      plan: "free",
      status: "active",
    };
    expect(sample.figmaUserId).toBe("u");
  });
});
