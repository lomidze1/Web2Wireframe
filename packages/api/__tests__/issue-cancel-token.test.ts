import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { signToken, verifyToken } from "../src/middleware/auth.js";
import authTokenRoutes from "../src/routes/plugin/auth-token.js";

/**
 * Coverage for POST /api/auth/issue-cancel-token. The endpoint mints a
 * short-lived HMAC token bound to the caller's verified Figma identity
 * (taken from the existing plugin install token, not from request body).
 *
 * Threat model these tests pin down:
 *   - figmaUserId in the request body must NEVER be honored — the verified
 *     middleware-supplied userId wins. Previously this was a privilege-
 *     escalation vector (anyone could mint a cancel token for any user).
 *   - The minted token must be verifiable by the same secret + TTL the
 *     website's /api/subscription/cancel handler uses.
 */

const PLUGIN_AUTH_SECRET = "test-plugin-auth-secret-32bytes!!";
const APP = (() => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authTokenRoutes);
  return app;
})();

function pluginAuthHeader(userId: string): string {
  return `Bearer ${signToken(userId, PLUGIN_AUTH_SECRET)}`;
}

beforeEach(() => {
  process.env.AUTH_SECRET = PLUGIN_AUTH_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/issue-cancel-token", () => {
  it("returns 401 without Authorization header", async () => {
    const res = await request(APP).post("/api/auth/issue-cancel-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid plugin token", async () => {
    const res = await request(APP)
      .post("/api/auth/issue-cancel-token")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns a token + expiresInSeconds=300 for a valid caller", async () => {
    const res = await request(APP)
      .post("/api/auth/issue-cancel-token")
      .set("Authorization", pluginAuthHeader("u-verified"));
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token).toMatch(/^.+\..+$/); // base64.signature
    expect(res.body.expiresInSeconds).toBe(300);
  });

  it("mints a token bound to the verified caller — body figmaUserId is ignored", async () => {
    // Attacker tries to mint a cancel token for someone else by sending
    // their figmaUserId in the body. The route MUST honor the verified
    // identity from authenticatePlugin, not the body.
    const res = await request(APP)
      .post("/api/auth/issue-cancel-token")
      .set("Authorization", pluginAuthHeader("attacker"))
      .send({ figmaUserId: "victim" });
    expect(res.status).toBe(200);

    const payload = verifyToken(res.body.token, PLUGIN_AUTH_SECRET);
    expect(payload.userId).toBe("attacker");
    expect(payload.userId).not.toBe("victim");
  });

  it("minted token is verifiable + has ~5min TTL", async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await request(APP)
      .post("/api/auth/issue-cancel-token")
      .set("Authorization", pluginAuthHeader("u-1"));
    const after = Math.floor(Date.now() / 1000);

    const payload = verifyToken(res.body.token, PLUGIN_AUTH_SECRET);
    expect(payload.userId).toBe("u-1");
    // exp should be ~now + 300, with a couple seconds tolerance.
    expect(payload.exp).toBeGreaterThanOrEqual(before + 300 - 2);
    expect(payload.exp).toBeLessThanOrEqual(after + 300 + 2);
  });

  it("each call mints a fresh token (different exp + different signature)", async () => {
    const a = await request(APP)
      .post("/api/auth/issue-cancel-token")
      .set("Authorization", pluginAuthHeader("u-2"));
    // Sleep 1.1s so the embedded exp claim definitely advances.
    await new Promise((r) => setTimeout(r, 1100));
    const b = await request(APP)
      .post("/api/auth/issue-cancel-token")
      .set("Authorization", pluginAuthHeader("u-2"));
    expect(a.body.token).not.toBe(b.body.token);
  });
});
