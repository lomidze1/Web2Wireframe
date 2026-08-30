/**
 * Defect 1 (h2d parity): CSS background-size / background-repeat /
 * background-position → painted-size paint layout.
 *
 * Port of h2d's pipeline (`qL` app.js:66322, `LL` app.js:66562):
 *   1. compute the PAINTED image size from background-size
 *   2. decide TILE vs CROP from background-repeat + painted size
 *   3. for CROP, resolve background-position against the overflow per axis
 *
 * Previously `background-size: auto` fell through to FILL (a 24px icon
 * stretched over a 300px card), `contain` → FIT ignored background-position,
 * and repeat-x/repeat-y tiled BOTH axes.
 */
import { describe, it, expect } from "vitest";
import { computeBackgroundLayout } from "../rendering/imageCrop";

describe("computeBackgroundLayout — painted size", () => {
  it("auto (absent size) keeps the natural size: 24px icon in a 300x200 card → CROP, not stretch", () => {
    const layout = computeBackgroundLayout(24, 24, 300, 200, undefined, "no-repeat", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    // Visible window = box / painted (natural) size — fractions > 1 mean the
    // image is smaller than the box and must NOT be stretched.
    expect(layout!.transform[0][0]).toBeCloseTo(300 / 24, 5);
    expect(layout!.transform[1][1]).toBeCloseTo(200 / 24, 5);
    // Default position 0% 0% → top-left anchor.
    expect(layout!.transform[0][2]).toBeCloseTo(0, 5);
    expect(layout!.transform[1][2]).toBeCloseTo(0, 5);
  });

  it("contain honors background-position (right center)", () => {
    // nat 400x400 in box 800x400 → contain scale = 1 → painted 400x400.
    const layout = computeBackgroundLayout(400, 400, 800, 400, "contain", "no-repeat", "100% 50%");
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][0]).toBeCloseTo(2, 5); // visW = 800/400
    expect(layout!.transform[1][1]).toBeCloseTo(1, 5);
    // x: p=1 → t = 1·(1 − 2) = −1 (image flush right); y: no overflow → 0.
    expect(layout!.transform[0][2]).toBeCloseTo(-1, 5);
    expect(layout!.transform[1][2]).toBeCloseTo(0, 5);
  });

  it("cover with a focus point matches the CSS % interpolation over the overflow", () => {
    // nat 1000x500 in box 500x500 → cover scale = 1 → painted 1000x500.
    const layout = computeBackgroundLayout(1000, 500, 500, 500, "cover", "no-repeat", "50% 30%");
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][0]).toBeCloseTo(0.5, 5);
    expect(layout!.transform[1][1]).toBeCloseTo(1, 5);
    expect(layout!.transform[0][2]).toBeCloseTo(0.25, 5); // 0.5 · (1 − 0.5)
    expect(layout!.transform[1][2]).toBeCloseTo(0, 5);
  });

  it("explicit two-value size is used verbatim (real non-uniform stretch preserved)", () => {
    // 50x50 texture painted at 50x20 in a 300x200 box, repeat → NOT
    // proportional → CROP (TILE would re-proportion it).
    const layout = computeBackgroundLayout(50, 50, 300, 200, "50px 20px", "repeat", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][0]).toBeCloseTo(300 / 50, 5);
    expect(layout!.transform[1][1]).toBeCloseTo(200 / 20, 5);
  });

  it("one auto derives the other axis proportionally", () => {
    // nat 300x150, size "150px auto" → painted 150x75 in a 150x75 box → identity crop.
    const layout = computeBackgroundLayout(300, 150, 150, 75, "150px auto", "no-repeat", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][0]).toBeCloseTo(1, 5);
    expect(layout!.transform[1][1]).toBeCloseTo(1, 5);
  });

  it("percentage sizes resolve against the box", () => {
    // box 400x200, size "50% 50%" → painted 200x100.
    const layout = computeBackgroundLayout(1000, 1000, 400, 200, "50% 50%", "no-repeat", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][0]).toBeCloseTo(2, 5); // 400/200
    expect(layout!.transform[1][1]).toBeCloseTo(2, 5); // 200/100
  });

  it("scale-down clamps the contain scale to 1", () => {
    // nat 50x50 in a 100x100 box: contain would scale ×2; scale-down keeps 50x50.
    const layout = computeBackgroundLayout(50, 50, 100, 100, "scale-down", "no-repeat", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][0]).toBeCloseTo(2, 5); // box 100 / painted 50
  });
});

