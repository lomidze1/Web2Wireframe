import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Coverage for the per-figmaUserId rate limiter on /api/license/by-token.
 *
 * The threat model: the shared `authRateLimiter` is IP-keyed (300/10min).
 * A distributed botnet can spread brute-force attempts against a single
 * victim's HMAC token across hundreds of source IPs and stay under the
 * per-IP cap. `byTokenUserRateLimiter` keys by the body's `figmaUserId`,
 * so all attempts against one victim land in the same bucket regardless
 * of source.
 *
 * Tests run with NODE_ENV != "development" so the rate limiter actually
 * applies. The shared `skipInDevelopment` predicate would otherwise
 * pass-through.
 */

let originalNodeEnv: string | undefined;
const STRONG_SECRET = "test-secret-32-bytes-or-more-for-rate-limit-tests";

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  // env.ts requires these in production-mode; setting strong values keeps
  // the assertProductionSecrets boot guard happy when the module loads.
  process.env.NODE_ENV = "production";
  process.env.AUTH_SECRET = STRONG_SECRET + "a";
  process.env.SESSION_SECRET = STRONG_SECRET + "b";
  process.env.ADMIN_TOKEN = STRONG_SECRET + "c";
  process.env.CORS_ORIGIN = "web2wireframe.design";
  process.env.API_PUBLIC_URL = "https://api.web2wireframe.design";
  process.env.WEBSITE_BASE_URL = "https://www.web2wireframe.design";
  process.env.RESEND_API_KEY = "re_test";
  process.env.SUPPORT_TO_EMAIL = "support@test";
  process.env.NOREPLY_EMAIL = "noreply@test";
  process.env.FIGMA_CLIENT_ID = "test";
  process.env.FIGMA_CLIENT_SECRET = "test";
  process.env.FLITT_MERCHANT_ID = "test";
  process.env.FLITT_SECRET_KEY = "test";
  vi.resetModules();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

/**
 * Build a fresh app + limiter for each test. Express-rate-limit holds
 * counters in module-level memory; without re-importing we'd see counts
 * bleed across tests.
 */
async function makeApp() {
  const { byTokenUserRateLimiter } = await import(
    "../src/middleware/rateLimit.js"
  );
  const app = express();
  app.use(express.json());
  app.post("/api/license/by-token", byTokenUserRateLimiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("byTokenUserRateLimiter", () => {
  it("permits up to 30 requests per minute for a single figmaUserId", async () => {
    const app = await makeApp();
    for (let i = 0; i < 30; i += 1) {
      const res = await request(app)
        .post("/api/license/by-token")
        .send({ figmaUserId: "user-a", token: "x" });
      expect(res.status).toBe(200);
    }
  });

  it("rejects the 31st request for the same figmaUserId with 429", async () => {
    const app = await makeApp();
    for (let i = 0; i < 30; i += 1) {
      await request(app)
        .post("/api/license/by-token")
        .send({ figmaUserId: "user-b", token: "x" });
    }
    const res = await request(app)
      .post("/api/license/by-token")
      .send({ figmaUserId: "user-b", token: "x" });
    expect(res.status).toBe(429);
  });

  it("does NOT cross-contaminate buckets between different figmaUserIds", async () => {
    const app = await makeApp();
    // User-c hits the limit.
    for (let i = 0; i < 30; i += 1) {
      await request(app)
        .post("/api/license/by-token")
        .send({ figmaUserId: "user-c", token: "x" });
    }
    // User-d should still be allowed.
    const res = await request(app)
      .post("/api/license/by-token")
      .send({ figmaUserId: "user-d", token: "x" });
    expect(res.status).toBe(200);
  });

  it("distributed botnet cannot bypass by spreading across IPs", async () => {
    // Pin the threat model: 30+ requests against the same figmaUserId
    // from different source IPs still hit the same bucket. Supertest
    // doesn't let us easily fake source IP, but X-Forwarded-For tests
    // the keyGenerator logic — `req.ip` is derived from it when trust
    // proxy is set, but since this app doesn't set trust proxy, all
    // requests appear from 127.0.0.1. The key is the figmaUserId
    // anyway, so source-IP variation is moot.
    const app = await makeApp();
    const responses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await request(app)
        .post("/api/license/by-token")
        .set("X-Forwarded-For", `203.0.113.${i}`) // each "from" a different IP
        .send({ figmaUserId: "victim", token: "x" });
      responses.push(res.status);
    }
    // Allowed 30, then 5x 429.
    const allowed = responses.filter((s) => s === 200).length;
    const limited = responses.filter((s) => s === 429).length;
    expect(allowed).toBe(30);
    expect(limited).toBe(5);
  });

  it("falls back to IP keying when figmaUserId is missing/non-string (no bypass)", async () => {
    // An attacker who omits figmaUserId from the body shouldn't get a
    // fresh, unlimited bucket. The keyGenerator falls back to IP.
    const app = await makeApp();
    const responses: number[] = [];
    for (let i = 0; i < 32; i += 1) {
      const res = await request(app)
        .post("/api/license/by-token")
        .send({ token: "x" }); // no figmaUserId
      responses.push(res.status);
    }
    // 30 allowed (same IP bucket), then 429s.
    expect(responses.filter((s) => s === 200).length).toBe(30);
    expect(responses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it("skips entirely in development (NODE_ENV=development)", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const app = await makeApp();
    // 100 requests should all pass.
    for (let i = 0; i < 100; i += 1) {
      const res = await request(app)
        .post("/api/license/by-token")
        .send({ figmaUserId: "user-x", token: "x" });
      expect(res.status).toBe(200);
    }
  });
});
