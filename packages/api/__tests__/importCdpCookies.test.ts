import { describe, it, expect } from "vitest";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

const { default: app } = await import("../src/index.js");

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Tests: Cookie handling
// ============================================================================

describe("POST /api/import-cdp — cookie handling", () => {
  it("stores cookies when provided in request body", async () => {
    const cookies = [
      { name: "session", value: "abc123", domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "lax" },
      { name: "token", value: "xyz789", domain: ".example.com", path: "/", secure: true, httpOnly: false, sameSite: "strict" },
    ];

    const res = await request(app)
      .post("/api/import-cdp")
      .send({
        captureData: buildCaptureData(),
        cookies,
        timestamp: Date.now(),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Fetch the pending import to verify round-trip
    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.success).toBe(true);
    expect(pending.body.hasPending).toBe(true);
    expect(pending.body.cookies).toEqual(cookies);
    expect(pending.body.cdpMetadata.hasCookies).toBe(true);
  });

  it("defaults to empty array when cookies not provided", async () => {
    const res = await request(app)
      .post("/api/import-cdp")
      .send({
        captureData: buildCaptureData(),
        timestamp: Date.now(),
      });

    expect(res.status).toBe(200);

    const pending = await request(app).get("/api/pending-import");
    expect(pending.body.cookies).toEqual([]);
    expect(pending.body.cdpMetadata.hasCookies).toBe(false);
  });

  it("defaults to empty array when cookies is null", async () => {
    const res = await request(app)
      .post("/api/import-cdp")
      .send({
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

    const res = await request(app)
      .post("/api/import-cdp")
      .send({
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
    const res = await request(app)
      .post("/api/import-cdp")
      .send({
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

    await request(app)
      .post("/api/import-cdp")
      .send({
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
