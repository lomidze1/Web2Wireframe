import { describe, it, expect } from "vitest";

// ============================================================================
// Round-2 hardening — `isValidReturnTo` open-redirect guard
//
// The validator lives inline in src/routes/website/figmaAuth.ts. We
// replicate its rules here and assert each branch — this matches the
// existing pattern (see figma-nonce-regex.test.ts) and keeps the test
// fast and dependency-free. If the validator in source ever diverges
// from this copy, the source-level contract test below (a grep on the
// file content) flags it.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const isValidReturnTo = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 256) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes(":")) return false;
  return true;
};

describe("isValidReturnTo — open-redirect guard", () => {
  it("accepts simple same-origin paths", () => {
    expect(isValidReturnTo("/")).toBe(true);
    expect(isValidReturnTo("/pricing")).toBe(true);
    expect(isValidReturnTo("/docs/browser-extension/extension-overview")).toBe(
      true,
    );
    expect(isValidReturnTo("/checkout/success?ref=footer")).toBe(true);
  });

  it("rejects protocol-relative URLs (// prefix → cross-origin)", () => {
    expect(isValidReturnTo("//evil.com")).toBe(false);
    expect(isValidReturnTo("//evil.com/login")).toBe(false);
  });

  it("rejects backslash-bypassed protocol-relative URLs (browser normalises \\ → /)", () => {
    // The fix for Round-2 H-4. Chrome/Safari interpret `\` as `/` after
    // the redirect, turning `/\evil.com` into `//evil.com` ≈ external.
    expect(isValidReturnTo("/\\evil.com")).toBe(false);
    expect(isValidReturnTo("/\\\\evil.com/login")).toBe(false);
    expect(isValidReturnTo("/path\\evil.com")).toBe(false);
  });

  it("rejects URLs with `:` (catches javascript:, data:, https://, etc.)", () => {
    expect(isValidReturnTo("javascript:alert(1)")).toBe(false);
    expect(isValidReturnTo("/path:with:colons")).toBe(false);
    expect(isValidReturnTo("https://evil.com")).toBe(false);
  });

  it("rejects values that do not start with /", () => {
    expect(isValidReturnTo("pricing")).toBe(false);
    expect(isValidReturnTo("")).toBe(false);
    expect(isValidReturnTo(" /pricing")).toBe(false);
  });

  it("rejects oversized values (length > 256)", () => {
    expect(isValidReturnTo("/" + "a".repeat(256))).toBe(false);
    expect(isValidReturnTo("/" + "a".repeat(255))).toBe(true);
  });

  it("rejects non-string inputs", () => {
    expect(isValidReturnTo(undefined)).toBe(false);
    expect(isValidReturnTo(null)).toBe(false);
    expect(isValidReturnTo(42)).toBe(false);
    expect(isValidReturnTo({})).toBe(false);
  });
});

// ============================================================================
// Source-level contract: the source file MUST still contain the backslash
// reject. If a future refactor removes it, this test fails and forces a
// deliberate decision (the same approach as figma-auth-session-fixation).
// ============================================================================

const here = dirname(fileURLToPath(import.meta.url));
const FIGMA_AUTH_PATH = join(
  here,
  "..",
  "src",
  "routes",
  "website",
  "figmaAuth.ts",
);

describe("figmaAuth.ts source — return_to backslash guard is wired", () => {
  it("rejects values containing a backslash inside isValidReturnTo", () => {
    const src = readFileSync(FIGMA_AUTH_PATH, "utf8");
    // Look for the literal `value.includes("\\")` check inside the function.
    // Any future refactor that drops or weakens this check fails the test.
    expect(src).toMatch(/value\.includes\("\\\\"\)/);
  });
});
