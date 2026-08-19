/**
 * Background-image SVG whose markup was NOT inlined (2026-08-08 audit #4 —
 * iwm.org.uk gray "Image Icon" boxes, third route).
 *
 * Routes for an SVG icon:
 *   1. `<img src=*.svg>` → placeholder with imageUrl → createRealImage
 *      handles SVG data URIs → vector ✓
 *   2. background-image SVG with INLINED markup ($svgMarkup) → synthetic
 *      child carrying computedStyles.svgMarkup → vector ✓ (fixed 08-05/06)
 *   3. background-image SVG with NO inlined markup but bytes in the assets
 *      map → fills.ts deliberately refuses SVG data URIs (createImage would
 *      throw) → the fill fell back to a flat surface color → GRAY BOX. ✗
 *
 * Route 3 now promotes the same synthetic child as route 2, but carrying
 * imageUrl — the placeholder render branch resolves it via the assets map
 * (which the extension's per-viewport harvest now actually fills).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { W2WFrameNode } from "@w2w/shared";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 48, height: 48,
    quad: [0, 0, 48, 0, 48, 48, 0, 48],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function convert(host: Record<string, unknown>): Record<string, unknown> {
  const root = makeFrame({ tag: 'body', width: 800, height: 200, children: [host] });
  const tree = convertW2WToWireframe(root as unknown as W2WFrameNode) as unknown as Record<string, unknown>;
  return (tree.children as Array<Record<string, unknown>>)[0];
}

const SVG_URL = 'https://x.test/icons/logo.svg';

describe("background SVG without inlined markup → imageUrl child promotion", () => {
  it("promotes a placeholder child carrying imageUrl and strips the SVG fill", () => {
    const node = convert(makeFrame({
      classList: ['teaser__logo'],
      styles: {
        display: 'block',
        backgroundImage: `url(${SVG_URL})`,
        backgroundRepeat: 'no-repeat',
      },
    }));
    const kids = node.children as Array<Record<string, unknown>>;
    const svgChild = kids.find(k => k.tag === 'svg');
    expect(svgChild).toBeDefined();
    expect(svgChild!.imageUrl).toBe(SVG_URL);
    expect(svgChild!.type).toBe('placeholder');
    // The refused-by-fills SVG layer must not linger as a fill.
    const fills = (node.fills as Array<Record<string, unknown>>) ?? [];
    expect(fills.some(f => typeof f.imageUrl === 'string' && (f.imageUrl as string).endsWith('.svg'))).toBe(false);
  });

  it("inlined markup still wins over the imageUrl route", () => {
    const node = convert(makeFrame({
      $svgMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
      styles: {
        display: 'block',
        backgroundImage: `url(${SVG_URL})`,
        backgroundRepeat: 'no-repeat',
      },
    }));
    const kids = node.children as Array<Record<string, unknown>>;
    const svgChild = kids.find(k => k.tag === 'svg');
    expect(svgChild).toBeDefined();
    const cs = svgChild!.computedStyles as Record<string, string>;
    expect(cs.svgMarkup).toContain('<svg');
  });

  it("raster background images are untouched", () => {
    const node = convert(makeFrame({
      styles: {
        display: 'block',
        backgroundImage: 'url(https://x.test/photo.jpg)',
      },
    }));
    const kids = (node.children as Array<Record<string, unknown>>) ?? [];
    expect(kids.find(k => k.tag === 'svg')).toBeUndefined();
    const fills = (node.fills as Array<Record<string, unknown>>) ?? [];
    expect(fills.some(f => f.imageUrl === 'https://x.test/photo.jpg')).toBe(true);
  });
});
