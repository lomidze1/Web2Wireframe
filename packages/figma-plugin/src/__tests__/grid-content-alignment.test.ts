/**
 * Tests for CSS Grid justify-content/align-content simulation via padding.
 *
 * Figma Grid has no native justify-content/align-content support.
 * We calculate excess space from FIXED tracks and distribute it as padding
 * (for center/end) or adjusted gaps (for space-between/around/evenly).
 */
import { describe, it, expect } from "vitest";
import { distributeExcess } from "../rendering/nodes";

// ---------------------------------------------------------------------------
// distributeExcess — core alignment distribution logic
// ---------------------------------------------------------------------------

describe("distributeExcess", () => {
  it("center: distributes excess equally to both sides", () => {
    let result = { addL: 0, addR: 0, newGap: undefined as number | undefined };
    distributeExcess("center", 60, 2, 10, (l, r, g) => {
      result = { addL: l, addR: r, newGap: g };
    });
    expect(result.addL).toBe(30);
    expect(result.addR).toBe(30);
    expect(result.newGap).toBeUndefined();
  });

  it("end: all excess goes to left padding", () => {
    let result = { addL: 0, addR: 0 };
    distributeExcess("end", 60, 2, 10, (l, r) => {
      result = { addL: l, addR: r };
    });
    expect(result.addL).toBe(60);
    expect(result.addR).toBe(0);
  });

  it("flex-end: same as end", () => {
    let result = { addL: 0, addR: 0 };
    distributeExcess("flex-end", 60, 2, 10, (l, r) => {
      result = { addL: l, addR: r };
    });
    expect(result.addL).toBe(60);
    expect(result.addR).toBe(0);
  });

  it("space-between: excess distributed as extra gap between tracks", () => {
    let result = { addL: 0, addR: 0, newGap: undefined as number | undefined };
    distributeExcess("space-between", 60, 3, 10, (l, r, g) => {
      result = { addL: l, addR: r, newGap: g };
    });
    // 60 / (3-1) = 30 extra per gap → newGap = 10 + 30 = 40
    expect(result.addL).toBe(0);
    expect(result.addR).toBe(0);
    expect(result.newGap).toBe(40);
  });

  it("space-around: padding at edges + extra gap", () => {
    let result = { addL: 0, addR: 0, newGap: undefined as number | undefined };
    distributeExcess("space-around", 60, 3, 10, (l, r, g) => {
      result = { addL: l, addR: r, newGap: g };
    });
    // perTrack = 60/3 = 20 → edges = 10 each, gap = 10 + 20 = 30
    expect(result.addL).toBe(10);
    expect(result.addR).toBe(10);
    expect(result.newGap).toBe(30);
  });

  it("space-evenly: equal space everywhere including edges", () => {
    let result = { addL: 0, addR: 0, newGap: undefined as number | undefined };
    distributeExcess("space-evenly", 60, 3, 10, (l, r, g) => {
      result = { addL: l, addR: r, newGap: g };
    });
    // perSlot = 60/(3+1) = 15 → edges = 15, gap = 10 + 15 = 25
    expect(result.addL).toBe(15);
    expect(result.addR).toBe(15);
    expect(result.newGap).toBe(25);
  });

  it("start: apply callback not called (no change)", () => {
    let called = false;
    distributeExcess("start", 60, 2, 10, () => { called = true; });
    expect(called).toBe(false);
  });

  it("normal: apply callback not called", () => {
    let called = false;
    distributeExcess("normal", 60, 2, 10, () => { called = true; });
    expect(called).toBe(false);
  });

  it("single track + space-between: no gap change (n-1=0)", () => {
    let called = false;
    distributeExcess("space-between", 60, 1, 10, () => { called = true; });
    expect(called).toBe(false);
  });

  it("apple.com tile-ctas: center with real values", () => {
    // Container=348, tracks=131+141=272, gap=17, content=272+17=289
    // excess = 348 - 289 = 59
    let result = { addL: 0, addR: 0 };
    distributeExcess("center", 59, 2, 17, (l, r) => {
      result = { addL: l, addR: r };
    });
    expect(result.addL).toBeCloseTo(29.5, 1);
    expect(result.addR).toBeCloseTo(29.5, 1);
  });
});
