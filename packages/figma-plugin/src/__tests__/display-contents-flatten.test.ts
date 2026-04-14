/**
 * display:contents flattening tests.
 *
 * CSS display:contents means the element generates no box — its children
 * become direct children of the parent (like the element doesn't exist in layout).
 *
 * Apple.com uses 3 nested display:contents wrappers in its globalnav:
 *   li.globalnav-menu → div.globalnav-flyout → div.globalnav-menu-list
 * All three should be recursively flattened so the 11 nav items become
 * direct children of ul#globalnav-list (14 total with logo, search, bag).
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';

// ---------------------------------------------------------------------------
// Helpers (same pattern as css-converter-nav.test.ts)
// ---------------------------------------------------------------------------

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

function makeText(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 50, height: 16,
    quad: [0, 0, 50, 0, 50, 16, 0, 16],
    value: 'text',
    font: 'Arial',
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
// Tests
// ---------------------------------------------------------------------------

describe('display:contents flattening', () => {
  it('flattens single display:contents wrapper — children promoted to parent', () => {
    const parent = makeFrame({
      tag: 'ul',
      width: 1440, height: 44,
      quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
      styles: { display: 'flex' },
      children: [
        // display:contents wrapper with 3 children
        makeFrame({
          tag: 'li',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [
            makeFrame({ tag: 'a', x: 0, y: 0, width: 46, height: 44, quad: [0, 0, 46, 0, 46, 44, 0, 44] }),
            makeFrame({ tag: 'a', x: 50, y: 0, width: 39, height: 44, quad: [50, 0, 89, 0, 89, 44, 50, 44] }),
            makeFrame({ tag: 'a', x: 93, y: 0, width: 40, height: 44, quad: [93, 0, 133, 0, 133, 44, 93, 44] }),
          ],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // 3 children promoted directly (wrapper removed)
    expect(result.children!.length).toBe(3);
    expect(result.children!.map(c => c.tag)).toEqual(['a', 'a', 'a']);
  });

  it('flattens nested 3-level display:contents (Apple nav structure) — 14 direct children', () => {
    // Reconstruct Apple's globalnav: ul with 4 DOM children,
    // where 1 is a 3-level display:contents chain wrapping 11 items.
    const navItems = Array.from({ length: 11 }, (_, i) => {
      const names = ['Store', 'Mac', 'iPad', 'iPhone', 'Watch', 'Vision', 'AirPods', 'TV', 'Entertainment', 'Accessories', 'Support'];
      const widths = [46, 39, 40, 54, 51, 50, 59, 81, 93, 83, 60];
      const x = widths.slice(0, i).reduce((a, b) => a + b, 30); // offset after Apple logo
      return makeFrame({
        tag: 'div',
        classList: [`globalnav-item-${names[i].toLowerCase()}`],
        x, y: 0, width: widths[i], height: 44,
        quad: [x, 0, x + widths[i], 0, x + widths[i], 44, x, 44],
        styles: { display: 'flex' },
      });
    });

    const ul = makeFrame({
      tag: 'ul',
      classList: ['globalnav-list'],
      x: 0, y: 0, width: 980, height: 44,
      quad: [0, 0, 980, 0, 980, 44, 0, 44],
      styles: { display: 'flex', flexDirection: 'row' },
      children: [
        // Child 1: Apple logo
        makeFrame({
          tag: 'li', classList: ['globalnav-item'],
          x: 0, y: 0, width: 30, height: 44,
          quad: [0, 0, 30, 0, 30, 44, 0, 44],
        }),
        // Child 2: display:contents chain (3 levels) wrapping 11 items
        makeFrame({
          tag: 'li', classList: ['globalnav-menu'],
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [
            makeFrame({
              tag: 'div', classList: ['globalnav-flyout'],
              x: 0, y: 0, width: 0, height: 0,
              quad: [0, 0, 0, 0, 0, 0, 0, 0],
              styles: { display: 'contents' },
              children: [
                makeFrame({
                  tag: 'div', classList: ['globalnav-menu-list'],
                  x: 0, y: 0, width: 0, height: 0,
                  quad: [0, 0, 0, 0, 0, 0, 0, 0],
                  styles: { display: 'contents' },
                  children: navItems,
                }),
              ],
            }),
          ],
        }),
        // Child 3: Search
        makeFrame({
          tag: 'li', classList: ['globalnav-item'],
          x: 900, y: 0, width: 31, height: 44,
          quad: [900, 0, 931, 0, 931, 44, 900, 44],
        }),
        // Child 4: Bag
        makeFrame({
          tag: 'li', classList: ['globalnav-bag'],
          x: 935, y: 0, width: 30, height: 44,
          quad: [935, 0, 965, 0, 965, 44, 935, 44],
        }),
      ],
    });

    const result = convertW2WToWireframe(ul as any);

    // Should have 14 direct children: logo + 11 items + search + bag
    expect(result.children!.length).toBe(14);

    // First child: Apple logo li
    expect(result.children![0].tag).toBe('li');
    expect(result.children![0].width).toBe(30);

    // Items 1-11: the promoted nav items
    expect(result.children![1].tag).toBe('div');
    expect(result.children![1].width).toBe(46); // Store

    expect(result.children![11].tag).toBe('div');
    expect(result.children![11].width).toBe(60); // Support

    // Last two: Search and Bag
    expect(result.children![12].tag).toBe('li');
    expect(result.children![12].width).toBe(31); // Search

    expect(result.children![13].tag).toBe('li');
    expect(result.children![13].width).toBe(30); // Bag
  });

  it('flattens mixed normal + display:contents children in correct order', () => {
    const parent = makeFrame({
      tag: 'div',
      width: 500, height: 50,
      quad: [0, 0, 500, 0, 500, 50, 0, 50],
      children: [
        makeFrame({ tag: 'span', x: 0, y: 0, width: 100, height: 50, quad: [0, 0, 100, 0, 100, 50, 0, 50] }),
        makeFrame({
          tag: 'div',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [
            makeFrame({ tag: 'a', x: 100, y: 0, width: 80, height: 50, quad: [100, 0, 180, 0, 180, 50, 100, 50] }),
            makeFrame({ tag: 'a', x: 180, y: 0, width: 80, height: 50, quad: [180, 0, 260, 0, 260, 50, 180, 50] }),
            makeFrame({ tag: 'a', x: 260, y: 0, width: 80, height: 50, quad: [260, 0, 340, 0, 340, 50, 260, 50] }),
          ],
        }),
        makeFrame({ tag: 'span', x: 340, y: 0, width: 100, height: 50, quad: [340, 0, 440, 0, 440, 50, 340, 50] }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // 5 children: span + 3 promoted <a> + span
    expect(result.children!.length).toBe(5);
    expect(result.children!.map(c => c.tag)).toEqual(['span', 'a', 'a', 'a', 'span']);
  });

  it('removes display:contents element with no children', () => {
    const parent = makeFrame({
      tag: 'div',
      width: 500, height: 50,
      quad: [0, 0, 500, 0, 500, 50, 0, 50],
      children: [
        makeFrame({ tag: 'span', x: 0, y: 0, width: 100, height: 50, quad: [0, 0, 100, 0, 100, 50, 0, 50] }),
        makeFrame({
          tag: 'div',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [],
        }),
        makeFrame({ tag: 'span', x: 100, y: 0, width: 100, height: 50, quad: [100, 0, 200, 0, 200, 50, 100, 50] }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // Empty display:contents removed, only 2 spans remain
    expect(result.children!.length).toBe(2);
    expect(result.children!.map(c => c.tag)).toEqual(['span', 'span']);
  });

  it('promotes TEXT and SVG children from display:contents wrapper', () => {
    const parent = makeFrame({
      tag: 'div',
      width: 500, height: 50,
      quad: [0, 0, 500, 0, 500, 50, 0, 50],
      children: [
        makeFrame({
          tag: 'span',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [
            makeSVG({ x: 0, y: 0, width: 14, height: 44, quad: [0, 0, 14, 0, 14, 44, 0, 44] }),
            makeFrame({ tag: 'a', x: 20, y: 0, width: 80, height: 44, quad: [20, 0, 100, 0, 100, 44, 20, 44] }),
          ],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // SVG and FRAME promoted to parent
    expect(result.children!.length).toBe(2);
    // SVG becomes a placeholder node with svgMarkup
    expect(result.children![0].computedStyles?.svgMarkup).toBeTruthy();
    // FRAME child preserved
    expect(result.children![1].tag).toBe('a');
  });

  it('regression: zero-size flattening still works for non-display:contents wrappers', () => {
    // A 0x0 wrapper WITHOUT display:contents should still be flattened by zero-size logic
    const parent = makeFrame({
      tag: 'body',
      width: 1440, height: 5000,
      quad: [0, 0, 1440, 0, 1440, 5000, 0, 5000],
      children: [
        makeFrame({
          tag: 'div',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          // NO display:contents — pure zero-size wrapper
          styles: { display: 'inline' },
          children: [
            makeFrame({
              tag: 'nav',
              x: 0, y: 0, width: 1440, height: 44,
              quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
              styles: { position: 'fixed' },
            }),
          ],
        }),
        makeFrame({
          tag: 'main',
          x: 0, y: 44, width: 1440, height: 4000,
          quad: [0, 44, 1440, 44, 1440, 4044, 0, 4044],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // nav should be promoted from zero-size wrapper + main = 2 children
    const childTags = result.children!.map(c => c.tag);
    expect(childTags).toContain('nav');
    expect(childTags).toContain('main');
    // No zero-size div wrapper should exist
    expect(result.children!.some(c => c.tag === 'div' && c.width < 1)).toBe(false);
  });

  it('flattens 5-level deep display:contents chain', () => {
    // Stress test: 5 nested display:contents wrappers around a visible item
    let innermost = makeFrame({
      tag: 'a', x: 0, y: 0, width: 100, height: 44,
      quad: [0, 0, 100, 0, 100, 44, 0, 44],
    });

    // Wrap in 5 levels of display:contents
    for (let i = 0; i < 5; i++) {
      innermost = makeFrame({
        tag: 'div', x: 0, y: 0, width: 0, height: 0,
        quad: [0, 0, 0, 0, 0, 0, 0, 0],
        styles: { display: 'contents' },
        children: [innermost],
      });
    }

    const parent = makeFrame({
      tag: 'div', width: 500, height: 44,
      quad: [0, 0, 500, 0, 500, 44, 0, 44],
      children: [innermost as Record<string, unknown>],
    });

    const result = convertW2WToWireframe(parent as any);

    // <a> promoted through 5 levels to become direct child
    expect(result.children!.length).toBe(1);
    expect(result.children![0].tag).toBe('a');
    expect(result.children![0].width).toBe(100);
  });

  it('handles display:contents inside inline text coalescing (collectTextFromFrame)', () => {
    // <p> with <span display:contents> wrapping <strong>Bold</strong>
    // collectTextFromFrame must see through display:contents to find <strong>
    const p = makeFrame({
      tag: 'p',
      width: 300, height: 20,
      quad: [0, 0, 300, 0, 300, 20, 0, 20],
      styles: { display: 'block' },
      children: [
        // display:contents span wrapping <strong> with TEXT inside
        makeFrame({
          tag: 'span',
          x: 0, y: 0, width: 0, height: 0,
          quad: [0, 0, 0, 0, 0, 0, 0, 0],
          styles: { display: 'contents' },
          children: [
            makeFrame({
              tag: 'strong',
              x: 0, y: 0, width: 50, height: 20,
              quad: [0, 0, 50, 0, 50, 20, 0, 20],
              styles: { fontWeight: '700' },
              children: [
                {
                  type: 'TEXT',
                  x: 0, y: 0, width: 50, height: 20,
                  quad: [0, 0, 50, 0, 50, 20, 0, 20],
                  value: 'Bold',
                  font: 'Arial',
                },
              ],
            }),
          ],
        }),
      ],
    });

    const result = convertW2WToWireframe(p as any);

    // The <strong> should be promoted through display:contents <span>.
    // In the main child loop, getEffectiveChildren flattens display:contents,
    // so <strong> becomes a direct child of <p>. Since <strong> is an
    // INLINE_TEXT_TAG inside a TEXT_COALESCE_TAG (<p>), its text is coalesced
    // into p's textContent.
    expect(result.textContent).toBe('Bold');
  });
});
