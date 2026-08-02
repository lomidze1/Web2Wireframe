import { describe, it, expect } from "vitest";
import {
  gridFromImageData,
  compareGrids,
  heightAgreement,
  scoreOf,
  heatmapRGBA,
  type Grid,
} from "../ui/shared/visualDiff";

/** Build a grid straight from luminance values, row-major. */
function grid(cols: number, rows: number, values: number[]): Grid {
  return { cols, rows, lum: Float32Array.from(values) };
}

/** Solid-luminance RGBA buffer of w×h pixels. */
function solidRGBA(w: number, h: number, value: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = value;
    buf[i * 4 + 1] = value;
    buf[i * 4 + 2] = value;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

describe("gridFromImageData", () => {
  it("averages each block's luminance", () => {
    // 4×2 image, 2 columns → each block is 2×2 px.
    // Left block: all 0. Right block: all 200.
    const buf = new Uint8ClampedArray(4 * 2 * 4);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const v = x < 2 ? 0 : 200;
        const i = (y * 4 + x) * 4;
        buf[i] = v;
        buf[i + 1] = v;
        buf[i + 2] = v;
        buf[i + 3] = 255;
      }
    }

    const g = gridFromImageData(buf, 4, 2, 2);

    expect(g.cols).toBe(2);
    expect(g.rows).toBe(1); // 2 px tall / 2 px per block
    expect(Array.from(g.lum)).toEqual([0, 200]);
  });

  it("weights channels by perceived luminance, not a flat mean", () => {
    // Pure green is much brighter to the eye than pure blue.
    const green = new Uint8ClampedArray([0, 255, 0, 255]);
    const blue = new Uint8ClampedArray([0, 0, 255, 255]);

    const gGreen = gridFromImageData(green, 1, 1, 1).lum[0];
    const gBlue = gridFromImageData(blue, 1, 1, 1).lum[0];

    expect(gGreen).toBeGreaterThan(gBlue * 3);
  });

  it("never produces fewer than one row", () => {
    const g = gridFromImageData(solidRGBA(8, 1, 120), 8, 1, 4);
    expect(g.rows).toBe(1);
    expect(g.lum).toHaveLength(4);
  });
});

describe("compareGrids", () => {
  it("scores identical grids as a perfect match", () => {
    const a = grid(2, 2, [10, 200, 55, 90]);
    const b = grid(2, 2, [10, 200, 55, 90]);
    expect(compareGrids(a, b)).toBe(1);
  });

  it("scores black against white as no match", () => {
    const a = grid(2, 1, [0, 0]);
    const b = grid(2, 1, [255, 255]);
    expect(compareGrids(a, b)).toBeCloseTo(0, 5);
  });

  it("scores a half-step difference at ~0.5", () => {
    const a = grid(2, 1, [0, 0]);
    const b = grid(2, 1, [128, 128]);
    expect(compareGrids(a, b)).toBeCloseTo(1 - 128 / 255, 5);
  });

  it("compares only the overlapping rows when heights differ", () => {
    // Shared first row, then b continues with content a doesn't have.
    const a = grid(1, 1, [100]);
    const b = grid(1, 3, [100, 0, 255]);
    expect(compareGrids(a, b)).toBe(1);
  });

  it("returns 0 for mismatched column counts", () => {
    expect(compareGrids(grid(2, 1, [0, 0]), grid(3, 1, [0, 0, 0]))).toBe(0);
  });

  it("returns 0 for an empty grid", () => {
    expect(compareGrids(grid(2, 0, []), grid(2, 1, [0, 0]))).toBe(0);
  });
});

describe("heightAgreement", () => {
  it("is 1 for equal heights", () => {
    expect(heightAgreement(800, 800)).toBe(1);
  });

  it("halves for a doubled height", () => {
    expect(heightAgreement(800, 1600)).toBe(0.5);
    expect(heightAgreement(1600, 800)).toBe(0.5);
  });

  it("is 0 when a height is missing", () => {
    expect(heightAgreement(0, 800)).toBe(0);
  });
});

describe("scoreOf", () => {
  it("is 100 for an identical render at the same height", () => {
    const g = grid(2, 2, [10, 200, 55, 90]);
    expect(scoreOf(g, g, 900, 900)).toBe(100);
  });

  it("penalises a doubled page height even when content matches", () => {
    const g = grid(1, 1, [100]);
    expect(scoreOf(g, g, 900, 1800)).toBe(50);
  });

  it("is 0 when nothing matches", () => {
    expect(scoreOf(grid(1, 1, [0]), grid(1, 1, [255]), 900, 900)).toBe(0);
  });
});

describe("heatmapRGBA", () => {
  it("returns one RGBA pixel per compared block", () => {
    const a = grid(4, 3, new Array(12).fill(0));
    const b = grid(4, 3, new Array(12).fill(0));
    expect(heatmapRGBA(a, b)).toHaveLength(4 * 3 * 4);
  });

  it("paints matching blocks green and mismatched blocks red", () => {
    const a = grid(2, 1, [0, 0]);
    const b = grid(2, 1, [0, 255]);
    const px = heatmapRGBA(a, b);

    // Block 0 — identical → green dominates.
    expect(px[1]).toBeGreaterThan(px[0]);
    // Block 1 — opposite → red dominates.
    expect(px[4]).toBeGreaterThan(px[5]);
    // Fully opaque throughout.
    expect(px[3]).toBe(255);
    expect(px[7]).toBe(255);
  });

  it("sizes to the overlapping rows when heights differ", () => {
    const a = grid(2, 1, [0, 0]);
    const b = grid(2, 4, [0, 0, 0, 0, 0, 0, 0, 0]);
    expect(heatmapRGBA(a, b)).toHaveLength(2 * 1 * 4);
  });
});
