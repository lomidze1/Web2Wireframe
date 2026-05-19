import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

process.env.API_PORT = "0";

// /pending-import inlines licenseService.useImport — bypass quota for these
// tests (cross-user isolation is the focus, not the gate).
vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    useImport: vi.fn().mockResolvedValue({ ok: true, remaining: 9 }),
    getOrCreate: vi.fn(),
    applySubscriptionActivation: vi.fn(),
    applyRecurringCharge: vi.fn(),
    applyFailedCharge: vi.fn(),
    applySubscriptionCancel: vi.fn(),
  },
}));

const TEST_SECRET = "test-secret-key-for-hmac-signing-32bytes!";
process.env.AUTH_SECRET = TEST_SECRET;

const { default: app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { pendingCDPImports, pendingPairings } = await import("../src/state.js");

const tokenA = `Bearer ${signToken("userA", TEST_SECRET)}`;
const tokenB = `Bearer ${signToken("userB", TEST_SECRET)}`;

const w2wPayload = () => ({
  capturedData: {
    width: 1440,
    frame: { type: "FRAME" },
    doc: { innerHeight: 900, title: "Captured page" },
    assets: {},
  },
  timestamp: Date.now(),
});

beforeEach(() => {
  pendingCDPImports.clear();
  pendingPairings.clear();
});

describe("POST /api/extension-pair", () => {
  it("requires a valid plugin token", async () => {
    const res = await request(app).post("/api/extension-pair");
    expect(res.status).toBe(401);
  });

  it("issues a 6-char code bound to the authenticated user", async () => {
    const res = await request(app)
      .post("/api/extension-pair")
      .set("Authorization", tokenA);
    expect(res.status).toBe(200);
    expect(typeof res.body.code).toBe("string");
    expect(res.body.code).toHaveLength(6);
    expect(pendingPairings.get(res.body.code)?.figmaUserId).toBe("userA");
  });
});

describe("POST /api/import-w2w — pairing-scoped queue", () => {
  it("rejects a capture with no pairing code", async () => {
    const res = await request(app).post("/api/import-w2w").send(w2wPayload());
    expect(res.status).toBe(403);
  });

  it("rejects a capture with an unknown pairing code", async () => {
    const res = await request(app)
      .post("/api/import-w2w")
      .send({ pairingCode: "ZZZZZZ", ...w2wPayload() });
    expect(res.status).toBe(403);
  });

  it("rejects an expired pairing code", async () => {
    pendingPairings.set("EXPIRD", {
      figmaUserId: "userA",
      expires: Date.now() - 1000,
    });
    const res = await request(app)
      .post("/api/import-w2w")
      .send({ pairingCode: "EXPIRD", ...w2wPayload() });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/pending-import — cross-user isolation", () => {
  it("delivers a capture only to the user who issued the pairing code", async () => {
    // userA issues a pairing code; the extension captures with it.
    const pair = await request(app)
      .post("/api/extension-pair")
      .set("Authorization", tokenA);
    const code = pair.body.code as string;

    const cap = await request(app)
      .post("/api/import-w2w")
      .send({ pairingCode: code, ...w2wPayload() });
    expect(cap.status).toBe(200);

    // userB must NOT see userA's capture.
    const pollB = await request(app)
      .get("/api/pending-import")
      .set("Authorization", tokenB);
    expect(pollB.status).toBe(200);
    expect(pollB.body.hasPending).toBe(false);

    // userA receives their own capture.
    const pollA = await request(app)
      .get("/api/pending-import")
      .set("Authorization", tokenA);
    expect(pollA.status).toBe(200);
    expect(pollA.body.hasPending).toBe(true);
  });

  it("requires a valid plugin token", async () => {
    const res = await request(app).get("/api/pending-import");
    expect(res.status).toBe(401);
  });
});
