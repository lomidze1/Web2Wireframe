import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

// Bypass the license gate — these tests focus on CDP capture round-trip
// behavior, not on quota enforcement (which is covered separately).
vi.mock("../src/middleware/licenseGate.js", () => ({
  requireImportAllowance: () => (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
}));

// pending-import inlines licenseService.useImport — also bypass for tests.
vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    useImport: vi.fn().mockResolvedValue({ ok: true, remaining: 9 }),
    getOrCreate: vi.fn(),
    applySubscriptionActivation: vi.fn(),
    applyRecurringCharge: vi.fn(),
    applyFailedCharge: vi.fn(),
  },
}));

// Stub authenticatePlugin so GET /api/pending-import resolves to a fixed user.
vi.mock("../src/middleware/auth.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    authenticatePlugin: (
      req: { userId?: string },
      _res: unknown,
      next: () => void,
    ) => {
      req.userId = "test-user";
      next();
    },
  };
});

const { default: app } = await import("../src/index.js");
const { pendingPairings, pendingCDPImports } = await import("../src/state.js");

// ============================================================================
// Helpers
// ============================================================================

const PAIR = "TESTCD";

beforeEach(() => {
  pendingCDPImports.clear();
  pendingPairings.clear();
  pendingPairings.set(PAIR, {
    figmaUserId: "test-user",
    expires: Date.now() + 600_000,
  });
});

function buildCaptureData(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://example.com",
    title: "Example",
    frames: [
      {
        viewport: { width: 1440, height: 900 },
        tree: { tag: "BODY", children: [] },
      },
    ],
    fonts: [],
    cssVariables: [],
    stylesheets: [],
    ...overrides,
  };
}

/** POST /api/import-cdp with the test pairing code attached. */
function postCdp(body: Record<string, unknown>) {
  return request(app)
    .post("/api/import-cdp")
    .send({ pairingCode: PAIR, ...body });
}

// ============================================================================
// Tests: pairing-code scoping
// ============================================================================

describe("POST /api/import-cdp — pairing code", () => {
  it("rejects a capture with no pairing code", async () => {
    const res = await request(app)
      .post("/api/import-cdp")
      .send({ captureData: buildCaptureData(), timestamp: Date.now() });
    expect(res.status).toBe(403);
  });

  it("rejects a capture with an unknown pairing code", async () => {
    const res = await request(app)
      .post("/api/import-cdp")
      .send({
        pairingCode: "ZZZZZZ",
        captureData: buildCaptureData(),
        timestamp: Date.now(),
      });
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// Tests: Cookie handling
// ============================================================================

describe("POST /api/import-cdp — cookie handling", () => {
  it("stores cookies when provided in request body", async () => {
    const cookies = [
      { name: "session", value: "abc123", domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "lax" },
      { name: "token", value: "xyz789", domain: ".example.com", path: "/", secure: true, httpOnly: false, sameSite: "strict" },
    ];

    const res = await postCdp({
      captureData: buildCaptureData(),
      cookies,
      timestamp: Date.now(),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.success).toBe(true);
    expect(pending.body.hasPending).toBe(true);
    expect(pending.body.cookies).toEqual(cookies);
    expect(pending.body.cdpMetadata.hasCookies).toBe(true);
  });

  it("defaults to empty array when cookies not provided", async () => {
    const res = await postCdp({
      captureData: buildCaptureData(),
      timestamp: Date.now(),
    });

    expect(res.status).toBe(200);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.cookies).toEqual([]);
    expect(pending.body.cdpMetadata.hasCookies).toBe(false);
  });

  it("defaults to empty array when cookies is null", async () => {
    const res = await postCdp({
      captureData: buildCaptureData(),
      cookies: null,
      timestamp: Date.now(),
    });

    expect(res.status).toBe(200);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.cookies).toEqual([]);
    expect(pending.body.cdpMetadata.hasCookies).toBe(false);
  });
});

// ============================================================================
// Tests: webStorage handling
// ============================================================================

describe("POST /api/import-cdp — webStorage handling", () => {
  it("stores webStorage when provided", async () => {
    const webStorage = {
      localStorage: { theme: "dark", lang: "en" },
      sessionStorage: { cart: "item1,item2" },
    };

    const res = await postCdp({
      captureData: buildCaptureData(),
      cookies: [],
      webStorage,
      timestamp: Date.now(),
    });

    expect(res.status).toBe(200);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.webStorage).toEqual(webStorage);
    expect(pending.body.cdpMetadata.hasWebStorage).toBe(true);
  });

  it("defaults webStorage when not provided", async () => {
    const res = await postCdp({
      captureData: buildCaptureData(),
      timestamp: Date.now(),
    });

    expect(res.status).toBe(200);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.webStorage).toEqual({ localStorage: {}, sessionStorage: {} });
    expect(pending.body.cdpMetadata.hasWebStorage).toBe(false);
  });
});

// ============================================================================
// Tests: Round-trip (POST → GET)
// ============================================================================

describe("POST /api/import-cdp → GET /api/pending-import round-trip", () => {
  it("preserves all metadata through round-trip", async () => {
    const cookies = [
      { name: "sid", value: "v1", domain: ".test.com", path: "/", secure: false, httpOnly: true, sameSite: "none" },
    ];
    const webStorage = {
      localStorage: { key: "val" },
      sessionStorage: {},
    };

    await postCdp({
      captureData: buildCaptureData({ url: "https://test.com/page" }),
      cookies,
      webStorage,
      timestamp: 1700000000000,
    });

    const pending = await request(app).get("/api/pending-import");

    expect(pending.body.success).toBe(true);
    expect(pending.body.hasPending).toBe(true);
    expect(pending.body.sourceUrl).toBe("https://test.com/page");
    expect(pending.body.cookies).toEqual(cookies);
    expect(pending.body.webStorage).toEqual(webStorage);
    expect(pending.body.cdpMetadata).toMatchObject({
      captureTimestamp: 1700000000000,
      hasCookies: true,
      hasWebStorage: true,
      hasMatchedStyles: true,
      hasGradients: true,
    });
  });
});
