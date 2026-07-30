/**
 * Viewport culling for transform-driven carousels (owl-carousel v1 & friends).
 *
 * Regression: a CS-Cart product slider parks its slides with
 * `transform: translate3d(-720px,0,0)` on a 5280px stage inside an
 * `overflow:hidden` viewport. Short, left-aligned descendants of a slide (the
 * rating row, the price number) landed entirely at x < 0 — or, for slides
 * parked past the right edge, failed a depth-limited ancestor walk — and were
 * culled, while their full-width parents survived. The imported wireframe
 * showed product cards with an EMPTY price box.
 *
 * The fix makes "inside a horizontal scroller" a property of the container,
 * inherited by the whole subtree, instead of a per-element ancestor walk.
 */
import { describe, it, expect } from 'vitest';
import { isOffscreen, isHorizontalScrollContainer } from './visibility';

/** DOMRect stub — only left/right matter for culling. */
function rect(left: number, right: number): DOMRect {
  return { left, right, width: right - left } as DOMRect;
}

/** Build an element with a computed overflow-x and a scroll/client width pair. */
function el(
  tag: string,
  overflowX: string,
  scrollWidth: number,
  clientWidth: number,
): HTMLElement {
  const node = document.createElement(tag);
  node.style.overflowX = overflowX;
  Object.defineProperty(node, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(node, 'clientWidth', { value: clientWidth });
  document.body.appendChild(node);
  return node;
}

describe('isOffscreen — pure geometry', () => {
  it('drops elements entirely past the right viewport edge', () => {
    expect(isOffscreen(rect(1560, 1800), 1440)).toBe(true);
  });

  it('drops elements entirely left of the viewport', () => {
    // A slide parked at translate3d(-720px): x = -360..-120
    expect(isOffscreen(rect(-360, -120), 1440)).toBe(true);
  });

  it('keeps elements straddling x = 0', () => {
    expect(isOffscreen(rect(-120, 120), 1440)).toBe(false);
  });

  it('keeps elements straddling the right edge', () => {
    expect(isOffscreen(rect(1320, 1560), 1440)).toBe(false);
  });

  it('keeps a zero-width element at x = 0', () => {
    expect(isOffscreen(rect(0, 0), 1440)).toBe(false);
  });
});

describe('isHorizontalScrollContainer', () => {
  it('recognises an overflow:hidden carousel viewport with real overflow', () => {
    const outer = el('div', 'hidden', 5280, 1200);
    expect(isHorizontalScrollContainer(outer, getComputedStyle(outer))).toBe(true);
  });

  it('recognises overflow-x: auto and scroll', () => {
    for (const ox of ['auto', 'scroll']) {
      const node = el('div', ox, 5280, 1200);
      expect(isHorizontalScrollContainer(node, getComputedStyle(node))).toBe(true);
    }
  });

  it('rejects a clipped container with no actual overflow', () => {
    const node = el('div', 'hidden', 1200, 1200);
    expect(isHorizontalScrollContainer(node, getComputedStyle(node))).toBe(false);
  });

  it('rejects overflow-x: visible', () => {
    const node = el('div', 'visible', 5280, 1200);
    expect(isHorizontalScrollContainer(node, getComputedStyle(node))).toBe(false);
  });

  it('never treats <body>/<html> as a scroller', () => {
    // `body { overflow-x: hidden }` is a near-universal "no horizontal scroll"
    // guard. Honouring it here would disable viewport culling page-wide and
    // drag every off-canvas menu into the capture.
    for (const tag of ['body', 'html']) {
      const node = el(tag, 'hidden', 5280, 1200);
      expect(isHorizontalScrollContainer(node, getComputedStyle(node))).toBe(false);
    }
  });
});
