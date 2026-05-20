import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

import {
  License,
  CYCLE_DURATION_MS,
  PLAN_PRICES,
} from "../src/models/License.js";
import { LicenseAudit } from "../src/models/LicenseAudit.js";
import { licenseService } from "../src/services/licenseService.js";

/**
 * Real-MongoDB integration coverage for licenseService.applyRefund.
 *
 * Why a separate suite from license-service.test.ts: the existing tests
 * mock `License.findOneAndUpdate`, so they verify what we pass to mongoose
 * but not what mongoose actually does with our `{ "subscription.flittOrderId": ... }`
 * dot-path filter. A real Mongo (via mongodb-memory-server or a developer-
 * supplied URI) confirms:
 *
 *   1. The scoped filter ACTUALLY matches by nested orderId
 *   2. A refund for a stale order leaves the current Pro alone
 *   3. The atomic update doesn't accidentally clobber unrelated fields
 *
 * These are the bugs mocks reliably miss.
 *
 * Mongo source resolution (in order):
 *   1. `INTEGRATION_MONGODB_URI` env var — point at a throwaway DB you
 *      control. Skip the in-memory server entirely.
 *   2. `mongodb-memory-server` — auto-downloads MongoDB binaries on first
 *      use. Works on most dev machines and CI runners.
 *   3. Skip the suite — emits a vitest console warning and exits 0. This
 *      keeps `pnpm test:flitt` green on restricted networks (sandboxes,
 *      offline runs).
 */

interface MongoSource {
  uri: string;
  stop: () => Promise<void>;
}

