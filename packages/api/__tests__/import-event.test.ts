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

// Mock the W2W extractors used by /import-url and /import-html.
const mockCreateWireframeDataW2W = vi.fn();
const mockCreateWireframeDataFromHTMLW2W = vi.fn();
vi.mock("../src/lib/htmlExtractor.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createWireframeDataW2W: mockCreateWireframeDataW2W,
    createWireframeDataFromHTMLW2W: mockCreateWireframeDataFromHTMLW2W,
  };
});

// Mock the screenshot AI pipeline used by /import-screenshot. Keep the tree
// converter trivial — these tests assert on event logging, not rendering.
const mockAnalyzeScreenshot = vi.fn();
vi.mock("../src/lib/aiGenerator.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    analyzeScreenshotAbsoluteWithRetry: mockAnalyzeScreenshot,
    validateExtractedColors: () => ({ valid: false, colors: {} }),
  };
});
vi.mock("../src/lib/wireframeConverter.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    convertAbsoluteToWireframeTree: () => ({ tag: "BODY", children: [] }),
  };
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
        assetMode: "realAssets",
        cssVariablesMode: "direct",
        layoutMode: "absolute",
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
        assetMode: "realAssets",
        cssVariablesMode: "direct",
        layoutMode: "absolute",
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

describe("POST /api/import-html — import-event logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a success event with type 'html' and the chosen params", async () => {
    mockCreateWireframeDataFromHTMLW2W.mockResolvedValue({
      frames: [{ viewportWidth: 1440, viewportHeight: 900, tree: {} }],
      cssVariables: [],
    });

    const res = await request(app)
      .post("/api/import-html")
      .send({
        htmlCode: "<h1>Hello</h1>",
        viewports: [1440],
        colorMode: "website",
        typographyMode: "lines",
        textMode: "lorem",
        pluginFont: "Inter",
        assetMode: "realAssets",
        cssVariablesMode: "direct",
        layoutMode: "absolute",
      });

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "user-123",
      sourceUrl: "html-import",
      type: "html",
      success: true,
      viewports: [1440],
      params: {
        colorMode: "website",
        typographyMode: "lines",
        textMode: "lorem",
        pluginFont: "Inter",
        assetMode: "realAssets",
        cssVariablesMode: "direct",
        layoutMode: "absolute",
      },
    });
  });

  it("logs a failure event with errorCode when extraction throws", async () => {
    mockCreateWireframeDataFromHTMLW2W.mockRejectedValue(
      new Error("HTML rendering took too long — timeout"),
    );

    const res = await request(app)
      .post("/api/import-html")
      .send({ htmlCode: "<h1>Crash</h1>" });

    expect(res.status).toBe(500);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "user-123",
      sourceUrl: "html-import",
      type: "html",
      success: false,
      errorCode: "TIMEOUT",
    });
  });
});

describe("POST /api/import-screenshot — import-event logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a success event with type 'screenshot'", async () => {
    mockAnalyzeScreenshot.mockResolvedValue({
      pageHeight: 1200,
      extractedColors: {},
    });

    const res = await request(app)
      .post("/api/import-screenshot")
      .send({
        imageBase64: "data:image/png;base64,AAAA",
        viewports: [1440],
        textMode: "lorem",
        colorMode: "plugin",
        pluginFont: "Inter",
        typographyMode: "lines",
        assetMode: "realAssets",
        cssVariablesMode: "direct",
        layoutMode: "absolute",
      });

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "user-123",
      sourceUrl: "screenshot-import",
      type: "screenshot",
      success: true,
      viewports: [1440],
      params: {
        colorMode: "plugin",
        textMode: "lorem",
        pluginFont: "Inter",
        typographyMode: "lines",
        assetMode: "realAssets",
        cssVariablesMode: "direct",
        layoutMode: "absolute",
      },
    });
  });

  it("logs a failure event when AI analysis throws", async () => {
    mockAnalyzeScreenshot.mockRejectedValue(new Error("model exploded"));

    const res = await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: "data:image/png;base64,AAAA" });

    expect(res.status).toBe(500);
    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "user-123",
      sourceUrl: "screenshot-import",
      type: "screenshot",
      success: false,
    });
  });
});
