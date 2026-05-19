import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler, AppError } from "../src/middleware/errorHandler.js";

function makeApp(err: Error) {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("errorHandler", () => {
  it("hides 5xx error messages in production", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(
      makeApp(new AppError("DB connection string leaked", 500)),
    ).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.error).not.toContain("leaked");
    expect(res.body.stack).toBeUndefined();
  });

  it("preserves 4xx messages in production (operational, safe)", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(
      makeApp(new AppError("Email is required", 400)),
    ).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email is required");
  });

  it("exposes the real message and stack in development", async () => {
    process.env.NODE_ENV = "development";
    const res = await request(
      makeApp(new AppError("DB connection refused", 500)),
    ).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB connection refused");
    expect(res.body.stack).toBeDefined();
  });
});
