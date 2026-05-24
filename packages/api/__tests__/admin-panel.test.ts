import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { default: panelRouter } = await import(
  "../src/routes/admin/panel.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/panel", panelRouter);
  return app;
}

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
});

describe("GET /api/admin/panel/.html — management UI", () => {
  it("returns 200 with text/html content type", async () => {
    const res = await request(makeApp()).get("/api/admin/panel/.html");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("HTML contains search inputs and action buttons", async () => {
    const res = await request(makeApp()).get("/api/admin/panel/.html");
    expect(res.text).toContain("Web2Wireframe — Admin Panel");
    // Search controls
    expect(res.text).toContain("By email");
    expect(res.text).toContain("By Figma User ID");
    expect(res.text).toContain("Show recent");
    // Action buttons
    expect(res.text).toContain("Grant Pro Monthly");
    expect(res.text).toContain("Grant Pro Yearly");
    expect(res.text).toContain("Extend");
    expect(res.text).toContain("Cancel subscription");
    expect(res.text).toContain("Revoke");
    // Required reason field
    expect(res.text).toContain("Reason");
    // Audit log section
    expect(res.text).toContain("Audit");
  });

  it("reads ADMIN_TOKEN from URL fragment (#token=...) pattern", async () => {
    const res = await request(makeApp()).get("/api/admin/panel/.html");
    // Token-from-URL-fragment pattern (#token=...) — must not leak to
    // server-side access logs.
    expect(res.text).toContain("location.hash.match");
  });

  it("HTML shell is open (no admin gate on the static page itself)", async () => {
    // Like stats.html — the HTML contains no secrets, just a fetch shell.
    // Auth happens client-side when the page calls JSON endpoints.
    process.env.ADMIN_TOKEN = "test-token";
    const res = await request(makeApp()).get("/api/admin/panel/.html");
    expect(res.status).toBe(200);
  });

  it("does not embed any server-side secret into the HTML", async () => {
    process.env.ADMIN_TOKEN = "supersecret-token-value-xyz";
    const res = await request(makeApp()).get("/api/admin/panel/.html");
    expect(res.text).not.toContain("supersecret-token-value-xyz");
  });

  it("calls the existing /api/admin/license/override endpoint for grants", async () => {
    const res = await request(makeApp()).get("/api/admin/panel/.html");
    // All grant/cancel/revoke actions route through the override endpoint
    // — keep the URL referenced exactly so the wiring is asserted.
    expect(res.text).toContain("/api/admin/license/override");
    expect(res.text).toContain("/api/admin/license/recent");
    expect(res.text).toContain("/api/admin/license/lookup-by-email");
  });
});
