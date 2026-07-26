import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

// Bypass the license gate — these tests focus on webStorage round-trip,
// not on quota enforcement.
vi.mock("../src/middleware/licenseGate.js", () => ({
  requireImportAllowance: () => (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
}));
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

function postCdp(body: Record<string, unknown>) {
  return request(app)
    .post("/api/import-cdp")
    .send({ pairingCode: PAIR, ...body });
}

// ============================================================================
// Tests: import-cdp stores webStorage and it flows to pending-import
// ============================================================================

describe("POST /api/import-cdp — webStorage round-trip", () => {
  it("stores webStorage and returns it via pending-import", async () => {
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
    expect(res.body.success).toBe(true);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.success).toBe(true);
    expect(pending.body.webStorage).toEqual(webStorage);
    expect(pending.body.cdpMetadata.hasWebStorage).toBe(true);
  });

  it("defaults webStorage to empty objects when not provided", async () => {
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
// Tests: capture-with-auth accepts webStorage parameter
// ============================================================================

describe("POST /api/capture-with-auth — webStorage parameter", () => {
  it("accepts webStorage field without returning 400", async () => {
    // Note: This will fail with a Puppeteer/rendering error (no real browser),
    // but it should NOT fail with a 400 "bad request" for the webStorage field.
    const res = await request(app)
      .post("/api/capture-with-auth")
      .send({
        pairingCode: PAIR,
        url: "https://example.com",
        viewports: [1440],
        cookies: [],
        webStorage: {
          localStorage: { theme: "dark" },
          sessionStorage: {},
        },
      });

    // A 500 is expected (no browser available in test), but NOT 400
    expect(res.status).not.toBe(400);
  }, 30_000); // launches Puppeteer (fails, no browser) — allow ample time
});
