import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "module";
import request from "supertest";

// Use random port to avoid EADDRINUSE conflicts
process.env.API_PORT = "0";

const require = createRequire(import.meta.url);
const app = require("../api/index");

describe("POST /api/import-html — validation", () => {
  it("returns 400 when htmlCode is missing", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ cssCode: "h1 { color: red; }" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("htmlCode");
  });

  it("returns 400 when htmlCode is empty string", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ htmlCode: "   " });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("htmlCode");
  });

  it("returns 400 when htmlCode is not a string", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ htmlCode: 123 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for invalid colorMode", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ htmlCode: "<h1>Test</h1>", colorMode: "invalid-mode" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("colorMode");
  });

  it("returns 400 for invalid typographyMode", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ htmlCode: "<h1>Test</h1>", typographyMode: "bad" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("typographyMode");
  });

  it("returns 400 for invalid textMode", async () => {
    const res = await request(app)
      .post("/api/import-html")
      .send({ htmlCode: "<h1>Test</h1>", textMode: "unknown" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("textMode");
  });
});
