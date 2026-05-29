import { describe, it, expect, beforeEach } from "vitest";
import {
  pendingCDPImports,
  setPendingImport,
  MAX_PENDING_IMPORTS,
  MAX_PENDING_IMPORTS_PER_USER,
} from "../src/state.js";

// ============================================================================
// L-5 — pendingCDPImports LRU caps
// ============================================================================

beforeEach(() => {
  pendingCDPImports.clear();
});

function entry(figmaUserId: string | undefined, ts: number) {
  return {
    data: {},
    timestamp: ts,
    expires: ts + 10 * 60 * 1000,
    figmaUserId,
  };
}

describe("setPendingImport — per-user cap (L-5)", () => {
  it("evicts the oldest entry for the same user when the cap is reached", () => {
    const user = "u-1";
    // Insert MAX_PER_USER entries with monotonically increasing timestamps.
    for (let i = 0; i < MAX_PENDING_IMPORTS_PER_USER; i += 1) {
      setPendingImport(`u1-${i}`, entry(user, 1_000_000 + i));
    }
    expect(pendingCDPImports.size).toBe(MAX_PENDING_IMPORTS_PER_USER);
    expect(pendingCDPImports.has("u1-0")).toBe(true);

    // One more for the same user — oldest (`u1-0`) must be evicted.
    setPendingImport(`u1-overflow`, entry(user, 2_000_000));
    expect(pendingCDPImports.has("u1-0")).toBe(false);
    expect(pendingCDPImports.has("u1-overflow")).toBe(true);
    expect(pendingCDPImports.size).toBe(MAX_PENDING_IMPORTS_PER_USER);
  });

  it("does not evict entries belonging to a DIFFERENT user", () => {
    // Fill user A to cap.
    for (let i = 0; i < MAX_PENDING_IMPORTS_PER_USER; i += 1) {
      setPendingImport(`a-${i}`, entry("user-A", 1_000_000 + i));
    }
    // User B inserts — must not touch user A's entries.
    setPendingImport("b-1", entry("user-B", 5_000_000));
    for (let i = 0; i < MAX_PENDING_IMPORTS_PER_USER; i += 1) {
      expect(pendingCDPImports.has(`a-${i}`)).toBe(true);
    }
    expect(pendingCDPImports.has("b-1")).toBe(true);
  });
});

describe("setPendingImport — global cap (L-5)", () => {
  it("evicts the globally oldest entry when MAX_PENDING_IMPORTS is exceeded", () => {
    // Fill with monotonically increasing timestamps across many users.
    // (1000 entries — bounded test, runs in milliseconds.)
    for (let i = 0; i < MAX_PENDING_IMPORTS; i += 1) {
      setPendingImport(`g-${i}`, entry(`u-${i}`, 1_000_000 + i));
    }
    expect(pendingCDPImports.size).toBe(MAX_PENDING_IMPORTS);
    expect(pendingCDPImports.has("g-0")).toBe(true);

    // One overflow — globally oldest (`g-0`) must go.
    setPendingImport("overflow", entry("u-new", 9_999_999));
    expect(pendingCDPImports.has("g-0")).toBe(false);
    expect(pendingCDPImports.has("overflow")).toBe(true);
    expect(pendingCDPImports.size).toBe(MAX_PENDING_IMPORTS);
  });
});

describe("setPendingImport — no figmaUserId (legacy path)", () => {
  it("still subject to the global cap even without figmaUserId", () => {
    // Add MAX_PENDING_IMPORTS entries with no user binding.
    for (let i = 0; i < MAX_PENDING_IMPORTS; i += 1) {
      setPendingImport(`a-${i}`, entry(undefined, 1_000_000 + i));
    }
    setPendingImport("overflow", entry(undefined, 9_999_999));
    expect(pendingCDPImports.has("a-0")).toBe(false);
    expect(pendingCDPImports.size).toBe(MAX_PENDING_IMPORTS);
  });
});
