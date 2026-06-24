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
});
