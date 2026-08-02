import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Random port to avoid EADDRINUSE conflicts.
process.env.API_PORT = "0";

const mockLogImportEvent = vi.fn();
vi.mock("../src/models/ImportEvent.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logImportEvent: mockLogImportEvent };
});

const mockCreateWireframeDataW2W = vi.fn();
vi.mock("../src/lib/htmlExtractor.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createWireframeDataW2W: mockCreateWireframeDataW2W };
});

// Keep the real gate out of the way, but hold on to the request so the test
// can assert the refund marker the route is expected to set.
let lastReq: { importUndelivered?: boolean } | undefined;
vi.mock("../src/middleware/licenseGate.js", () => ({
  requireImportAllowance:
    () =>
    (req: { importUndelivered?: boolean }, _res: unknown, next: () => void) => {
      lastReq = req;
      next();
    },
}));

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

function frames(values: string[]) {
  return [
    {
      viewportWidth: 1440,
      viewportHeight: 900,
      tree: {
        type: "FRAME",
        children: values.map((value) => ({ type: "TEXT", value })),
      },
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  lastReq = undefined;
});

describe("POST /api/import-url — bot-protected sites", () => {
  it("marks the import undelivered so the quota slot is refunded", async () => {
    mockCreateWireframeDataW2W.mockResolvedValue({
      frames: frames(["Access Denied", "You don't have permission to access this resource."]),
      cssVariables: [],
      fonts: [],
    });

    const res = await request(app)
      .post("/api/import-url")
      .send({ sourceUrl: "https://tesla.com" });

    expect(res.status).toBe(200);
    expect(lastReq?.importUndelivered).toBe(true);
  });

  it("keeps the 200 response shape intact (the plugin renders its own handoff panel)", async () => {
    mockCreateWireframeDataW2W.mockResolvedValue({
      frames: frames(["Access Denied"]),
      cssVariables: [],
      fonts: [],
    });

    const res = await request(app)
      .post("/api/import-url")
      .send({ sourceUrl: "https://tesla.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.wireframeData.frames).toHaveLength(1);
    expect(res.body.localStyles).toBeDefined();
  });

  it("logs the attempt as a BOT_BLOCKED failure", async () => {
    mockCreateWireframeDataW2W.mockResolvedValue({
      frames: frames(["Verify you are human"]),
      cssVariables: [],
      fonts: [],
    });

    await request(app).post("/api/import-url").send({ sourceUrl: "https://tesla.com" });

    expect(mockLogImportEvent).toHaveBeenCalledTimes(1);
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({
      figmaUserId: "user-123",
      type: "url",
      success: false,
      errorCode: "BOT_BLOCKED",
    });
  });

  it("leaves a normal import untouched — no marker, success event", async () => {
    mockCreateWireframeDataW2W.mockResolvedValue({
      frames: frames(["Welcome", "Buy now"]),
      cssVariables: [],
      fonts: [],
    });

    const res = await request(app)
      .post("/api/import-url")
      .send({ sourceUrl: "https://example.com" });

    expect(res.status).toBe(200);
    expect(lastReq?.importUndelivered).toBeUndefined();
    expect(mockLogImportEvent.mock.calls[0][0]).toMatchObject({ success: true });
  });
});
