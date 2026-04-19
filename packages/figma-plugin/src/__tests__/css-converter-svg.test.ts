/**
 * css-converter.ts — SVG propagation tests (TDD)
 *
 * Verifies that W2W-level $svgMarkup (fetched from <img src="*.svg">
 * or background-image url(*.svg)) is correctly propagated into the
 * WireframeNode tree so that the figma-plugin renders it as vector.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';

describe("css-converter — <img src='*.svg'> with $svgMarkup", () => {
  it("populates computedStyles.svgMarkup when $svgMarkup is present", () => {
    const img = makeFrame({
      tag: "img",
      width: 24, height: 24,
      quad: [0, 0, 24, 0, 24, 24, 0, 24],
      $url: "https://example.com/logo.svg",
      $svgMarkup: SVG_MARKUP,
    });

    const result = convertW2WToWireframe(img as never);

    expect(result.type).toBe("placeholder");
    expect(result.isPlaceholder).toBe(true);
    expect(result.computedStyles?.svgMarkup).toBe(SVG_MARKUP);
  });

  it("does NOT populate svgMarkup when $svgMarkup is absent (unchanged behavior)", () => {
    const img = makeFrame({
      tag: "img",
      width: 24, height: 24,
      quad: [0, 0, 24, 0, 24, 24, 0, 24],
      $url: "https://example.com/logo.svg",
    });

    const result = convertW2WToWireframe(img as never);

    expect(result.type).toBe("placeholder");
    expect(result.computedStyles?.svgMarkup).toBeUndefined();
    expect(result.imageUrl).toBe("https://example.com/logo.svg");
  });

  it("non-SVG <img> is unaffected (regression)", () => {
    const img = makeFrame({
      tag: "img",
      width: 200, height: 100,
      quad: [0, 0, 200, 0, 200, 100, 0, 100],
      $url: "https://example.com/photo.png",
    });

    const result = convertW2WToWireframe(img as never);

    expect(result.type).toBe("placeholder");
    expect(result.computedStyles?.svgMarkup).toBeUndefined();
  });
});

describe("css-converter — background-image: url('*.svg') with $svgMarkup", () => {
  it("injects synthetic child placeholder with svgMarkup, suppresses IMAGE_PLACEHOLDER fill", () => {
    const div = makeFrame({
      tag: "div",
      width: 64, height: 64,
      quad: [0, 0, 64, 0, 64, 64, 0, 64],
      styles: {
        backgroundImage: 'url("https://example.com/bg.svg")',
      },
      $svgMarkup: SVG_MARKUP,
    });

    const result = convertW2WToWireframe(div as never);

    const hasImagePlaceholderFill = (result.fills ?? []).some(
      (f) => f.type === "IMAGE_PLACEHOLDER"
    );
    expect(hasImagePlaceholderFill).toBe(false);

    // A synthetic child placeholder carries the svgMarkup
    expect(result.children).toHaveLength(1);
    const child = result.children[0];
    expect(child.isPlaceholder).toBe(true);
    expect(child.computedStyles?.svgMarkup).toBe(SVG_MARKUP);
  });

  it("without $svgMarkup, keeps existing IMAGE_PLACEHOLDER fill behavior", () => {
    const div = makeFrame({
      tag: "div",
      width: 64, height: 64,
      quad: [0, 0, 64, 0, 64, 64, 0, 64],
      styles: {
        backgroundImage: 'url("https://example.com/bg.svg")',
      },
    });

    const result = convertW2WToWireframe(div as never);

    const imagePlaceholderFills = (result.fills ?? []).filter(
      (f) => f.type === "IMAGE_PLACEHOLDER"
    );
    expect(imagePlaceholderFills).toHaveLength(1);
    expect(imagePlaceholderFills[0].imageUrl).toBe("https://example.com/bg.svg");
    // No synthetic child injected
    expect(result.children).toHaveLength(0);
  });
});
