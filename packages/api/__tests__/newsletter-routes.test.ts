import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mocks BEFORE importing the route
// ============================================================================

const mockSubscribe = vi.fn();

vi.mock("../src/services/newsletterService.js", () => ({
  subscribeToNewsletter: (...args: unknown[]) => mockSubscribe(...args),
  isNewsletterConfigured: () => true,
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    server: { nodeEnv: "test" },
    rateLimit: { windowMs: 60_000, maxRequests: 100 },
    email: { resendApiKey: "re_test", noreplyEmail: "noreply@test" },
    newsletter: { audienceId: "aud_test_123" },
  },
}));

const newsletterRoutes = (await import("../src/routes/plugin/newsletter.js"))
  .default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", newsletterRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// POST /api/newsletter/subscribe — validation
// ============================================================================

describe("POST /api/newsletter/subscribe — input validation", () => {
  it("returns 400 when body is empty", async () => {
    const res = await request(makeApp()).post("/api/newsletter/subscribe").send({});
    expect(res.status).toBe(400);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ other: "value" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is empty string", async () => {
    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is malformed", async () => {
    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("returns 400 when email is not a string", async () => {
    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: 12345 });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/newsletter/subscribe — success path
// ============================================================================

describe("POST /api/newsletter/subscribe — success path", () => {
  it("returns 200 ok=true when service subscribes successfully", async () => {
    mockSubscribe.mockResolvedValue({ ok: true });

    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSubscribe).toHaveBeenCalledWith("user@example.com");
  });

  it("returns 200 (idempotent) even when contact already exists", async () => {
    // Service flattens duplicate-contact into ok=true, so the route just
    // mirrors that.
    mockSubscribe.mockResolvedValue({ ok: true });

    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: "dup@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ============================================================================
// POST /api/newsletter/subscribe — failure path
// ============================================================================

describe("POST /api/newsletter/subscribe — failure path", () => {
  it("returns 502 when Resend errors upstream", async () => {
    mockSubscribe.mockResolvedValue({ ok: false, error: "Invalid API key" });

    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: "user@example.com" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ ok: false, error: "subscription_failed" });
  });

  it("does NOT leak upstream error details to the client", async () => {
    mockSubscribe.mockResolvedValue({
      ok: false,
      error: "API_KEY=re_secret_value_leaked",
    });

    const res = await request(makeApp())
      .post("/api/newsletter/subscribe")
      .send({ email: "user@example.com" });

    expect(JSON.stringify(res.body)).not.toContain("re_secret_value_leaked");
  });
});
