/**
 * Oversized-asset downscale: images above the 2MB per-image budget used to
 * be dropped outright (gray placeholder in Figma). They are now downscaled
 * to fit. The canvas work itself needs a browser; the convergence math is
 * pure and tested here.
 */
import { describe, it, expect } from "vitest";
import { nextDownscaleScale } from "./assets";

const TARGET = 2 * 1024 * 1024;

describe("nextDownscaleScale", () => {
  it("keeps the scale when already under target", () => {
    expect(nextDownscaleScale(1, TARGET - 1, TARGET)).toBe(1);
  });

  it("shrinks proportionally to the byte overshoot", () => {
    const next = nextDownscaleScale(1, TARGET * 4, TARGET);
    // sqrt(0.85/4) ≈ 0.46 — roughly halves the linear dimensions.
    expect(next).toBeLessThan(0.5);
    expect(next).toBeGreaterThan(0.4);
  });

  it("always makes real progress even on tiny overshoots", () => {
    const next = nextDownscaleScale(1, TARGET + 1, TARGET);
    expect(next).toBeLessThanOrEqual(0.9);
  });

  it("converges below target within a few iterations", () => {
    // Simulate bytes ∝ scale² from a 40MB original.
    let scale = 1;
    let bytes = 40 * 1024 * 1024;
    const original = bytes;
    for (let i = 0; i < 4 && bytes > TARGET; i++) {
      scale = nextDownscaleScale(scale, bytes, TARGET);
      bytes = original * scale * scale;
    }
    expect(bytes).toBeLessThanOrEqual(TARGET);
  });
});
