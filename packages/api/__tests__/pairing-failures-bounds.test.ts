import { describe, it, expect, beforeEach } from "vitest";
import {
  pairingCodeFailures,
  recordPairingFailure,
  pruneExpiredPairingFailures,
  isPairingCodeLocked,
  PAIRING_CODE_MAX_INPUT_LENGTH,
  MAX_PAIRING_FAILURES_ENTRIES,
  PAIRING_LOCKOUT_TTL_MS,
  PAIRING_MAX_FAILURES,
} from "../src/state.js";

// ============================================================================
// P2-#8 — pairingCodeFailures Map bounded
// ============================================================================

beforeEach(() => {
  pairingCodeFailures.clear();
});

describe("recordPairingFailure — input length guard (P2-#8)", () => {
  it("rejects codes longer than PAIRING_CODE_MAX_INPUT_LENGTH without recording", () => {
    const oversized = "a".repeat(PAIRING_CODE_MAX_INPUT_LENGTH + 1);
    const locked = recordPairingFailure(oversized);
    expect(locked).toBe(false);
    expect(pairingCodeFailures.has(oversized)).toBe(false);
  });

  it("accepts codes at exactly PAIRING_CODE_MAX_INPUT_LENGTH (boundary)", () => {
    const max = "a".repeat(PAIRING_CODE_MAX_INPUT_LENGTH);
    recordPairingFailure(max);
    expect(pairingCodeFailures.has(max)).toBe(true);
  });

  it("does NOT lock out legitimate 10-char codes after one failure", () => {
    recordPairingFailure("ABCDE12345");
    expect(isPairingCodeLocked("ABCDE12345")).toBe(false);
  });

  it("locks out a code after PAIRING_MAX_FAILURES failures", () => {
    const code = "ABCDE12345";
    for (let i = 0; i < PAIRING_MAX_FAILURES; i += 1) {
      recordPairingFailure(code);
    }
    expect(isPairingCodeLocked(code)).toBe(true);
  });
});

describe("recordPairingFailure — global cap with LRU eviction (P2-#8)", () => {
  it("evicts the oldest-expiring entry when MAX_PAIRING_FAILURES_ENTRIES is exceeded", () => {
    // Fill the Map with synthetic entries (insert directly to keep the test
    // fast — 10K recordPairingFailure calls would still be milliseconds but
    // direct insertion lets us control the `expires` field precisely).
    const baseTime = Date.now();
    for (let i = 0; i < MAX_PAIRING_FAILURES_ENTRIES; i += 1) {
      pairingCodeFailures.set(`pad-${i.toString(36)}`, {
        count: 1,
        // Spread `expires` across a 1-hour window so the oldest is `pad-0`.
        expires: baseTime + 1000 + i * 100,
      });
    }
    expect(pairingCodeFailures.size).toBe(MAX_PAIRING_FAILURES_ENTRIES);
    expect(pairingCodeFailures.has("pad-0")).toBe(true);

    // One overflow insert — globally oldest (`pad-0`) must be evicted.
    recordPairingFailure("NEWCODE001");

    expect(pairingCodeFailures.has("pad-0")).toBe(false);
    expect(pairingCodeFailures.has("NEWCODE001")).toBe(true);
    expect(pairingCodeFailures.size).toBe(MAX_PAIRING_FAILURES_ENTRIES);
  });

  it("incrementing an EXISTING entry does NOT trigger eviction", () => {
    // Fill to exactly cap.
    for (let i = 0; i < MAX_PAIRING_FAILURES_ENTRIES; i += 1) {
      pairingCodeFailures.set(`pad-${i}`, {
        count: 1,
        expires: Date.now() + 1000,
      });
    }
    // Increment one of the existing entries — should NOT evict anyone.
    recordPairingFailure("pad-5");
    expect(pairingCodeFailures.has("pad-5")).toBe(true);
    expect(pairingCodeFailures.size).toBe(MAX_PAIRING_FAILURES_ENTRIES);
  });
});

describe("pruneExpiredPairingFailures (P2-#8)", () => {
  it("removes only entries whose expires has passed", () => {
    const now = Date.now();
    pairingCodeFailures.set("FRESH00001", { count: 1, expires: now + 60_000 });
    pairingCodeFailures.set("STALE00002", { count: 1, expires: now - 60_000 });
    pairingCodeFailures.set("STALE00003", { count: 2, expires: now - 1 });
    pairingCodeFailures.set("FRESH00004", { count: 1, expires: now + 1 });

    const pruned = pruneExpiredPairingFailures(now);
    expect(pruned).toBe(2);
    expect(pairingCodeFailures.has("FRESH00001")).toBe(true);
    expect(pairingCodeFailures.has("FRESH00004")).toBe(true);
    expect(pairingCodeFailures.has("STALE00002")).toBe(false);
    expect(pairingCodeFailures.has("STALE00003")).toBe(false);
  });

  it("returns 0 when nothing is expired", () => {
    pairingCodeFailures.set("CODE", {
      count: 1,
      expires: Date.now() + PAIRING_LOCKOUT_TTL_MS,
    });
    expect(pruneExpiredPairingFailures()).toBe(0);
  });
});
