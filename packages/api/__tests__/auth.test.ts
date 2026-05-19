import { describe, it, expect, beforeEach } from "vitest";
import express, { Request, Response } from "express";
import request from "supertest";
import { createHmac } from "node:crypto";
import { signToken, verifyToken, authenticatePlugin } from "../src/middleware/auth.js";
import { pendingPluginAuth } from "../src/state.js";

const TEST_SECRET = "test-secret-key-for-hmac-signing-32bytes!";

// ─── Token Signing & Verification ────────────────────────────────────

describe("signToken", () => {
  it("creates a valid token string with two parts separated by dot", () => {
    const token = signToken("user-123", TEST_SECRET);
    expect(typeof token).toBe("string");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
  });

  it("encodes userId in the payload", () => {
    const token = signToken("figma-user-abc", TEST_SECRET);
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(payload.userId).toBe("figma-user-abc");
  });

  it("includes iat and exp timestamps in payload", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signToken("user-1", TEST_SECRET);
    const after = Math.floor(Date.now() / 1000);

    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    // Default 24h expiry
    expect(payload.exp).toBe(payload.iat + 24 * 60 * 60);
  });
});

describe("verifyToken", () => {
  it("returns userId for a valid token", () => {
    const token = signToken("user-456", TEST_SECRET);
    const result = verifyToken(token, TEST_SECRET);
    expect(result.userId).toBe("user-456");
  });

  it("throws for an expired token", () => {
    const payload = {
      userId: "user-expired",
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", TEST_SECRET)
      .update(payloadB64)
      .digest("base64url");
    const expiredToken = `${payloadB64}.${signature}`;

    expect(() => verifyToken(expiredToken, TEST_SECRET)).toThrow(/expired/i);
  });

  it("throws for a tampered token", () => {
    const token = signToken("user-real", TEST_SECRET);
    const [payloadB64, signature] = token.split(".");

    const tamperedPayload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    );
    tamperedPayload.userId = "user-hacker";
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString(
      "base64url"
    );
    const tamperedToken = `${tamperedB64}.${signature}`;

    expect(() => verifyToken(tamperedToken, TEST_SECRET)).toThrow(
      /invalid.*signature/i
    );
  });

  it("throws for a signature of a different length", () => {
    const token = signToken("user-real", TEST_SECRET);
    const [payloadB64] = token.split(".");
    // A short signature must be rejected, not crash timingSafeEqual.
    expect(() => verifyToken(`${payloadB64}.short`, TEST_SECRET)).toThrow(
      /invalid.*signature/i
    );
  });

  it("throws for invalid format (no dot separator)", () => {
    expect(() => verifyToken("not-a-valid-token", TEST_SECRET)).toThrow();
  });

  it("throws for empty string", () => {
    expect(() => verifyToken("", TEST_SECRET)).toThrow();
  });

  it("throws when verified with wrong secret", () => {
    const token = signToken("user-789", TEST_SECRET);
    expect(() => verifyToken(token, "wrong-secret")).toThrow(
      /invalid.*signature/i
    );
  });
});

// ─── Middleware ────────────────────────────────────────────────────────

describe("authenticatePlugin middleware", () => {
  let app: express.Express;

  beforeEach(() => {
    process.env.AUTH_SECRET = TEST_SECRET;

    app = express();
    app.use(express.json());

    app.get(
      "/api/test-protected",
      authenticatePlugin,
      (req: Request, res: Response) => {
        res.json({ userId: (req as any).userId });
      }
    );
  });

  it("passes with valid Authorization Bearer token", async () => {
    const token = signToken("figma-user-100", TEST_SECRET);
    const res = await request(app)
      .get("/api/test-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("figma-user-100");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/api/test-protected");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized|missing.*token/i);
  });

  it("returns 401 when token is invalid", async () => {
    const res = await request(app)
      .get("/api/test-protected")
      .set("Authorization", "Bearer invalid.token.here");

    expect(res.status).toBe(401);
  });

  it("returns 401 when Bearer prefix is missing", async () => {
    const token = signToken("user-1", TEST_SECRET);
    const res = await request(app)
      .get("/api/test-protected")
      .set("Authorization", token);

    expect(res.status).toBe(401);
  });
});

