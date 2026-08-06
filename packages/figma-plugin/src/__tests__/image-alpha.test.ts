/**
 * B10: WebP/AVIF → canvas conversion must export PNG when the source has
 * transparency (JPEG has no alpha channel — transparent logos flattened
 * onto black at q0.85). hasTransparentPixel drives that format choice.
 */
import { describe, it, expect } from "vitest";
import { hasTransparentPixel } from "../ui/shared/imageAlpha";

function rgba(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return data;
}

describe("hasTransparentPixel", () => {
  it("returns false for a fully opaque image", () => {
    const data = rgba(Array.from({ length: 64 }, () => [200, 100, 50, 255]));
    expect(hasTransparentPixel(data, 1)).toBe(false);
  });

  it("detects a fully transparent background (cut-out logo)", () => {
    const data = rgba(
      Array.from({ length: 64 }, (_, i) =>
        i < 16 ? [0, 0, 0, 0] : [200, 100, 50, 255]
      ) as Array<[number, number, number, number]>
    );
    expect(hasTransparentPixel(data)).toBe(true);
  });

  it("detects semi-transparency", () => {
    const data = rgba(
      Array.from({ length: 64 }, () => [10, 20, 30, 128]) as Array<
        [number, number, number, number]
      >
    );
    expect(hasTransparentPixel(data)).toBe(true);
  });

  it("handles empty data", () => {
    expect(hasTransparentPixel(new Uint8ClampedArray(0))).toBe(false);
  });
});