describe("computeBackgroundLayout — TILE vs CROP", () => {
  it("repeat tiles only a proportional pattern smaller than the box", () => {
    const layout = computeBackgroundLayout(50, 50, 300, 200, "25px 25px", "repeat", undefined);
    expect(layout).toEqual({ mode: "TILE", scalingFactor: 0.5 });
  });

  it("repeat with the image covering the whole box crops instead of tiling", () => {
    // Natural 1200x800 hero in a 600x400 box, default repeat: no repetition
    // ever happens, so CROP keeps the browser's top-left window.
    const layout = computeBackgroundLayout(1200, 800, 600, 400, undefined, "repeat", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
  });

  it("repeat-x tiles only when the tile height already equals the box height", () => {
    const hairline = computeBackgroundLayout(10, 4, 300, 4, undefined, "repeat-x", undefined);
    expect(hairline).toEqual({ mode: "TILE", scalingFactor: 1 });
  });

  it("repeat-x with tile height ≠ box height crops (Figma TILE would repeat down too)", () => {
    const layout = computeBackgroundLayout(10, 4, 300, 50, undefined, "repeat-x", undefined);
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
  });

  it("repeat-y mirrors repeat-x", () => {
    const vertical = computeBackgroundLayout(4, 10, 4, 300, undefined, "repeat-y", undefined);
    expect(vertical).toEqual({ mode: "TILE", scalingFactor: 1 });
    const mismatched = computeBackgroundLayout(4, 10, 50, 300, undefined, "repeat-y", undefined);
    expect(mismatched).not.toBeNull();
    expect(mismatched!.mode).toBe("CROP");
  });
});

describe("computeBackgroundLayout — position units", () => {
  it("px offsets shift the window by −offset/painted", () => {
    const layout = computeBackgroundLayout(24, 24, 300, 200, undefined, "no-repeat", "20px 30px");
    expect(layout).not.toBeNull();
    expect(layout!.mode).toBe("CROP");
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][2]).toBeCloseTo(-20 / 24, 5);
    expect(layout!.transform[1][2]).toBeCloseTo(-30 / 24, 5);
  });

  it("keyword positions map to the edges", () => {
    const layout = computeBackgroundLayout(400, 400, 800, 400, "contain", "no-repeat", "right bottom");
    expect(layout).not.toBeNull();
    if (layout!.mode !== "CROP") return;
    expect(layout!.transform[0][2]).toBeCloseTo(-1, 5); // 1·(1 − 2)
    expect(layout!.transform[1][2]).toBeCloseTo(0, 5);
  });
});

describe("computeBackgroundLayout — fallback", () => {
  it("returns null for degenerate sizes", () => {
    expect(computeBackgroundLayout(0, 0, 300, 200, "cover", "no-repeat", undefined)).toBeNull();
    expect(computeBackgroundLayout(24, 24, 0, 0, "cover", "no-repeat", undefined)).toBeNull();
  });

  it("returns null for un-resolvable size expressions", () => {
    expect(
      computeBackgroundLayout(24, 24, 300, 200, "calc(100% - 10px)", "no-repeat", undefined),
    ).toBeNull();
  });

  it("returns null for un-resolvable position expressions", () => {
    expect(
      computeBackgroundLayout(24, 24, 300, 200, undefined, "no-repeat", "calc(50% - 5px) center"),
    ).toBeNull();
  });
});
