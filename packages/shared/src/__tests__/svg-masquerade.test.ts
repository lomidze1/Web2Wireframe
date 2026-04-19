/**
 * svg-masquerade — raster-masquerade detection (TDD)
 *
 * Some SVGs (Adobe Illustrator exports, "save as SVG" from image editors)
 * contain no real vector primitives — just a single <image> tag with a
 * base64-encoded PNG/JPEG. Passing these to figma.createNodeFromSvg
 * produces a broken vector node; better to extract the embedded raster
 * and render it as a regular image.
 */

import { describe, it, expect } from "vitest";
import {
  isRasterMasqueradeSvg,
  extractEmbeddedImageFromSvg,
} from "../svg-masquerade";

const REAL_VECTOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/><circle cx="12" cy="12" r="10"/></svg>';

const RASTER_MASQUERADE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 402 402">
  <image width="402" height="402" xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"/>
</svg>`;

const RASTER_MASQUERADE_JPEG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image xlink:href="data:image/jpeg;base64,/9j/4AAQSkZJRg"/>
</svg>`;

const MIXED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24">
  <image width="12" height="12" xlink:href="data:image/png;base64,AAA"/>
  <path d="M0 0h24v24"/>
</svg>`;

const HREF_NO_XLINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,AAA"/>
</svg>`;

describe("isRasterMasqueradeSvg", () => {
  it("detects SVG with only <image> base64 (no vector primitives)", () => {
    expect(isRasterMasqueradeSvg(RASTER_MASQUERADE_SVG)).toBe(true);
  });

  it("detects JPEG-embedded masquerade", () => {
    expect(isRasterMasqueradeSvg(RASTER_MASQUERADE_JPEG)).toBe(true);
  });

  it("detects href-attribute variant (no xlink namespace)", () => {
    expect(isRasterMasqueradeSvg(HREF_NO_XLINK_SVG)).toBe(true);
  });

  it("rejects real vector SVG", () => {
    expect(isRasterMasqueradeSvg(REAL_VECTOR_SVG)).toBe(false);
  });

  it("rejects mixed SVG (has both <image> and <path>)", () => {
    expect(isRasterMasqueradeSvg(MIXED_SVG)).toBe(false);
  });

  it("rejects empty or invalid input", () => {
    expect(isRasterMasqueradeSvg("")).toBe(false);
    expect(isRasterMasqueradeSvg(undefined)).toBe(false);
    expect(isRasterMasqueradeSvg("not svg")).toBe(false);
  });

  it("rejects SVG with external <image href> (URL, not data URI)", () => {
    const external = `<svg><image href="https://example.com/a.png"/></svg>`;
    expect(isRasterMasqueradeSvg(external)).toBe(false);
  });
});

describe("extractEmbeddedImageFromSvg", () => {
  it("extracts PNG data URI from xlink:href", () => {
    const result = extractEmbeddedImageFromSvg(RASTER_MASQUERADE_SVG);
    expect(result).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA");
  });

  it("extracts JPEG data URI", () => {
    const result = extractEmbeddedImageFromSvg(RASTER_MASQUERADE_JPEG);
    expect(result).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRg");
  });

  it("extracts href-attribute variant", () => {
    const result = extractEmbeddedImageFromSvg(HREF_NO_XLINK_SVG);
    expect(result).toBe("data:image/png;base64,AAA");
  });

  it("returns undefined when no embedded image", () => {
    expect(extractEmbeddedImageFromSvg(REAL_VECTOR_SVG)).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(extractEmbeddedImageFromSvg("")).toBeUndefined();
    expect(extractEmbeddedImageFromSvg(undefined)).toBeUndefined();
  });

  it("returns undefined for external URL (not data URI)", () => {
    const external = `<svg><image href="https://example.com/a.png"/></svg>`;
    expect(extractEmbeddedImageFromSvg(external)).toBeUndefined();
  });
});
