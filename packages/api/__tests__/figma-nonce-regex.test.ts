import { describe, it, expect } from "vitest";
import { isValidPluginNonce } from "../src/routes/website/figmaAuth.js";

// ============================================================================
// M-1 — Plugin nonce regex floor is 32 chars (raised from 16)
//
// We import the production function directly (P2-#10) so that any change to
// the regex in figmaAuth.ts is caught here. Plugin + Extension both generate
// 64-char hex nonces from `crypto.getRandomValues(32 bytes)`.
// ============================================================================

describe("plugin nonce regex (M-1)", () => {
  it("accepts a 64-char hex nonce (plugin/extension default)", () => {
    const hex = "a".repeat(64);
    expect(isValidPluginNonce(hex)).toBe(true);
  });

  it("accepts a 32-char alphanumeric+base64url string (lower bound)", () => {
    expect(isValidPluginNonce("aZ_-".repeat(8))).toBe(true);
  });

  it("rejects a 31-char nonce (just below new floor)", () => {
    expect(isValidPluginNonce("a".repeat(31))).toBe(false);
  });

  it("rejects a 16-char nonce (old floor — now blocked)", () => {
    expect(isValidPluginNonce("a".repeat(16))).toBe(false);
  });

  it("accepts a 128-char nonce (upper bound)", () => {
    expect(isValidPluginNonce("a".repeat(128))).toBe(true);
  });

  it("rejects a 129-char nonce (above upper bound)", () => {
    expect(isValidPluginNonce("a".repeat(129))).toBe(false);
  });

  it("rejects nonces with disallowed characters", () => {
    expect(isValidPluginNonce("a".repeat(31) + "!")).toBe(false);
    expect(isValidPluginNonce("a".repeat(31) + ".")).toBe(false);
    expect(isValidPluginNonce("a".repeat(31) + " ")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidPluginNonce(undefined)).toBe(false);
    expect(isValidPluginNonce(null)).toBe(false);
    expect(isValidPluginNonce(123)).toBe(false);
    expect(isValidPluginNonce({ $ne: null })).toBe(false);
    expect(isValidPluginNonce(["a".repeat(64)])).toBe(false);
  });
});