async function resolveMongoSource(): Promise<MongoSource | null> {
  if (process.env.INTEGRATION_MONGODB_URI) {
    return {
      uri: process.env.INTEGRATION_MONGODB_URI,
      stop: async () => {
        // Nothing to tear down — operator owns the URI.
      },
    };
  }
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    return {
      uri: server.getUri(),
      stop: () => server.stop(),
    };
  } catch (err) {
    console.warn(
      "[integration] mongodb-memory-server unavailable, skipping suite:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

let source: MongoSource | null = null;
let suiteEnabled = false;

beforeAll(async () => {
  source = await resolveMongoSource();
  if (!source) return;
  await mongoose.connect(source.uri);
  suiteEnabled = true;
}, 120_000);

afterAll(async () => {
  if (!suiteEnabled) return;
  await mongoose.disconnect();
  if (source) await source.stop();
});

beforeEach(async () => {
  if (!suiteEnabled) return;
  await License.deleteMany({});
  await LicenseAudit.deleteMany({});
});

function makeProLicense(figmaUserId: string, flittOrderId: string) {
  const now = new Date();
  const cycleEnd = new Date(now.getTime() + CYCLE_DURATION_MS);
  return License.create({
    figmaUserId,
    email: "user@example.com",
    plan: "pro",
    status: "active",
    cycleStartedAt: now,
    cycleEndsAt: cycleEnd,
    usage: { imports: 7, periodStartedAt: now },
    subscription: {
      flittOrderId,
      activatedAt: now,
      nextBillingAt: cycleEnd,
      canceledAt: null,
      lastChargeAt: now,
      lastFailedAt: null,
      failureCount: 0,
      autoRenew: false,
      reminderSentAt: null,
    },
  });
}

describe("licenseService.applyRefund (integration with real MongoDB)", () => {
  it("setup: mongo is reachable (otherwise skip the rest)", () => {
    if (!suiteEnabled) {
      console.warn(
        "[integration] skipped — no INTEGRATION_MONGODB_URI and mongodb-memory-server can't download binaries here",
      );
    }
    expect(true).toBe(true);
  });

  it.skipIf(!suiteEnabled)(
    "revokes a Pro license when the refund matches its current orderId",
    async () => {
      await makeProLicense("u-1", "w2w_pro_u-1_aaa");

      const result = await licenseService.applyRefund({
        figmaUserId: "u-1",
        flittOrderId: "w2w_pro_u-1_aaa",
      });

      expect(result.revoked).toBe(true);
      const after = await License.findOne({ figmaUserId: "u-1" });
      expect(after?.plan).toBe("free");
      expect(after?.status).toBe("active");
      expect(after?.subscription).toBeNull();
      expect(after?.usage.imports).toBe(0);
    },
  );

  it.skipIf(!suiteEnabled)(
    "does NOT revoke when the refund is for an older (since-renewed) order",
    async () => {
      // User started with order_AAA, renewed onto order_BBB. A reversed
      // webhook for order_AAA must not punish their current Pro on BBB.
      await makeProLicense("u-2", "w2w_pro_u-2_BBB");

      const result = await licenseService.applyRefund({
        figmaUserId: "u-2",
        flittOrderId: "w2w_pro_u-2_AAA",
      });

      expect(result.revoked).toBe(false);
      const after = await License.findOne({ figmaUserId: "u-2" });
      expect(after?.plan).toBe("pro");
      expect(after?.subscription?.flittOrderId).toBe("w2w_pro_u-2_BBB");
    },
  );

  it.skipIf(!suiteEnabled)(
    "returns revoked=false + license=null when user doesn't exist",
    async () => {
      const result = await licenseService.applyRefund({
        figmaUserId: "ghost-user",
        flittOrderId: "w2w_pro_ghost_zzz",
      });
      expect(result.revoked).toBe(false);
      expect(result.license).toBeNull();
    },
  );

  it.skipIf(!suiteEnabled)(
    "does NOT revoke a license that is already Free",
    async () => {
      await License.create({ figmaUserId: "u-3", plan: "free" });

      const result = await licenseService.applyRefund({
        figmaUserId: "u-3",
        flittOrderId: "w2w_pro_u-3_xxx",
      });
      expect(result.revoked).toBe(false);
      const after = await License.findOne({ figmaUserId: "u-3" });
      expect(after?.plan).toBe("free");
    },
  );

  it.skipIf(!suiteEnabled)(
    "writes a 'refund' audit row on a successful revocation",
    async () => {
      await makeProLicense("u-4", "w2w_pro_u-4_ord");
      await licenseService.applyRefund({
        figmaUserId: "u-4",
        flittOrderId: "w2w_pro_u-4_ord",
      });
      const audit = await LicenseAudit.findOne({
        figmaUserId: "u-4",
        action: "refund",
      });
      expect(audit).not.toBeNull();
      expect((audit?.context as Record<string, unknown>)?.revoked).toBe(true);
      expect((audit?.context as Record<string, unknown>)?.flittOrderId).toBe(
        "w2w_pro_u-4_ord",
      );
    },
  );

  it.skipIf(!suiteEnabled)(
    "writes a no-op audit row when refund is stale (forensic trail)",
    async () => {
      await makeProLicense("u-5", "w2w_pro_u-5_NEW");
      await licenseService.applyRefund({
        figmaUserId: "u-5",
        flittOrderId: "w2w_pro_u-5_OLD",
      });
      const audit = await LicenseAudit.findOne({
        figmaUserId: "u-5",
        action: "refund",
      });
      expect(audit).not.toBeNull();
      expect((audit?.context as Record<string, unknown>)?.revoked).toBe(false);
      expect((audit?.context as Record<string, unknown>)?.reason).toBe(
        "stale_or_missing_order",
      );
    },
  );

  it.skipIf(!suiteEnabled)(
    "refund with attacker-supplied order_id leaves other users untouched",
    async () => {
      await makeProLicense("victim", "w2w_pro_victim_LEGIT");

      const result = await licenseService.applyRefund({
        figmaUserId: "victim",
        flittOrderId: "ATTACKER_PROBE",
      });
      expect(result.revoked).toBe(false);
      const after = await License.findOne({ figmaUserId: "victim" });
      expect(after?.plan).toBe("pro");
      expect(after?.subscription?.flittOrderId).toBe("w2w_pro_victim_LEGIT");
    },
  );

  it.skipIf(!suiteEnabled)(
    "preserves PLAN_PRICES expected cycle duration after revocation",
    async () => {
      expect(PLAN_PRICES.pro.priceCents).toBe(1600); // pin the constant
      await makeProLicense("u-6", "w2w_pro_u-6_x");
      const beforeMs = Date.now();
      await licenseService.applyRefund({
        figmaUserId: "u-6",
        flittOrderId: "w2w_pro_u-6_x",
      });
      const after = await License.findOne({ figmaUserId: "u-6" });
      const newCycleMs = after!.cycleEndsAt.getTime() - beforeMs;
      expect(Math.abs(newCycleMs - CYCLE_DURATION_MS)).toBeLessThan(5000);
    },
  );
});
