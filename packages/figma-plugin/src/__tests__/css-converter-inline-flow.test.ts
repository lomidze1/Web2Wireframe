/**
 * Tests for css-converter.ts: inline element horizontal flow
 *
 * Covers Apple.com footer case (<div class="ac-gf-footer-shop">) where a
 * block-level div contains inline flow (text + <a> + text + <a> + <span>)
 * that must render horizontally with children preserved as separate nodes,
 * matching h2d behavior.
 *
 * Three scenarios:
 *   A. All-inline block → HORIZONTAL auto-layout, children kept separate
 *   B. Mixed block + inline children → VERTICAL with single-element runs unwrapped
 *   C. Mixed block + multi-node inline runs → consecutive inline siblings wrapped
 *      in a synthetic HORIZONTAL InlineRun frame
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function makeText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 50, height: 14,
    quad: [0, 0, 50, 0, 50, 14, 0, 14],
    value,
    font: '400 12px SFProText',
    ...overrides,
  };
}

function inlineAnchor(text: string, x: number, width: number): Record<string, unknown> {
  return makeFrame({
    tag: 'a',
    x, y: 0, width, height: 14,
    quad: [x, 0, x + width, 0, x + width, 14, x, 14],
    styles: {
      display: 'inline',
      color: 'rgb(0, 102, 204)',
      textDecoration: 'underline',
      textDecorationLine: 'underline',
      fontSize: '12px',
    },
    attr: { href: 'https://example.com/' },
    children: [makeText(text, { x, width })],
  });
}

// ---------------------------------------------------------------------------
// Fix A — All-inline block → HORIZONTAL
// ---------------------------------------------------------------------------

describe("css-converter: inline flow (Fix A — all-inline block)", () => {
  it("Test 1 — Apple footer case: div with text + <a> + text + <a> + text + <span> → HORIZONTAL, 6 children in DOM order", () => {
    // <div class="ac-gf-footer-shop">More ways to shop: <a>Find an Apple Store</a> or <a>other retailer</a> near you. <span>...</span></div>
    const span = makeFrame({
      tag: 'span',
      x: 300, y: 0, width: 200, height: 14,
      quad: [300, 0, 500, 0, 500, 14, 300, 14],
      classList: ['nowrap'],
      styles: { display: 'inline-block', fontSize: '12px' },
      children: [
        makeText('Or call ', { x: 300, width: 40 }),
        inlineAnchor('1-800-MY-APPLE', 340, 90),
        makeText(' (1-800-692-7753).', { x: 430, width: 70 }),
      ],
    });

    const div = makeFrame({
      tag: 'div',
      classList: ['ac-gf-footer-shop'],
      x: 0, y: 0, width: 600, height: 16,
      quad: [0, 0, 600, 0, 600, 16, 0, 16],
      styles: { display: 'block', fontSize: '12px' },
      children: [
        makeText('More ways to shop: ', { x: 0, width: 110 }),
        inlineAnchor('Find an Apple Store', 110, 100),
        makeText(' or ', { x: 210, width: 20 }),
        inlineAnchor('other retailer', 230, 70),
        makeText(' near you. ', { x: 300, width: 60 }),
        span,
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    expect(result.type).toBe('frame');
    expect(result.layoutMode).toBe('HORIZONTAL');
    expect(result.children).toHaveLength(6);

    // No styledSegments on the parent div (NOT coalesced)
    expect(result.styledSegments).toBeUndefined();

    // DOM order preserved: text, anchor, text, anchor, text, span
    const kinds = result.children.map(c => ({ type: c.type, tag: c.tag }));
    expect(kinds[0]).toMatchObject({ type: 'text', tag: '#text' });
    expect(kinds[1]).toMatchObject({ tag: 'a' });
    expect(kinds[2]).toMatchObject({ type: 'text', tag: '#text' });
    expect(kinds[3]).toMatchObject({ tag: 'a' });
    expect(kinds[4]).toMatchObject({ type: 'text', tag: '#text' });
    expect(kinds[5]).toMatchObject({ tag: 'span' });

    // Text values preserved including whitespace
    expect(result.children[0].textContent).toBe('More ways to shop: ');
    expect(result.children[2].textContent).toBe(' or ');
    expect(result.children[4].textContent).toBe(' near you. ');

    // Anchors stay as their own nodes with their own text content
    expect(result.children[1].textContent).toContain('Find an Apple Store');
    expect(result.children[3].textContent).toContain('other retailer');
  });

  it("Test 2 — Absolute mode: same input, no HORIZONTAL promotion, NONE layout, children kept separate with x/y preserved", () => {
    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 600, height: 16,
      quad: [0, 0, 600, 0, 600, 16, 0, 16],
      styles: { display: 'block', fontSize: '12px' },
      children: [
        makeText('Hello ', { x: 0, width: 40 }),
        inlineAnchor('world', 40, 40),
        makeText('!', { x: 80, width: 10 }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'absolute' });

    expect(result.type).toBe('frame');
    expect(result.layoutMode).toBe('NONE');
    expect(result.children).toHaveLength(3);
    expect(result.styledSegments).toBeUndefined();

    // Parent-relative x from browser bounds preserved (horizontal flow)
    expect(result.children[0].x).toBe(0);
    expect(result.children[1].x).toBe(40);
    expect(result.children[2].x).toBe(80);
  });

  // Superseded by the inline run merge (rendering/textRunMerge.ts): three bare
  // text children painted flush ARE one continuous string in the browser, so
  // they now render as one TEXT node. Order is still what this pins — it is
  // now read off the merged characters instead of the child list.
  it("Test 3 — Pure text children in a div: merged into one run, in order", () => {
    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 300, height: 14,
      quad: [0, 0, 300, 0, 300, 14, 0, 14],
      styles: { display: 'block' },
      children: [
        makeText('a', { x: 0, width: 10 }),
        makeText('b', { x: 10, width: 10 }),
        makeText('c', { x: 20, width: 10 }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    expect(result.layoutMode).toBe('HORIZONTAL');
    expect(result.children).toHaveLength(1);
    // Contiguous runs: no separator invented, so the glyphs sit where they did.
    expect(result.children[0].textContent).toBe('abc');
    expect(result.children[0].styledSegments!.map(s => s.text)).toEqual(['a', 'b', 'c']);
  });

  it("Test 4 — Single inline child in a div: HORIZONTAL with 1 child", () => {
    const div = makeFrame({
      tag: 'div',
      styles: { display: 'block' },
      children: [inlineAnchor('click me', 0, 60)],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    expect(result.layoutMode).toBe('HORIZONTAL');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].tag).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Fix C — Mixed block + inline children
// ---------------------------------------------------------------------------

describe("css-converter: inline flow (Fix D — DOM order preservation for mixed children)", () => {
  it("Test 5 — 3 text + 2 block children: NONE (block default), 5 children in DOM order preserved", () => {
    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 300, height: 90,
      quad: [0, 0, 300, 0, 300, 90, 0, 90],
      styles: { display: 'block' },
      children: [
        makeText('text1', { x: 0, y: 0, width: 50 }),
        makeFrame({
          tag: 'p',
          x: 0, y: 20, width: 300, height: 20,
          quad: [0, 20, 300, 20, 300, 40, 0, 40],
          styles: { display: 'block' },
          children: [makeText('block1', { x: 0, y: 20 })],
        }),
        makeText('text2', { x: 0, y: 40, width: 50 }),
        makeFrame({
          tag: 'div',
          x: 0, y: 55, width: 300, height: 20,
          quad: [0, 55, 300, 55, 300, 75, 0, 75],
          styles: { display: 'block' },
          children: [makeText('block2', { x: 0, y: 55 })],
        }),
        makeText('text3', { x: 0, y: 75, width: 50 }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    // Block parent stays NONE (display: block default). Absolute positioning
    // handles layout — children keep their browser-computed y coordinates.
    expect(result.layoutMode).toBe('NONE');
    expect(result.children).toHaveLength(5);

    // DOM order preserved (Fix D): text1, p, text2, div, text3
    expect(result.children[0].textContent).toBe('text1');
    expect(result.children[1].tag).toBe('p');
    expect(result.children[2].textContent).toBe('text2');
    expect(result.children[3].tag).toBe('div');
    expect(result.children[4].textContent).toBe('text3');
  });

  it("Test 6 — Mixed with multi-node inline run: DOM order preserved across text/frame transitions", () => {
    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 400, height: 60,
      quad: [0, 0, 400, 0, 400, 60, 0, 60],
      styles: { display: 'block' },
      children: [
        makeText('text1', { x: 0, y: 0, width: 50 }),
        inlineAnchor('link-A', 50, 60),
        makeText('text2', { x: 110, y: 0, width: 50 }),
        makeFrame({
          tag: 'p',
          x: 0, y: 20, width: 400, height: 20,
          quad: [0, 20, 400, 20, 400, 40, 0, 40],
          styles: { display: 'block' },
          children: [makeText('block', { x: 0, y: 20 })],
        }),
        makeText('text3', { x: 0, y: 45, width: 50 }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    // Block parent stays NONE (display: block default)
    expect(result.layoutMode).toBe('NONE');
    expect(result.children).toHaveLength(5);

    // DOM order preserved flat (no synthetic wrapping): text1, a, text2, p, text3
    expect(result.children[0].textContent).toBe('text1');
    expect(result.children[1].tag).toBe('a');
    expect(result.children[2].textContent).toBe('text2');
    expect(result.children[3].tag).toBe('p');
    expect(result.children[4].textContent).toBe('text3');
  });

  it("Test 7 — Absolute mode mixed block+inline: flat children at browser x/y, DOM order preserved", () => {
    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 400, height: 60,
      styles: { display: 'block' },
      children: [
        makeText('text1', { x: 0, y: 0, width: 50 }),
        inlineAnchor('A', 50, 20),
        makeFrame({
          tag: 'p',
          x: 0, y: 20, width: 400, height: 20,
          styles: { display: 'block' },
          children: [makeText('block', { x: 0, y: 20 })],
        }),
        makeText('text3', { x: 0, y: 45, width: 50 }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'absolute' });

    expect(result.layoutMode).toBe('NONE');
    expect(result.children).toHaveLength(4);

    // DOM order preserved: text1, a, p, text3
    expect(result.children[0].textContent).toBe('text1');
    expect(result.children[1].tag).toBe('a');
    expect(result.children[2].tag).toBe('p');
    expect(result.children[3].textContent).toBe('text3');
  });
});

// ---------------------------------------------------------------------------
// Regressions — existing behavior must not change
// ---------------------------------------------------------------------------

describe("css-converter: inline flow (regressions)", () => {
  it("Test 8 — Existing text-coalesce unchanged: <p>Hello <strong>world</strong>!</p> → single text with styledSegments", () => {
    const p = makeFrame({
      tag: 'p',
      styles: { display: 'block', fontSize: '16px' },
      children: [
        makeText('Hello '),
        makeFrame({
          tag: 'strong',
          styles: { display: 'inline', fontWeight: '700' },
          children: [makeText('world')],
        }),
        makeText('!'),
      ],
    });

    const result = convertW2WToWireframe(p as any, { layoutMode: 'autoLayout' });

    expect(result.type).toBe('text');
    expect(result.textContent).toContain('Hello');
    expect(result.textContent).toContain('world');
    expect(result.styledSegments).toBeDefined();
    expect(result.styledSegments!.length).toBeGreaterThanOrEqual(3);
  });

  it("Test 9 — Pure block children unchanged: NONE with 2 block children (current behavior)", () => {
    const div = makeFrame({
      tag: 'div',
      styles: { display: 'block' },
      children: [
        makeFrame({ tag: 'div', styles: { display: 'block' }, children: [makeText('A')] }),
        makeFrame({ tag: 'div', styles: { display: 'block' }, children: [makeText('B')] }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    expect(result.layoutMode).toBe('NONE');
    expect(result.children).toHaveLength(2);
  });

  it("Test 10 — Existing float heuristic preserved: float:left children → HORIZONTAL", () => {
    const div = makeFrame({
      tag: 'div',
      styles: { display: 'block' },
      children: [
        makeFrame({
          tag: 'div',
          styles: { display: 'block', cssFloat: 'left' },
          children: [makeText('A')],
        }),
        makeFrame({
          tag: 'div',
          styles: { display: 'block', cssFloat: 'left' },
          children: [makeText('B')],
        }),
      ],
    });

    const result = convertW2WToWireframe(div as any, { layoutMode: 'autoLayout' });

    expect(result.layoutMode).toBe('HORIZONTAL');
    expect(result.children).toHaveLength(2);
  });
});
