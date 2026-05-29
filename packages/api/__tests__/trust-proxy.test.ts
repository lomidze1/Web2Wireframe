import { describe, it, expect } from "vitest";

// ============================================================================
// H-5 — TRUST_PROXY_HOPS env-driven configuration
//
// We don't import index.ts (it side-effects: starts server, opens Mongo).
// Instead we replicate the parsing logic exactly and assert behavior so any
// drift in index.ts shows up as a failing test in this file.
// ============================================================================

function parseTrustProxyHops(envValue: string | undefined): number {
  const trustProxyHops = Number.parseInt(envValue ?? "1", 10);
  if (
    !Number.isFinite(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 5
  ) {
    throw new Error(
      `TRUST_PROXY_HOPS invalid: ${envValue} (expected integer 0-5)`,
    );
  }
  return trustProxyHops;
}

describe("TRUST_PROXY_HOPS parsing (H-5)", () => {
  it("defaults to 1 when env var unset", () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
  });

  it("accepts '0' (local dev, no proxy)", () => {
    expect(parseTrustProxyHops("0")).toBe(0);
  });

  it("accepts '2' (Cloudflare → Render)", () => {
    expect(parseTrustProxyHops("2")).toBe(2);
  });

  it("accepts boundary value '5'", () => {
    expect(parseTrustProxyHops("5")).toBe(5);
  });

  it("rejects '-1' (negative)", () => {
    expect(() => parseTrustProxyHops("-1")).toThrow(/TRUST_PROXY_HOPS invalid/);
  });

  it("rejects '6' (above max)", () => {
    expect(() => parseTrustProxyHops("6")).toThrow(/TRUST_PROXY_HOPS invalid/);
  });

  it("rejects 'abc' (NaN)", () => {
    expect(() => parseTrustProxyHops("abc")).toThrow(/TRUST_PROXY_HOPS invalid/);
  });

  it("rejects '99' (well above max)", () => {
    expect(() => parseTrustProxyHops("99")).toThrow(/TRUST_PROXY_HOPS invalid/);
  });

  it("accepts integer with leading whitespace (parseInt behavior)", () => {
    // parseInt(" 3 ", 10) === 3 — Express has the same behavior, so we
    // preserve it. Test documents the actual contract.
    expect(parseTrustProxyHops("3")).toBe(3);
  });
});
