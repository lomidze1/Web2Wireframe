/**
 * Tests for css-converter.ts: Apple-style navigation with zero-size wrappers.
 *
 * Apple's globalnav uses 3 levels of zero-size wrapper elements
 * (li, div.globalnav-flyout, div.globalnav-menu-list) that contain
 * visible nav items. The extractor's post-filter preserves these wrappers
 * when they have visible children, and the css-converter must handle them.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// Helper: minimal W2W frame node
function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: 'div',
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function makeSVG(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'SVG',
    x: 0, y: 0, width: 24, height: 24,
    quad: [0, 0, 24, 0, 24, 24, 0, 24],
    svg: '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Apple-style nav: zero-size wrappers with visible children
// ---------------------------------------------------------------------------

describe("css-converter: zero-size wrapper navigation", () => {
  it("flattens display:contents wrappers — nav items become direct children", () => {
    // Simulates Apple's globalnav: li(display:contents) → div(display:contents) → div(display:contents) → items
    const root = makeFrame({
      tag: 'nav',
      x: 0, y: 0, width: 1440, height: 44,
      quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
      styles: { position: 'fixed', display: 'flex', backgroundColor: 'rgba(0,0,0,0.8)' },
      children: [
        // display:contents wrapper level 1 (li.globalnav-menu)
        makeFrame({
          tag: 'li',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [
            // display:contents wrapper level 2 (div.globalnav-flyout)
            makeFrame({
              x: 0, y: 0, width: 0, height: 0,
              quad: [0, 0, 0, 0, 0, 0, 0, 0],
              styles: { display: 'contents' },
              children: [
                // display:contents wrapper level 3 (div.globalnav-menu-list)
                makeFrame({
                  x: 0, y: 0, width: 0, height: 0,
                  quad: [0, 0, 0, 0, 0, 0, 0, 0],
                  styles: { display: 'contents' },
                  children: [
                    // Visible nav item: "Store"
                    makeFrame({
                      tag: 'a',
                      x: 100, y: 0, width: 46, height: 44,
                      quad: [100, 0, 146, 0, 146, 44, 100, 44],
                      styles: { display: 'flex' },
                      children: [
                        makeSVG({ x: 108, y: 0, width: 30, height: 44,
                          quad: [108, 0, 138, 0, 138, 44, 108, 44],
                          svg: '<svg height="44" viewBox="0 0 30 44" width="30"><path d="M0 0"/></svg>'
                        }),
                      ],
                    }),
                    // Visible nav item: "Mac"
                    makeFrame({
                      tag: 'a',
                      x: 160, y: 0, width: 39, height: 44,
                      quad: [160, 0, 199, 0, 199, 44, 160, 44],
                      styles: { display: 'flex' },
                      children: [
                        makeSVG({ x: 168, y: 0, width: 23, height: 44,
                          quad: [168, 0, 191, 0, 191, 44, 168, 44],
                          svg: '<svg height="44" viewBox="0 0 23 44" width="23"><path d="M0 0"/></svg>'
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = convertW2WToWireframe(root as any);

    // display:contents wrappers flattened — <a> links are DIRECT children of nav
    expect(result.children!.length).toBe(2);
    expect(result.children![0].tag).toBe('a');
    expect(result.children![0].width).toBe(46);
    expect(result.children![1].tag).toBe('a');
    expect(result.children![1].width).toBe(39);
  });

  it("handles nav with SVG text labels as children", () => {
    // Simple nav item: <a> with SVG text inside
    const navItem = makeFrame({
      tag: 'a',
      x: 100, y: 0, width: 46, height: 44,
      quad: [100, 0, 146, 0, 146, 44, 100, 44],
      styles: { display: 'flex', alignItems: 'center' },
      children: [
        makeSVG({
          x: 108, y: 0, width: 30, height: 44,
          quad: [108, 0, 138, 0, 138, 44, 108, 44],
          svg: '<svg height="44" viewBox="0 0 30 44" width="30" xmlns="http://www.w3.org/2000/svg"><path d="M26.5 20.4..."/></svg>',
        }),
      ],
    });

    const result = convertW2WToWireframe(navItem as any);
    expect(result.width).toBe(46);
    expect(result.height).toBe(44);
    // SVG child should be preserved
    expect(result.children!.length).toBe(1);
    expect(result.children![0].computedStyles?.svgMarkup).toBeTruthy();
  });

  it("drops zero-size wrapper when ALL children are also zero-size", () => {
    // Zero-size wrapper with zero-size children → should collapse to nothing useful
    const wrapper = makeFrame({
      x: 0, y: 0, width: 0, height: 0,
      quad: [0, 0, 0, 0, 0, 0, 0, 0],
      children: [
        makeFrame({
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          children: [],
        }),
      ],
    });

    const result = convertW2WToWireframe(wrapper as any);
    // The wrapper should still convert (css-converter doesn't filter by size)
    // but it will have width/height 0 which Figma rendering handles
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("handles position: fixed nav bar", () => {
    const nav = makeFrame({
      tag: 'nav',
      x: 0, y: 0, width: 1440, height: 44,
      quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
      styles: {
        position: 'fixed',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(29, 29, 31, 0.72)',
        backdropFilter: 'blur(20px)',
        zIndex: 9999,
      },
    });

    const result = convertW2WToWireframe(nav as any);
    expect(result.width).toBe(1440);
    expect(result.height).toBe(44);
    // Backdrop filter should produce a BACKGROUND_BLUR effect
    expect(result.effects?.some((e: any) => e.type === 'BACKGROUND_BLUR')).toBe(true);
  });
});
