/**
 * CSS color filters applied to raster pixels.
 *
 * notion.com's testimonial section paints black PNG customer logos white with
 * `filter: brightness(0) invert(1)` over portraits filtered with
 * `brightness(1.4) saturate(0.25)`. Figma can't filter an image paint, so the
 * UI iframe recolours the pixels with the same math the paints use.
 */
import { describe, it, expect } from "vitest";
import { applyColorFilter, applyColorFilterToPixels, parseColorFilter } from "../rendering/cssFilter";

describe("applyColorFilterToPixels", () => {
  it("turns an opaque black logo white and keeps transparent pixels transparent", () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 10, 20, 30, 0]);
    applyColorFilterToPixels(px, parseColorFilter("brightness(0) invert(1)"));
    expect(Array.from(px.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(px[7]).toBe(0);
  });

  it("matches the paint math pixel by pixel", () => {
    const ops = parseColorFilter("brightness(1.4) saturate(0.25)");
    const px = new Uint8ClampedArray([200, 100, 50, 255]);
    applyColorFilterToPixels(px, ops);
    const expected = applyColorFilter({ r: 200 / 255, g: 100 / 255, b: 50 / 255, a: 1 }, ops);
    expect(px[0]).toBe(Math.round(expected.r * 255));
    expect(px[1]).toBe(Math.round(expected.g * 255));
    expect(px[2]).toBe(Math.round(expected.b * 255));
    expect(px[3]).toBe(255);
  });

  it("ignores opacity() — the layer's own opacity carries it", () => {
    const px = new Uint8ClampedArray([40, 40, 40, 200]);
    applyColorFilterToPixels(px, parseColorFilter("opacity(0.5)"));
    expect(Array.from(px)).toEqual([40, 40, 40, 200]);
  });
});
