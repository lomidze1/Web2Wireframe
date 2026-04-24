/**
 * Tests for the interactive-element contract (h2d-parity, Batch 1+3).
 *
 * OLD (removed): synthesize { hover: { opacity: '0.8' } } for interactive
 * elements without a real CSS :hover diff. This produced ghost hover
 * components on apple.com image cards where no real CSS hover exists.
 *
 * NEW:
 *   1. pseudoStateStyles.hover is ONLY set when a real, non-trivial diff
 *      was captured. Trivial diffs (cursor-only, text-decoration-line:none,
 *      opacity:1) and missing diffs yield undefined — no hover variant,
 *      no ComponentSet.
 *   2. Interactive elements (tag/role/tabindex/cursor:pointer) that don't
 *      get a hover variant are marked `needsCursorPointer: true`. nodes.ts
 *      attaches a self-referencing ON_HOVER reaction so Figma Preview
 *      still shows cursor:pointer — matching h2d's behavior.
 *
 * Non-interactive elements: neither pseudoStateStyles nor needsCursorPointer.
 * The FIX 4 descendant-hover path is preserved — see css-converter-descendant-hover.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';

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

describe('css-converter: interactive elements without real hover diff → needsCursorPointer', () => {
  it('marks <button> with needsCursorPointer (no hover variant)', () => {
    const node = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0, 0, 255)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('marks <a> with needsCursorPointer', () => {
    const node = makeFrame({
      tag: 'a',
      attr: { href: '/page' },
      styles: { color: 'rgb(0, 0, 255)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('marks <input> with needsCursorPointer', () => {
    const node = makeFrame({
      tag: 'input',
      attr: { type: 'text' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('marks [role=button] <div> with needsCursorPointer', () => {
    const node = makeFrame({
      tag: 'div',
      attr: { role: 'button' },
      styles: { backgroundColor: 'rgb(200, 200, 200)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('marks [role=link] with needsCursorPointer', () => {
    const node = makeFrame({
      tag: 'span',
      attr: { role: 'link' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('marks [tabindex="0"] <div> with needsCursorPointer', () => {
    const node = makeFrame({
      tag: 'div',
      attr: { tabindex: '0' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('marks cursor:pointer <div> with needsCursorPointer (apple .tile-link case)', () => {
    const node = makeFrame({
      tag: 'div',
      classList: ['clickable'],
      styles: { cursor: 'pointer', backgroundColor: 'rgb(255, 0, 0)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('does NOT mark [tabindex="-1"] (explicit opt-out)', () => {
    const node = makeFrame({
      tag: 'div',
      attr: { tabindex: '-1' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBeUndefined();
  });

  it('does NOT mark non-interactive <div>', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { backgroundColor: 'rgb(200, 200, 200)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBeUndefined();
  });

  it('does NOT mark non-interactive <span>', () => {
    const node = makeFrame({
      tag: 'span',
      styles: { color: 'rgb(0, 0, 0)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBeUndefined();
  });

  it('marks ARIA roles: tab, menuitem, option with needsCursorPointer', () => {
    for (const role of ['tab', 'menuitem', 'option']) {
      const node = makeFrame({
        tag: 'li',
        attr: { role },
        styles: {},
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = convertW2WToWireframe(node as any);
      expect(result.pseudoStateStyles).toBeUndefined();
      expect(result.needsCursorPointer).toBe(true);
    }
  });

  it('hover with identical styles (JS-driven) → needsCursorPointer, no variant', () => {
    // Edge case: CDP forced :hover but no CSS properties changed. Previously
    // synthesized fake opacity:0.8 — now we mark needsCursorPointer so
    // cursor:pointer still works in Preview without a ghost variant.
    const node = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0, 0, 0)' },
      hover: makeFrame({
        tag: 'button',
        styles: { backgroundColor: 'rgb(0, 0, 0)' }, // identical
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });

  it('trivial hover (text-decoration-line: none only) → needsCursorPointer, no variant (apple .tile-link)', () => {
    // Reproduces apple.com image card behavior: hover diff contains ONLY
    // text-decoration-line: none (both base and hover have no underline).
    // Must NOT create a hover variant.
    const node = makeFrame({
      tag: 'a',
      attr: { href: '/iphone' },
      styles: { textDecorationLine: 'none', cursor: 'pointer' },
      hover: makeFrame({
        tag: 'a',
        styles: { textDecorationLine: 'none', cursor: 'pointer' },
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });
});

describe('css-converter: real hover diff still produces pseudoStateStyles', () => {
  it('uses real hover diff when backgroundColor changes (<button>)', () => {
    const node = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0, 0, 0)', opacity: 1 },
      hover: makeFrame({
        tag: 'button',
        styles: { backgroundColor: 'rgb(255, 0, 0)', opacity: 1 },
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({
      'background-color': 'rgb(255, 0, 0)',
    });
  });

  it('uses real hover diff when color changes (<a>)', () => {
    const node = makeFrame({
      tag: 'a',
      attr: { href: '/' },
      styles: { color: 'rgb(0, 0, 0)' },
      hover: makeFrame({
        tag: 'a',
        attr: { href: '/' },
        styles: { color: 'rgb(0, 122, 255)' },
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toBeDefined();
    expect(result.pseudoStateStyles?.hover?.color).toBe('rgb(0, 122, 255)');
  });

  it('apple.com case: <a class="tile-link"> with no real hover diff → needsCursorPointer only', () => {
    // apple.com tile cards: hovering only changes the cursor (verified via
    // runtime CSS inspection). Their :hover rule sets only
    // text-decoration-line: none which matches the base — no visible delta.
    // Previously synthesized { opacity: 0.8 } (ghost 80% opacity on every
    // hero card); now emits nothing on pseudoStateStyles and sets
    // needsCursorPointer so nodes.ts attaches a self-referencing ON_HOVER
    // reaction → Figma Preview shows cursor:pointer without a ghost variant.
    const node = makeFrame({
      tag: 'a',
      classList: ['tile-link'],
      attr: { href: '/us/shop/goto/store' },
      styles: { color: 'rgb(29, 29, 31)' },
      hover: makeFrame({
        tag: 'a',
        classList: ['tile-link'],
        attr: { href: '/us/shop/goto/store' },
        styles: { color: 'rgb(29, 29, 31)' }, // identical — flyout lives elsewhere
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
    expect(result.needsCursorPointer).toBe(true);
  });
});
