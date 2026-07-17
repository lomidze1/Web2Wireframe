import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

// Mock createWireframeDataFromHTMLW2W before importing app
const mockCreateWireframeDataFromHTMLW2W = vi.fn();
vi.mock("../src/lib/htmlExtractor.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createWireframeDataFromHTMLW2W: mockCreateWireframeDataFromHTMLW2W,
  };
});

// Bypass the license gate — these tests focus on import validation/flow,
// not on quota enforcement (which is covered separately).
vi.mock("../src/middleware/licenseGate.js", () => ({
  requireImportAllowance: () => (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
}));

// Stub authenticatePlugin so import routes are reachable with a fixed
// req.userId — auth itself is covered by auth.test.ts.
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

describe("POST /api/import-html — validation", () => {
  it("returns 400 when htmlCode is missing", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", cssCode: "h1 { color: red; }" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("htmlCode");
  });

  it("returns 400 when htmlCode is empty string", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "   " });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("htmlCode");
  });

  it("returns 400 when htmlCode is not a string", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: 123 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for invalid colorMode", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<h1>Test</h1>", colorMode: "invalid-mode" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("colorMode");
  });

  it("returns 400 for invalid typographyMode", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<h1>Test</h1>", typographyMode: "bad" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("fontMode");
  });

  it("returns 400 for invalid textMode", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<h1>Test</h1>", textMode: "unknown" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("textMode");
  });
});

describe("POST /api/import-html — success flow", () => {
  const MOCK_FRAMES = [
    { viewportWidth: 1440, viewportHeight: 900, tree: { tag: "BODY", children: [] } },
  ];
  const MOCK_CSS_VARS = [{ name: "--primary", value: "#333" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateWireframeDataFromHTMLW2W.mockResolvedValue({
      frames: MOCK_FRAMES,
      cssVariables: MOCK_CSS_VARS,
    });
  });

  it("returns correct success response structure", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<h1>Hello</h1>" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sourceUrl).toBe("html-import");
    expect(res.body.frameCount).toBe(1);
    expect(res.body.wireframeData).toBeDefined();
    expect(res.body.wireframeData.frames).toHaveLength(1);
    expect(res.body.localStyles).toBeDefined();
    expect(res.body.pluginColors).toBeDefined();
    expect(res.body.cssVariables).toEqual(MOCK_CSS_VARS);
  });

  it("uses default values when optional fields are omitted", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<p>Defaults</p>" });

    expect(res.status).toBe(200);
    // Check mockCreateWireframeDataFromHTMLW2W was called with defaults
    expect(mockCreateWireframeDataFromHTMLW2W).toHaveBeenCalledWith(
      "<p>Defaults</p>",        // htmlCode
      "",                        // cssCode default
      [1440],                    // default viewports
    );
  });

  it("merges custom pluginColors with defaults", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user",
        htmlCode: "<h1>Colors</h1>",
        pluginColors: { main: "#ff0000", text: "#00ff00" },
      });

    expect(res.status).toBe(200);
    const colors = res.body.pluginColors;
    // Custom values override
    expect(colors.main).toBe("#ff0000");
    expect(colors.text).toBe("#00ff00");
    // Defaults preserved for unspecified keys
    expect(colors.accent).toBeDefined();
    expect(colors.surface).toBeDefined();
    expect(colors.border).toBeDefined();
    expect(colors.background).toBeDefined();
  });

  it("passes cssCode through buildFullPage into extraction", async () => {
    await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user",
        htmlCode: "<div>Styled</div>",
        cssCode: "div { color: red; }",
      });

    // createWireframeDataFromHTMLW2W receives htmlCode and cssCode separately
    expect(mockCreateWireframeDataFromHTMLW2W).toHaveBeenCalledWith(
      "<div>Styled</div>",
      "div { color: red; }",
      [1440],
    );
  });

  it("forwards custom viewports to extraction", async () => {
    const multiFrames = [
      { viewportWidth: 1440, viewportHeight: 900, tree: { tag: "BODY", children: [] } },
      { viewportWidth: 768, viewportHeight: 900, tree: { tag: "BODY", children: [] } },
      { viewportWidth: 375, viewportHeight: 900, tree: { tag: "BODY", children: [] } },
    ];
    mockCreateWireframeDataFromHTMLW2W.mockResolvedValue({
      frames: multiFrames,
      cssVariables: [],
    });

    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user",
        htmlCode: "<h1>Multi</h1>",
        viewports: [1440, 768, 375],
      });

    expect(res.status).toBe(200);
    expect(res.body.frameCount).toBe(3);
    expect(mockCreateWireframeDataFromHTMLW2W).toHaveBeenCalledWith(
      "<h1>Multi</h1>",
      "",
      [1440, 768, 375],
    );
  });

  it("returns correct localStyles structure", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<p>Styles</p>" });

    expect(res.status).toBe(200);
    const { localStyles } = res.body;

    // 6 color entries
    expect(localStyles.colors).toHaveLength(6);
    const colorIds = localStyles.colors.map((c: any) => c.id);
    expect(colorIds).toEqual(
      expect.arrayContaining([
        "color-main", "color-text", "color-accent",
        "color-surface", "color-border", "color-background",
      ])
    );

    // 2 typography entries
    expect(localStyles.typography).toHaveLength(2);
    const typoIds = localStyles.typography.map((t: any) => t.id);
    expect(typoIds).toEqual(
      expect.arrayContaining(["typography-heading", "typography-body"])
    );
  });

  it("returns 500 when extraction produces empty frames", async () => {
    mockCreateWireframeDataFromHTMLW2W.mockResolvedValue({
      frames: [],
      cssVariables: [],
    });

    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<h1>Empty</h1>" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Failed to extract");
  });

  it("returns 500 with error message when extraction throws", async () => {
    mockCreateWireframeDataFromHTMLW2W.mockRejectedValue(
      new Error("Browser crashed")
    );

    const res = await request(app)
      .post("/api/import-html")
      .send({ figmaUserId: "test-user", htmlCode: "<h1>Crash</h1>" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Browser crashed");
  });
});
