import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

// Control the quota gate's verdict per-test. The REAL requireImportAllowance
// runs (we don't mock it) and calls this mocked useImport.
const mockUseImport = vi.fn();
vi.mock("../src/services/licenseService.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    licenseService: {
      ...(actual.licenseService as object),
      useImport: (...args: unknown[]) => mockUseImport(...args),
    },
  };
});

// Capture import-event writes without touching Mongo.
const mockLogImportEvent = vi.fn();
vi.mock("../src/models/ImportEvent.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logImportEvent: mockLogImportEvent };
});

// Stub authenticatePlugin so the route is reachable with a fixed req.userId —
// auth itself is covered by auth.test.ts.
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

describe("POST /api/import-w2w-file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts the import and returns remaining when within quota", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });

    const res = await request(app).post("/api/import-w2w-file").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.importRemaining).toBe(4);
    // Gate uses the verified token identity, not a client-supplied field.
    expect(mockUseImport).toHaveBeenCalledWith("test-user");
  });

  it("returns 403 limit_exceeded when the Free quota is exhausted", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });

    const res = await request(app).post("/api/import-w2w-file").send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("limit_exceeded");
    expect(res.body.upgradeUrl).toBeDefined();
  });

  it("returns importRemaining = null for unlimited (Pro) plans", async () => {
    mockUseImport.mockResolvedValue({
      ok: true,
      remaining: Number.POSITIVE_INFINITY,
    });

    const res = await request(app).post("/api/import-w2w-file").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.importRemaining).toBe(null);
  });

  it("logs an import-event with sourceUrl/title/viewports from the body", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });

    const res = await request(app).post("/api/import-w2w-file").send({
      sourceUrl: "https://acme.test/pricing",
      title: "Acme — Pricing",
      viewports: [1440, 768],
    });

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "test-user",
      sourceUrl: "https://acme.test/pricing",
      title: "Acme — Pricing",
      type: "extension",
      viewports: [1440, 768],
      success: true,
    });
  });

  it("logs the 6 More Options params forwarded by the plugin", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });

    const res = await request(app).post("/api/import-w2w-file").send({
      sourceUrl: "https://acme.test/pricing",
      viewports: [1440],
      colorMode: "website",
      typographyMode: "lines",
      textMode: "lorem",
      assetMode: "realAssets",
      cssVariablesMode: "direct",
      layoutMode: "absolute",
    });

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0].params).toMatchObject({
      colorMode: "website",
      typographyMode: "lines",
      textMode: "lorem",
      assetMode: "realAssets",
      cssVariablesMode: "direct",
      layoutMode: "absolute",
    });
  });

  it("logs an event with sourceUrl 'unknown' when the body is empty (older published plugin)", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });

    const res = await request(app).post("/api/import-w2w-file").send({});

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "test-user",
      sourceUrl: "unknown",
      type: "extension",
      success: true,
    });
  });

  it("logs the blocked attempt — and never a success row — when the quota gate rejects", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });

    const res = await request(app).post("/api/import-w2w-file").send({
      sourceUrl: "https://acme.test",
    });

    expect(res.status).toBe(403);
    // The gate records the paywall collision (highest-intent signal a Free
    // user emits). The handler must still never run, so exactly one row —
    // the QUOTA_EXCEEDED one — is written, never a success:true row.
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "test-user",
      sourceUrl: "https://acme.test",
      type: "extension",
      success: false,
      errorCode: "QUOTA_EXCEEDED",
    });
  });
});
