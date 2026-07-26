import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

// Mock the AI analysis before importing app — tests focus on route behavior
// (single call, scaling, refund, error mapping), not on the Anthropic client.
const mockAnalyze = vi.fn();
vi.mock("../src/lib/aiGenerator.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    analyzeScreenshotAbsoluteWithRetry: (...args: unknown[]) => mockAnalyze(...args),
  };
});

// Spy on quota refunds without touching the rest of the license service.
const mockRefundImport = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/services/licenseService.js", async (importOriginal) => {
  const actual = (await importOriginal()) as {
    licenseService: Record<string, unknown>;
  } & Record<string, unknown>;
  return {
    ...actual,
    licenseService: {
      ...actual.licenseService,
      refundImport: (...args: unknown[]) => mockRefundImport(...args),
    },
  };
});

// Bypass the license gate — quota enforcement is covered separately.
vi.mock("../src/middleware/licenseGate.js", () => ({
  requireImportAllowance: () => (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
}));

// Stub authenticatePlugin so import routes are reachable with a fixed req.userId.
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

const PNG_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg";

/** Analysis result in the image's natural coordinate space (1000px wide). */
const ANALYSIS_RESULT = {
  pageWidth: 1000,
  pageHeight: 2000,
  extractedColors: {
    text: "#111111",
    background: "#FFFFFF",
    secondary: "#888888",
    surface: "#F5F5F5",
    accent: "#3366FF",
  },
  elements: [
    { type: "heading", text: "Hi", level: 1, x: 100, y: 200, width: 400, height: 50 },
  ],
};

beforeEach(() => {
  mockAnalyze.mockReset();
  mockRefundImport.mockClear();
  mockAnalyze.mockResolvedValue(structuredClone(ANALYSIS_RESULT));
});

describe("POST /api/import-screenshot — media type validation", () => {
  it("rejects unsupported image formats with 400 and refunds the quota slot", async () => {
    const res = await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: "data:image/avif;base64,AAAA", imageWidth: 1000, imageHeight: 2000 });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("UNSUPPORTED_IMAGE_FORMAT");
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockRefundImport).toHaveBeenCalledWith("test-user");
  });

  it("accepts png/jpeg/webp/gif data URIs", async () => {
    for (const mt of ["png", "jpeg", "jpg", "webp", "gif"]) {
      const res = await request(app)
        .post("/api/import-screenshot")
        .send({ imageBase64: `data:image/${mt};base64,AAAA`, imageWidth: 1000, imageHeight: 2000 });
      expect(res.status).toBe(200);
    }
  });

  it("still requires imageBase64", async () => {
    const res = await request(app).post("/api/import-screenshot").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("imageBase64");
  });
});

describe("POST /api/import-screenshot — single AI call + server-side scaling", () => {
  it("makes exactly ONE AI call for multiple viewports", async () => {
    const res = await request(app)
      .post("/api/import-screenshot")
      .send({
        imageBase64: PNG_IMAGE,
        imageWidth: 1000,
        imageHeight: 2000,
        viewports: [1440, 768, 375],
      });

    expect(res.status).toBe(200);
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    expect(res.body.wireframeData.frames).toHaveLength(3);
  });

  it("analyzes in the image's natural coordinate space (viewportWidth = imageWidth)", async () => {
    await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: PNG_IMAGE, imageWidth: 1000, imageHeight: 2000, viewports: [1440] });

    expect(mockAnalyze.mock.calls[0][0]).toMatchObject({
      imageWidth: 1000,
      viewportWidth: 1000,
    });
  });

  it("scales element geometry linearly per viewport", async () => {
    const res = await request(app)
      .post("/api/import-screenshot")
      .send({
        imageBase64: PNG_IMAGE,
        imageWidth: 1000,
        imageHeight: 2000,
        viewports: [500, 2000],
      });

    const [half, double] = res.body.wireframeData.frames;

    // pageWidth 1000 → viewport 500: factor 0.5
    expect(half.viewportWidth).toBe(500);
    expect(half.tree.width).toBe(500);
    expect(half.viewportHeight).toBe(1000);
    expect(half.tree.children[0]).toMatchObject({ x: 50, y: 100, width: 200, height: 25 });

    // pageWidth 1000 → viewport 2000: factor 2
    expect(double.viewportWidth).toBe(2000);
    expect(double.tree.width).toBe(2000);
    expect(double.viewportHeight).toBe(4000);
    expect(double.tree.children[0]).toMatchObject({ x: 200, y: 400, width: 800, height: 100 });
  });

  it("uses AI-extracted colors consistently across all frames when colorMode=website", async () => {
    const res = await request(app)
      .post("/api/import-screenshot")
      .send({
        imageBase64: PNG_IMAGE,
        imageWidth: 1000,
        imageHeight: 2000,
        viewports: [1440, 375],
        colorMode: "website",
      });

    expect(res.status).toBe(200);
    expect(res.body.pluginColors).toMatchObject({ accent: "#3366FF" });
    // Every frame's root uses the same extracted background color.
    for (const frame of res.body.wireframeData.frames) {
      expect(frame.tree.backgroundColor).toBe("#FFFFFF");
    }
  });

  it("does not refund on success", async () => {
    const res = await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: PNG_IMAGE, imageWidth: 1000, imageHeight: 2000 });

    expect(res.status).toBe(200);
    expect(mockRefundImport).not.toHaveBeenCalled();
  });
});

describe("POST /api/import-screenshot — failure handling", () => {
  it("returns 500 and refunds the quota slot on AI failure", async () => {
    mockAnalyze.mockRejectedValue(new Error("boom"));

    const res = await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: PNG_IMAGE, imageWidth: 1000, imageHeight: 2000 });

    expect(res.status).toBe(500);
    expect(res.body.errorCode).toBe("SCREENSHOT_ANALYSIS_ERROR");
    expect(mockRefundImport).toHaveBeenCalledWith("test-user");
  });

  it("maps TRUNCATED to 422 with an actionable message", async () => {
    const err = Object.assign(new Error("truncated"), { code: "TRUNCATED" });
    mockAnalyze.mockRejectedValue(err);

    const res = await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: PNG_IMAGE, imageWidth: 1000, imageHeight: 2000 });

    expect(res.status).toBe(422);
    expect(res.body.errorCode).toBe("SCREENSHOT_TRUNCATED");
    expect(res.body.error).toMatch(/crop/i);
    expect(mockRefundImport).toHaveBeenCalledWith("test-user");
  });

  it("still maps AI rate limiting to 429", async () => {
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    mockAnalyze.mockRejectedValue(err);

    const res = await request(app)
      .post("/api/import-screenshot")
      .send({ imageBase64: PNG_IMAGE, imageWidth: 1000, imageHeight: 2000 });

    expect(res.status).toBe(429);
    expect(res.body.errorCode).toBe("AI_RATE_LIMITED");
  });
});
