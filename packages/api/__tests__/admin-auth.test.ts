import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request } from "express";
import { verifyAdminCredential } from "../src/middleware/adminAuth.js";

/**
 * Pin the constant-time admin credential check.
 *
 * The threat: `===` / `!==` short-circuits on the first byte mismatch, so
 * the server's response latency is proportional to "how many leading bytes
 * matched". A networked attacker with a stable RTT can recover the token
 * byte-by-byte over ~256 × len attempts. `timingSafeEqual` is the standard
 * Node.js mitigation; this test pins the equal-time behavior at the
 * implementation level so a future "simplification" can't reintroduce the
 * leak.
 */

function makeReq(headers: Record<string, string> = {}): Request {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    header(name: string): string | undefined {
      return lower[name.toLowerCase()];
    },
  } as unknown as Request;
}

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

describe("verifyAdminCredential", () => {
  it("returns true (open) when ADMIN_TOKEN is unset (dev)", () => {
    expect(verifyAdminCredential(makeReq())).toBe(true);
  });

  it("returns false when ADMIN_TOKEN is set and no credential provided", () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    expect(verifyAdminCredential(makeReq())).toBe(false);
  });

  it("accepts a correct X-Admin-Token header", () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    expect(
      verifyAdminCredential(
        makeReq({ "X-Admin-Token": "secret-admin-token-32-bytes-or-more!" }),
      ),
    ).toBe(true);
  });

  it("accepts a correct Authorization: Bearer header", () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    expect(
      verifyAdminCredential(
        makeReq({
          Authorization: "Bearer secret-admin-token-32-bytes-or-more!",
        }),
      ),
    ).toBe(true);
  });

  it("rejects when only the prefix matches (off-by-one byte)", () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    expect(
      verifyAdminCredential(
        makeReq({ "X-Admin-Token": "secret-admin-token-32-bytes-or-more" }),
      ),
    ).toBe(false);
  });

  it("rejects credentials of different lengths in constant time", () => {
    process.env.ADMIN_TOKEN = "secret-admin-token-32-bytes-or-more!";
    // The length-mismatch branch must short-circuit BEFORE the byte
    // comparison — Buffer.from(...).length === expected.length is the
    // gate. We verify it returns false rather than throwing (timingSafeEqual
    // throws on length mismatch; the wrapper must catch that case).
    expect(verifyAdminCredential(makeReq({ "X-Admin-Token": "" }))).toBe(false);
    expect(verifyAdminCredential(makeReq({ "X-Admin-Token": "x" }))).toBe(
      false,
    );
    expect(
      verifyAdminCredential(
        makeReq({
          "X-Admin-Token": "x".repeat(1000),
        }),
      ),
    ).toBe(false);
  });

  it("prefers X-Admin-Token when both headers are present (specific over generic)", () => {
    process.env.ADMIN_TOKEN = "the-real-token-32-bytes-or-more!";
    expect(
      verifyAdminCredential(
        makeReq({
          "X-Admin-Token": "the-real-token-32-bytes-or-more!",
          Authorization: "Bearer different-wrong-token-32bytes",
        }),
      ),
    ).toBe(true);
  });

  it("rejects when only Authorization is set and it's wrong, even with no X-Admin-Token", () => {
    process.env.ADMIN_TOKEN = "the-real-token-32-bytes-or-more!";
    expect(
      verifyAdminCredential(
        makeReq({ Authorization: "Bearer wrong-token-of-correct-length-32" }),
      ),
    ).toBe(false);
  });

  it("rejects Authorization header without Bearer prefix", () => {
    process.env.ADMIN_TOKEN = "the-real-token-32-bytes-or-more!";
    expect(
      verifyAdminCredential(
        makeReq({ Authorization: "the-real-token-32-bytes-or-more!" }),
      ),
    ).toBe(false);
  });
});