// ─── Auth Routes ──────────────────────────────────────────────────────

describe("Auth Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    pendingPluginAuth.clear();

    app = express();
    app.use(express.json());

    const { default: authRoutes } = await import("../src/routes/plugin/auth.js");
    app.use("/api", authRoutes);

    app.get(
      "/api/protected",
      authenticatePlugin,
      (req: Request, res: Response) => {
        res.json({ success: true, userId: (req as any).userId });
      }
    );
  });

  describe("POST /api/auth/init (removed — auth bypass closed)", () => {
    it("no longer exists: a body figmaUserId cannot mint a token", async () => {
      const res = await request(app).post("/api/auth/init").send({
        figmaUserId: "victim-user-id",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/auth/figma-exchange", () => {
    it("returns 400 when nonce is missing", async () => {
      const res = await request(app).get("/api/auth/figma-exchange");
      expect(res.status).toBe(400);
    });

    it("returns pending when no token is parked for the nonce", async () => {
      const res = await request(app)
        .get("/api/auth/figma-exchange")
        .query({ nonce: "a".repeat(64) });
      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(true);
      expect(res.body.token).toBeUndefined();
    });

    it("returns the parked token and consumes the nonce (single-use)", async () => {
      const nonce = "b".repeat(64);
      const token = signToken("oauth-user", TEST_SECRET, 60);
      pendingPluginAuth.set(nonce, {
        token,
        tokenExpiresAt: Date.now() + 60_000,
        expires: Date.now() + 60_000,
      });

      const first = await request(app)
        .get("/api/auth/figma-exchange")
        .query({ nonce });
      expect(first.status).toBe(200);
      expect(first.body.pending).toBe(false);
      expect(first.body.token).toBe(token);
      expect(verifyToken(first.body.token, TEST_SECRET).userId).toBe(
        "oauth-user"
      );

      const second = await request(app)
        .get("/api/auth/figma-exchange")
        .query({ nonce });
      expect(second.body.pending).toBe(true);
    });

    it("treats an expired nonce entry as pending", async () => {
      const nonce = "c".repeat(64);
      pendingPluginAuth.set(nonce, {
        token: signToken("stale-user", TEST_SECRET, 60),
        tokenExpiresAt: Date.now() + 60_000,
        expires: Date.now() - 1000,
      });
      const res = await request(app)
        .get("/api/auth/figma-exchange")
        .query({ nonce });
      expect(res.body.pending).toBe(true);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("returns a new token for a valid existing token", async () => {
      const oldToken = signToken("refresh-user", TEST_SECRET);

      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Authorization", `Bearer ${oldToken}`);

      expect(refreshRes.status).toBe(200);
      expect(typeof refreshRes.body.token).toBe("string");
      expect(refreshRes.body.expiresAt).toBeDefined();
      expect(verifyToken(refreshRes.body.token, TEST_SECRET).userId).toBe(
        "refresh-user"
      );
    });

    it("returns 401 without token", async () => {
      const res = await request(app).post("/api/auth/refresh");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns user info for valid token", async () => {
      const token = signToken("me-user", TEST_SECRET);
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe("me-user");
    });
  });

  describe("Protected route integration", () => {
    it("a token exchanged via the OAuth bridge works on protected routes", async () => {
      const nonce = "d".repeat(64);
      pendingPluginAuth.set(nonce, {
        token: signToken("protected-user", TEST_SECRET, 3600),
        tokenExpiresAt: Date.now() + 3_600_000,
        expires: Date.now() + 60_000,
      });

      const exchange = await request(app)
        .get("/api/auth/figma-exchange")
        .query({ nonce });

      const res = await request(app)
        .get("/api/protected")
        .set("Authorization", `Bearer ${exchange.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe("protected-user");
    });

    it("request without token to protected route returns 401", async () => {
      const res = await request(app).get("/api/protected");
      expect(res.status).toBe(401);
    });
  });
});
