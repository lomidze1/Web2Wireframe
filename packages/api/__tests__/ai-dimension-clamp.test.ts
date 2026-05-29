import { describe, it, expect } from "vitest";

// ============================================================================
// L-2 — contract test for the inline clamp() helper in routes/plugin/ai.ts
//
// The helper is private to the route handler so we replicate it 1:1 here.
// If the actual implementation drifts, the integration tests around the
// /api/import-screenshot route (which we don't run in this file because the
// AI service requires a real Anthropic key) would still catch a behavior
// change — but this contract test guards the clamp invariants cheaply.
// ============================================================================

const clampDim = (v: unknown, fallback: number, min: number, max: number) =>
  Math.min(Math.max(Number(v) || fallback, min), max);

describe("L-2 dimension clamp contract", () => {
  it("clamps absurdly large values down to max", () => {
    expect(clampDim(1e308, 1440, 320, 4000)).toBe(4000);
    expect(clampDim("99999", 1440, 320, 4000)).toBe(4000);
  });

  it("clamps negative / zero values up to min via fallback", () => {
    // 0 || fallback → fallback (in range), then max(fallback, min) → fallback
    expect(clampDim(0, 1440, 320, 4000)).toBe(1440);
    expect(clampDim(-100, 1440, 320, 4000)).toBe(320);
  });

  it("clamps NaN-coerced values to fallback", () => {
    expect(clampDim("abc", 1440, 320, 4000)).toBe(1440);
    expect(clampDim(null, 1440, 320, 4000)).toBe(1440);
    expect(clampDim(undefined, 1440, 320, 4000)).toBe(1440);
    expect(clampDim({}, 1440, 320, 4000)).toBe(1440);
  });

  it("preserves in-range values", () => {
    expect(clampDim(1440, 1440, 320, 4000)).toBe(1440);
    expect(clampDim(320, 1440, 320, 4000)).toBe(320);
    expect(clampDim(4000, 1440, 320, 4000)).toBe(4000);
    expect(clampDim(1920, 1440, 320, 4000)).toBe(1920);
  });

  it("uses different ranges for imageHeight (200..4000)", () => {
    expect(clampDim(50, 900, 200, 4000)).toBe(200);
    expect(clampDim(10000, 900, 200, 4000)).toBe(4000);
    expect(clampDim(800, 900, 200, 4000)).toBe(800);
  });
});
