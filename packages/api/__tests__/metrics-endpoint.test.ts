import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Focused coverage for `GET /api/metrics`. The endpoint shares its file
 * with `/api/health` and `/api/health/flitt` (routes/plugin/defaults.ts),
 * so the assertions here pin contract specifically for the Prometheus
 * scraper integration:
 *
 *   1. Content-Type carries `version=0.0.4` — Datadog / vmagent / Grafana
 *      Agent all use this to enable the OpenMetrics parser.
 *   2. Both `X-Admin-Token` and `Authorization: Bearer` auth headers
 *      work (so monitoring tools using either convention can scrape).
 *   3. Output is real Prometheus text format (HELP/TYPE/value lines).
 *   4. Real metric increments from the four call sites surface in the
 *      response body — the wiring through `services/metrics.ts` works
 *      end-to-end, not just in unit isolation.
 */

vi.mock("../src/config/env.js", () => ({
  config: {
    flitt: {
      merchantId: "",
      secretKey: "",
      baseUrl: "https://pay.flitt.test",
    },
    features: { flittEnabled: false },
  },
}));

vi.mock("../src/state.js", () => ({
  mongoConnected: false,
  setMongoConnected: vi.fn(),
  pendingCDPImports: new Map(),
}));

vi.mock("../src/models/WebhookEvent.js", () => ({
  WebhookEvent: {
    countDocuments: vi.fn(),
    findOne: vi.fn(),
  },
}));

const { default: defaultsRouter } = await import(
  "../src/routes/plugin/defaults.js"
);
const { metrics, __resetMetricsForTests } = await import(
  "../src/services/metrics.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", defaultsRouter);
  return app;
}

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
  __resetMetricsForTests();
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

describe("GET /api/metrics — Prometheus contract", () => {
  it("returns 200 with text/plain version=0.0.4 content-type", async () => {
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-type"]).toContain("version=0.0.4");
    expect(res.headers["content-type"]).toContain("charset=utf-8");
  });

  it("body ends with a trailing newline (Prometheus parser requirement)", async () => {
    metrics.webhook("approved", "processed");
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.text.endsWith("\n")).toBe(true);
  });

  it("emits HELP, TYPE, and value lines in the canonical order", async () => {
    metrics.signatureFailure();
    const res = await request(makeApp()).get("/api/metrics");
    const lines = res.text.split("\n");
    const helpIdx = lines.findIndex((l) =>
      l.startsWith("# HELP flitt_signature_failures_total"),
    );
    const typeIdx = lines.findIndex((l) =>
      l.startsWith("# TYPE flitt_signature_failures_total"),
    );
    const valueIdx = lines.findIndex((l) =>
      l.match(/^flitt_signature_failures_total \d+$/),
    );
    expect(helpIdx).toBeGreaterThanOrEqual(0);
    expect(typeIdx).toBe(helpIdx + 1);
    expect(valueIdx).toBeGreaterThan(typeIdx);
  });
});

describe("GET /api/metrics — auth", () => {
  it("returns 401 with text/plain body when token missing in production", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toBe("Unauthorized\n");
  });

  it("accepts X-Admin-Token header", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    const res = await request(makeApp())
      .get("/api/metrics")
      .set("X-Admin-Token", "secret-admin-token-32-bytes-or-more!");
    expect(res.status).toBe(200);
  });

  it("accepts Authorization: Bearer (Datadog / Grafana Agent style)", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    const res = await request(makeApp())
      .get("/api/metrics")
      .set("Authorization", "Bearer secret-admin-token-32-bytes-or-more!");
    expect(res.status).toBe(200);
  });

  it("rejects Bearer with wrong token", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    const res = await request(makeApp())
      .get("/api/metrics")
      .set("Authorization", "Bearer wrong");
    expect(res.status).toBe(401);
  });

  it("open in dev (no ADMIN_TOKEN set)", async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/metrics — wiring through metrics service", () => {
  it("includes flitt_webhook_total when webhook() has been called", async () => {
    metrics.webhook("approved", "processed");
    metrics.webhook("approved", "processed");
    metrics.webhook("declined", "processed");
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.text).toMatch(
      /flitt_webhook_total\{order_status="approved",result="processed"\} 2/,
    );
    expect(res.text).toMatch(
      /flitt_webhook_total\{order_status="declined",result="processed"\} 1/,
    );
  });

  it("includes flitt_signature_failures_total (no labels)", async () => {
    metrics.signatureFailure();
    metrics.signatureFailure();
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.text).toMatch(/^flitt_signature_failures_total 2$/m);
  });

  it("includes flitt_checkout_creations_total with success/fail labels", async () => {
    metrics.checkoutCreate("success");
    metrics.checkoutCreate("fail");
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.text).toMatch(
      /flitt_checkout_creations_total\{result="success"\} 1/,
    );
    expect(res.text).toMatch(
      /flitt_checkout_creations_total\{result="fail"\} 1/,
    );
  });

  it("includes email_send_total with template+result labels", async () => {
    metrics.email("receipt", "ok");
    metrics.email("refund", "fail");
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.text).toMatch(/email_send_total\{result="ok",template="receipt"\} 1/);
    expect(res.text).toMatch(/email_send_total\{result="fail",template="refund"\} 1/);
  });

  it("includes license_events_total with action+result labels", async () => {
    metrics.licenseEvent("subscription_activation", "applied");
    metrics.licenseEvent("refund", "no_op");
    const res = await request(makeApp()).get("/api/metrics");
    expect(res.text).toMatch(
      /license_events_total\{action="subscription_activation",result="applied"\} 1/,
    );
    expect(res.text).toMatch(
      /license_events_total\{action="refund",result="no_op"\} 1/,
    );
  });

  it("body parses as valid Prometheus text — every value line matches the spec", async () => {
    metrics.webhook("approved", "processed");
    metrics.signatureFailure();
    metrics.email("receipt", "ok");
    const res = await request(makeApp()).get("/api/metrics");
    // Strip HELP, TYPE, and blank lines; every remaining line must be
    // "<metric_name> <value>" or "<metric_name>{labels} <value>".
    const valueLines = res.text
      .split("\n")
      .filter((l) => l && !l.startsWith("#"));
    for (const line of valueLines) {
      expect(line).toMatch(/^[a-z_][a-z0-9_]*(\{[^}]*\})? -?\d+(\.\d+)?$/i);
    }
  });
});
