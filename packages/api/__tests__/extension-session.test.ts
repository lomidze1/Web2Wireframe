/**
 * Tests for /api/extension-session/* — the pairing-code → bearer-token bridge
 * that lets the browser extension talk to authenticated routes (license,
 * checkout, etc.) using the same scheme the plugin uses.
 *
 * Mirrors __tests__/license-routes.test.ts in structure: app factory per test,
 * vi.mock of licenseService + state Map, AUTH_SECRET injected in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { CYCLE_DURATION_MS } from "../src/models/License.js";
import { signToken, authenticatePlugin } from "../src/middleware/auth.js";

// ============================================================================
// Mocks — must precede route import
// ============================================================================

const mockGetOrCreate = vi.fn();

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    getOrCreate: (...args: unknown[]) => mockGetOrCreate(...args),
  },
}));

// vi.mock is hoisted to the top of the file, so any Maps it references
// must also be hoisted — otherwise the factory runs before the `const`
// declarations and throws ReferenceError. vi.hoisted() is the supported
// escape hatch for that. The route + middleware both import from state.js,
// so they end up reading the SAME Map instances we manipulate from tests.
const { pendingPairingsMap, revokedTokensMap } = vi.hoisted(() => ({
  pendingPairingsMap: new Map<string, { figmaUserId: string; expires: number }>(),
  revokedTokensMap: new Map<string, number>(),
}));

vi.mock("../src/state.js", () => ({
  mongoConnected: true,
  setMongoConnected: vi.fn(),
  pendingCDPImports: new Map(),
  pendingPluginAuth: new Map(),
  pendingPairings: pendingPairingsMap,
  PAIRING_CODE_TTL_MS: 10 * 60 * 1000,
  PLUGIN_AUTH_NONCE_TTL_MS: 5 * 60 * 1000,
  revokedTokens: revokedTokensMap,
}));

const { default: extensionSessionRouter } = await import(
  "../src/routes/extension/session.js"
);
const { default: licenseRouter } = await import(
  "../src/routes/license/index.js"
);

// ============================================================================
// Test scaffolding
// ============================================================================

const AUTH_SECRET = "test-auth-secret-for-extension-session-tests";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/extension-session", extensionSessionRouter);
  app.use("/api/license", licenseRouter);
  // A bare guarded endpoint we can hit to prove the revocation blacklist is
  // honored by authenticatePlugin without depending on the license route.
  app.get("/test/guarded", authenticatePlugin, (req, res) => {
    res.json({ ok: true, userId: req.userId });
  });
  return app;
}

function bearer(userId: string, expirySeconds?: number): string {
  return `Bearer ${signToken(userId, AUTH_SECRET, expirySeconds)}`;
}

function fakeLicense(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-05-04T10:00:00Z");
  return {
    figmaUserId: "u-1",
    email: "u1@example.com",
    plan: "free" as const,
    status: "active" as const,
    cycleStartedAt: now,
    cycleEndsAt: new Date(now.getTime() + CYCLE_DURATION_MS),
    usage: { imports: 0, periodStartedAt: now },
    subscription: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingPairingsMap.clear();
  revokedTokensMap.clear();
  process.env.AUTH_SECRET = AUTH_SECRET;
});

// ============================================================================
// POST /redeem
// ============================================================================

describe("POST /api/extension-session/redeem", () => {
  it("returns sessionToken + license for a valid code, deletes the code", async () => {
    pendingPairingsMap.set("ABC23XYZ", {
      figmaUserId: "u-1",
      expires: Date.now() + 60_000,
    });
    mockGetOrCreate.mockResolvedValue(fakeLicense());

    const res = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "ABC23XYZ" });

    expect(res.status).toBe(200);
    expect(typeof res.body.sessionToken).toBe("string");
    expect(res.body.sessionToken.split(".")).toHaveLength(2);
    expect(res.body.figmaUserId).toBe("u-1");
    expect(res.body.email).toBe("u1@example.com");
    expect(res.body.license.plan).toBe("free");
    expect(res.body.license.limits.imports).toBe(10);
    // expiresAt should be ~30 days in the future.
    const expiresMs = new Date(res.body.expiresAt).getTime() - Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThan(thirtyDays - 60_000);
    expect(expiresMs).toBeLessThan(thirtyDays + 60_000);
    // One-time-use guarantee.
    expect(pendingPairingsMap.has("ABC23XYZ")).toBe(false);
  });

  it("uppercases + trims the pairing code before lookup", async () => {
    pendingPairingsMap.set("ABC23XYZ", {
      figmaUserId: "u-1",
      expires: Date.now() + 60_000,
    });
    mockGetOrCreate.mockResolvedValue(fakeLicense());

    const res = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "  abc23xyz  " });

    expect(res.status).toBe(200);
  });

  it("returns 401 for an unknown code", async () => {
    const res = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "ZZZZZZZZ" });
    expect(res.status).toBe(401);
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it("returns 401 for an expired code and prunes the map entry", async () => {
    pendingPairingsMap.set("EXPIRED1", {
      figmaUserId: "u-1",
      expires: Date.now() - 1_000,
    });
    const res = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "EXPIRED1" });
    expect(res.status).toBe(401);
    expect(pendingPairingsMap.has("EXPIRED1")).toBe(false);
  });

  it("returns 401 when the same code is redeemed a second time", async () => {
    pendingPairingsMap.set("ONCEONLY", {
      figmaUserId: "u-1",
      expires: Date.now() + 60_000,
    });
    mockGetOrCreate.mockResolvedValue(fakeLicense());

    const first = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "ONCEONLY" });
    expect(first.status).toBe(200);

    const second = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "ONCEONLY" });
    expect(second.status).toBe(401);
  });

  it("returns 400 when pairingCode is missing or empty", async () => {
    const missing = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({});
    expect(missing.status).toBe(400);

    const empty = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: "   " });
    expect(empty.status).toBe(400);
  });

  it("returns 400 when pairingCode is not a string (NoSQL guard)", async () => {
    const res = await request(makeApp())
      .post("/api/extension-session/redeem")
      .send({ pairingCode: { $ne: null } });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /refresh
// ============================================================================

describe("POST /api/extension-session/refresh", () => {
  it("returns a fresh token with later exp than the inbound one", async () => {
    const inboundToken = signToken("u-1", AUTH_SECRET, 60); // expires in 60s
    const res = await request(makeApp())
      .post("/api/extension-session/refresh")
      .set("Authorization", `Bearer ${inboundToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.sessionToken).toBe("string");
    // Decode inbound + new exp values.
    const inboundExp = JSON.parse(
      Buffer.from(inboundToken.split(".")[0], "base64url").toString(),
    ).exp;
    const newExp = JSON.parse(
      Buffer.from(res.body.sessionToken.split(".")[0], "base64url").toString(),
    ).exp;
    expect(newExp).toBeGreaterThan(inboundExp);
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await request(makeApp()).post("/api/extension-session/refresh");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(makeApp())
      .post("/api/extension-session/refresh")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// POST /revoke + blacklist enforcement
// ============================================================================

describe("POST /api/extension-session/revoke", () => {
  it("revokes the bearer token; subsequent guarded requests with it return 401", async () => {
    const auth = bearer("u-1");
    const app = makeApp();

    // Sanity: token works before revoke.
    const before = await request(app).get("/test/guarded").set("Authorization", auth);
    expect(before.status).toBe(200);

    // Revoke.
    const revokeRes = await request(app)
      .post("/api/extension-session/revoke")
      .set("Authorization", auth);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body).toEqual({ ok: true });

    // Same token is now blacklisted everywhere.
    const after = await request(app).get("/test/guarded").set("Authorization", auth);
    expect(after.status).toBe(401);
    expect(after.body.error).toContain("revoked");
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await request(makeApp()).post("/api/extension-session/revoke");
    expect(res.status).toBe(401);
  });

  it("is idempotent — double-revoke leaves the blacklist with one entry", async () => {
    const auth = bearer("u-1");
    const app = makeApp();
    const first = await request(app)
      .post("/api/extension-session/revoke")
      .set("Authorization", auth);
    expect(first.status).toBe(200);
    const sizeAfterFirst = revokedTokensMap.size;

    const second = await request(app)
      .post("/api/extension-session/revoke")
      .set("Authorization", auth);
    expect(second.status).toBe(401); // first revoke killed it — second can't authenticate
    expect(revokedTokensMap.size).toBe(sizeAfterFirst);
  });

  it("does NOT affect a different user's still-valid token", async () => {
    const authU1 = bearer("u-1");
    const authU2 = bearer("u-2");
    const app = makeApp();

    await request(app).post("/api/extension-session/revoke").set("Authorization", authU1);

    // u-2's token is untouched.
    const stillOk = await request(app).get("/test/guarded").set("Authorization", authU2);
    expect(stillOk.status).toBe(200);
    expect(stillOk.body.userId).toBe("u-2");
  });
});
