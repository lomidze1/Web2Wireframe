/**
 * B1: background-position / object-position → CROP + imageTransform.
 * Pure math layer: image header size parsing, CSS position parsing, and the
 * cover-crop transform.
 */
import { describe, it, expect } from "vitest";
import {
  parseImageSize,
  parseCssPosition,
  computeCoverCropTransform,
} from "../rendering/imageCrop";

describe("parseImageSize", () => {
  it("reads PNG IHDR dimensions", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // width 800 (0x320), height 600 (0x258) at offsets 16/20
    png[18] = 0x03; png[19] = 0x20;
    png[22] = 0x02; png[23] = 0x58;
    expect(parseImageSize(png)).toEqual({ width: 800, height: 600 });
  });

  it("reads GIF logical screen size (little-endian)", () => {
    const gif = new Uint8Array(24);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    gif[6] = 0x20; gif[7] = 0x03; // 800
    gif[8] = 0x58; gif[9] = 0x02; // 600
    expect(parseImageSize(gif)).toEqual({ width: 800, height: 600 });
  });

  it("reads JPEG SOF0 dimensions", () => {
    // SOI, APP0 (16 bytes), SOF0 with height 600 / width 800
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03,
      0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(parseImageSize(jpeg)).toEqual({ width: 800, height: 600 });
  });

  it("returns null for unknown formats", () => {
    expect(parseImageSize(new Uint8Array(32))).toBeNull();
  });
});

describe("parseCssPosition", () => {
  it("parses keyword pairs", () => {
    expect(parseCssPosition("center")).toEqual({ x: 0.5, y: 0.5 });
    expect(parseCssPosition("left top")).toEqual({ x: 0, y: 0 });
    expect(parseCssPosition("right bottom")).toEqual({ x: 1, y: 1 });
    expect(parseCssPosition("center bottom")).toEqual({ x: 0.5, y: 1 });
  });

  it("parses percentages (the getComputedStyle form)", () => {
    expect(parseCssPosition("50% 30%")).toEqual({ x: 0.5, y: 0.3 });
    expect(parseCssPosition("0% 0%")).toEqual({ x: 0, y: 0 });
  });

  it("returns null for px offsets (out of scope → FILL fallback)", () => {
    expect(parseCssPosition("10px 20px")).toBeNull();
    expect(parseCssPosition("right 20px center")).toBeNull();
  });
});

describe("computeCoverCropTransform", () => {
  it("crops a wide image in a square frame, focused at center-top", () => {
    // 2000×1000 image in 500×500 frame: cover scale = 0.5, scaled 1000×500.
    // Visible width fraction = 500/1000 = 0.5; full height visible.
    const t = computeCoverCropTransform(2000, 1000, 500, 500, 0.5, 0)!;
    expect(t[0][0]).toBeCloseTo(0.5, 5); // visible width fraction
    expect(t[1][1]).toBeCloseTo(1, 5);   // full height
    expect(t[0][2]).toBeCloseTo(0.25, 5); // centered horizontally
    expect(t[1][2]).toBeCloseTo(0, 5);
  });

  it("maps position 100% to the far edge of the overflow", () => {
    const t = computeCoverCropTransform(2000, 1000, 500, 500, 1, 0.5)!;
    expect(t[0][2]).toBeCloseTo(0.5, 5); // offset = 1 - visible (0.5)
  });

  it("crops a tall image at 30% vertical focus (hero face-crop case)", () => {
    // 1000×3000 in 1000×600: scale 1, visible height = 600/3000 = 0.2.
    const t = computeCoverCropTransform(1000, 3000, 1000, 600, 0.5, 0.3)!;
    expect(t[1][1]).toBeCloseTo(0.2, 5);
    expect(t[1][2]).toBeCloseTo(0.3 * 0.8, 5); // 30% of the overflow
    expect(t[0][0]).toBeCloseTo(1, 5);
  });

  it("returns null for degenerate sizes", () => {
    expect(computeCoverCropTransform(0, 100, 50, 50, 0.5, 0.5)).toBeNull();
  });
});
