import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockImportEventFind = vi.fn();

vi.mock("../src/models/ImportEvent.js", () => ({
  ImportEvent: { find: (...args: unknown[]) => mockImportEventFind(...args) },
}));

const { default: statsRouter } = await import("../src/routes/admin/stats.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/stats", statsRouter);
  return app;
}

const ADMIN_TOKEN = "test-admin-token-32-bytes-or-more!";

/** Primes ImportEvent.find(proj).sort().limit().lean() with rows. */
function primeImports(rows: unknown[]): void {
  mockImportEventFind.mockReturnValue({
    sort: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }),
  });
}

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
  mockImportEventFind.mockReset();
  primeImports([]);
});

describe("GET /api/admin/stats/imports — per-user history", () => {
  it("returns 401 when ADMIN_TOKEN is set and credential is missing", async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    const res = await request(makeApp()).get(
      "/api/admin/stats/imports?figmaUserId=u-1",
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when figmaUserId is missing", async () => {
    const res = await request(makeApp()).get("/api/admin/stats/imports");
    expect(res.status).toBe(400);
  });

  it("queries by the requested figmaUserId and returns the serialized history", async () => {
    primeImports([
      {
        sourceUrl: "https://acme.test/pricing",
        title: "Acme",
        type: "url",
        viewports: [1440, 768],
        params: {
          colorMode: "website",
          typographyMode: "lines",
          textMode: "lorem",
          pluginFont: "Inter",
        },
        success: true,
        createdAt: new Date("2026-06-20T00:00:00Z"),
      },
      {
        sourceUrl: "https://broken.test",
        type: "extension",
        viewports: [1440],
        success: false,
        errorCode: "TIMEOUT",
        createdAt: new Date("2026-06-19T00:00:00Z"),
      },
    ]);

    const res = await request(makeApp()).get(
      "/api/admin/stats/imports?figmaUserId=u-42",
    );

    expect(res.status).toBe(200);
    expect(res.body.figmaUserId).toBe("u-42");
    // The query is scoped to the requested user.
    expect(mockImportEventFind).toHaveBeenCalledWith(
      { figmaUserId: "u-42" },
      expect.any(Object),
    );
    expect(res.body.imports).toHaveLength(2);
    expect(res.body.imports[0]).toMatchObject({
      sourceUrl: "https://acme.test/pricing",
      type: "url",
      success: true,
      params: { colorMode: "website", typographyMode: "lines" },
    });
    // Extension import → params null (chosen plugin-side, not on server).
    expect(res.body.imports[1]).toMatchObject({
      type: "extension",
      success: false,
      errorCode: "TIMEOUT",
      params: null,
    });
  });

  it("returns 500 when the query throws", async () => {
    mockImportEventFind.mockImplementation(() => {
      throw new Error("mongo down");
    });
    const res = await request(makeApp()).get(
      "/api/admin/stats/imports?figmaUserId=u-1",
    );
    expect(res.status).toBe(500);
  });
});
