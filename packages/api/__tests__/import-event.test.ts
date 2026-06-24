import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Random port to avoid EADDRINUSE conflicts.
process.env.API_PORT = "0";

// Capture import-event writes without touching Mongo.
const mockLogImportEvent = vi.fn();
vi.mock("../src/models/ImportEvent.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logImportEvent: mockLogImportEvent };
});

// Mock the W2W URL extractor used by /import-url.
const mockCreateWireframeDataW2W = vi.fn();
vi.mock("../src/lib/htmlExtractor.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createWireframeDataW2W: mockCreateWireframeDataW2W };
});

// Bypass quota gate — counter enforcement is covered elsewhere.
vi.mock("../src/middleware/licenseGate.js", () => ({
  requireImportAllowance: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Fixed authenticated identity.
vi.mock("../src/middleware/auth.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    authenticatePlugin: (req: { userId?: string }, _res: unknown, next: () => void) => {
      req.userId = "user-123";
      next();
    },
  };
});

const { default: app } = await import("../src/index.js");

describe("POST /api/import-url — import-event logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a success event with the imported URL, type and viewports", async () => {
    mockCreateWireframeDataW2W.mockResolvedValue({
      frames: [{ viewportWidth: 1440, viewportHeight: 900, tree: {} }],
      cssVariables: [],
      fonts: [],
    });

    const res = await request(app)
      .post("/api/import-url")
      .send({
        sourceUrl: "https://example.com",
        viewports: [1440, 768],
        colorMode: "website",
        typographyMode: "lines",
        textMode: "lorem",
        pluginFont: "Inter",
      });

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    const evt = mockLogImportEvent.mock.calls[0][0];
    expect(evt).toMatchObject({
      figmaUserId: "user-123",
      type: "url",
      success: true,
      viewports: [1440, 768],
      params: {
        colorMode: "website",
        typographyMode: "lines",
        textMode: "lorem",
        pluginFont: "Inter",
      },
    });
    expect(evt.sourceUrl).toContain("example.com");
  });

  it("logs a failure event with errorCode when extraction throws", async () => {
    mockCreateWireframeDataW2W.mockRejectedValue(new Error("Navigation timeout exceeded"));

    const res = await request(app)
      .post("/api/import-url")
      .send({ sourceUrl: "https://example.com" });

    expect(res.status).toBe(500);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    const evt = mockLogImportEvent.mock.calls[0][0];
    expect(evt).toMatchObject({
      figmaUserId: "user-123",
      type: "url",
      success: false,
      errorCode: "TIMEOUT",
    });
    expect(evt.sourceUrl).toContain("example.com");
  });
});
