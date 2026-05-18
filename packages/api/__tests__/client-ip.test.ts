import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { ipKeyGenerator } from "../src/middleware/rateLimit.js";
import { getClientIp } from "../src/services/ipService.js";

// M4: the client IP must come from `req.ip` (which honors the configured
// `trust proxy` hop count), never from a raw, client-spoofable header.

describe("ipKeyGenerator (rate-limit key)", () => {
  it("uses req.ip and ignores a spoofed x-forwarded-for header", () => {
    const req = {
      ip: "203.0.113.7",
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    };
    expect(ipKeyGenerator(req)).toBe("203.0.113.7");
  });

  it("falls back to 'unknown' when req.ip is absent", () => {
    expect(ipKeyGenerator({ headers: {} })).toBe("unknown");
  });
});

describe("getClientIp", () => {
  it("uses req.ip and ignores spoofable x-forwarded-for / x-real-ip", () => {
    const req = {
      ip: "203.0.113.9",
      headers: { "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" },
    } as unknown as Request;
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to 'unknown' when req.ip is absent", () => {
    expect(getClientIp({ headers: {} } as unknown as Request)).toBe("unknown");
  });
});
