import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { flittIpAllowlist } from "../src/middleware/flittIpAllowlist.js";

/**
 * The IP allowlist relies on `req.ip`. Supertest connects over loopback so
 * the source is "::ffff:127.0.0.1" by default. We use `app.set("trust proxy")`
 * + a custom `X-Forwarded-For` to spoof source IPs in tests.
 */
function makeApp() {
  const app = express();
  // trust proxy=1 mirrors production (packages/api/src/index.ts).
  app.set("trust proxy", 1);
  app.post("/api/webhooks/flitt", flittIpAllowlist, (_req, res) => {
    res.status(200).json({ reached: true });
  });
  return app;
}

beforeEach(() => {
  delete process.env.FLITT_IP_ALLOWLIST_ENABLED;
  delete process.env.FLITT_WEBHOOK_IPS;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("flittIpAllowlist middleware", () => {
  it("passes through when FLITT_IP_ALLOWLIST_ENABLED is unset (default)", async () => {
    const res = await request(makeApp()).post("/api/webhooks/flitt").send({});
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it("passes through when FLITT_IP_ALLOWLIST_ENABLED='false'", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "false";
    const res = await request(makeApp()).post("/api/webhooks/flitt").send({});
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it("allows traffic from default Flitt IPs (X-Forwarded-For honored)", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "true";
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("X-Forwarded-For", "54.154.216.60")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it("allows second default Flitt IP", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "true";
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("X-Forwarded-For", "3.75.125.89")
      .send({});
    expect(res.body.reached).toBe(true);
  });

  it("rejects unknown IP — silently drops with 200 (no Flitt retry storm)", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "true";
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("X-Forwarded-For", "1.2.3.4")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.reached).toBeUndefined();
  });

  it("honors custom FLITT_WEBHOOK_IPS override (Flitt rotation)", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "true";
    process.env.FLITT_WEBHOOK_IPS = "9.9.9.9, 8.8.8.8";
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("X-Forwarded-For", "9.9.9.9")
      .send({});
    expect(res.body.reached).toBe(true);
  });

  it("rejects when custom allowlist is set and source not in it", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "true";
    process.env.FLITT_WEBHOOK_IPS = "9.9.9.9";
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("X-Forwarded-For", "54.154.216.60") // default IP rejected when override removes it
      .send({});
    expect(res.body.reached).toBeUndefined();
    expect(res.body.received).toBe(true);
  });

  it("falls back to defaults when FLITT_WEBHOOK_IPS is empty/whitespace", async () => {
    process.env.FLITT_IP_ALLOWLIST_ENABLED = "true";
    process.env.FLITT_WEBHOOK_IPS = "  , ,";
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("X-Forwarded-For", "54.154.216.60")
      .send({});
    expect(res.body.reached).toBe(true);
  });
});
