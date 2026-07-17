import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockUseImport = vi.fn();
const mockLogImportEvent = vi.fn();

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    useImport: (...args: unknown[]) => mockUseImport(...args),
  },
}));

vi.mock("../src/models/ImportEvent.js", () => ({
  logImportEvent: (...args: unknown[]) => mockLogImportEvent(...args),
}));

const { requireImportAllowance } = await import(
  "../src/middleware/licenseGate.js"
);

function makeApp(type: "url" | "html" | "screenshot" | "extension" = "url") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { userId?: string }).userId = "u-1";
    next();
  });
  app.post("/test/import", requireImportAllowance(type), (_req, res) => {
    res.json({ success: true });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLogImportEvent.mockResolvedValue(undefined);
});

// The paywall collision is the single highest-intent moment a Free user has,
// and until now it left no trace: the 403 returned from the gate before any
// route handler (and therefore any logImportEvent call) ran. Recording it is
// what makes "who hit the wall this week?" answerable — the list the owner
// wants for hand-offering a trial.
describe("requireImportAllowance — quota-block telemetry", () => {
  it("logs a QUOTA_EXCEEDED event when the Free quota is exhausted", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });

    const res = await request(makeApp("url"))
      .post("/test/import")
      .send({ url: "https://example.com/pricing" });

    expect(res.status).toBe(403);
    expect(mockLogImportEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        figmaUserId: "u-1",
        type: "url",
        success: false,
        errorCode: "QUOTA_EXCEEDED",
        sourceUrl: "https://example.com/pricing",
      }),
    );
  });

  it("records the import type the blocked user was attempting", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });

    await request(makeApp("screenshot")).post("/test/import").send({});

    expect(mockLogImportEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "screenshot", errorCode: "QUOTA_EXCEEDED" }),
    );
  });

  it("falls back to a synthetic sourceUrl when the body carries no URL", async () => {
    // sourceUrl is required by the schema; screenshot/html imports have no URL.
    // Mirrors the "screenshot-import" placeholder the route handlers already use.
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });

    await request(makeApp("screenshot")).post("/test/import").send({});

    expect(mockLogImportEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: "screenshot-import" }),
    );
  });

  it("does NOT log a quota event when the import is allowed", async () => {
    // The route handler logs its own success/failure event — a second row here
    // would double-count every import in the feed and in active30d.
    mockUseImport.mockResolvedValue({ remaining: 5 });

    const res = await request(makeApp("url"))
      .post("/test/import")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(200);
    expect(mockLogImportEvent).not.toHaveBeenCalled();
  });

  it("still returns 403 if writing the telemetry row throws", async () => {
    // Telemetry must never turn a clean paywall response into a 500.
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });
    mockLogImportEvent.mockImplementation(() => {
      throw new Error("mongo down");
    });

    const res = await request(makeApp("url")).post("/test/import").send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("limit_exceeded");
  });
});
