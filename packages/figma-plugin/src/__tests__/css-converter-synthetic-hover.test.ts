/**
 * Tests for the hover fallback contract (FIX 2 — synthetic hover).
 *
 * When node.hover is undefined or yields an empty diff, the converter
 * synthesizes a generic { hover: { opacity: '0.8' } } for interactive
 * elements (<a>, <button>, [role=button], [tabindex], cursor:pointer).
 * This ensures every interactive element gets a ComponentSet with a
 * Default/Hover variant, even when CDP can't capture a real CSS :hover diff
 * (e.g. JS-driven hover effects).
 *
 * Non-interactive elements without a real hover diff return undefined →
 * nodes.ts renders them as plain frames, no ComponentSet.
 *
 * The FIX 4 descendant-hover path (parent-hover → child-visibility) is
 * preserved unchanged — see css-converter-descendant-hover.test.ts.
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

describe('css-converter: FIX 2 synthetic hover fallback — interactive elements without real diff', () => {
  it('synthesizes hover for <button> when node.hover is undefined', () => {
    const node = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0, 0, 255)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('synthesizes hover for <a> element', () => {
    const node = makeFrame({
      tag: 'a',
      attr: { href: '/page' },
      styles: { color: 'rgb(0, 0, 255)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('synthesizes hover for <input> elements', () => {
    const node = makeFrame({
      tag: 'input',
      attr: { type: 'text' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('synthesizes hover for [role=button] on a <div>', () => {
    const node = makeFrame({
      tag: 'div',
      attr: { role: 'button' },
      styles: { backgroundColor: 'rgb(200, 200, 200)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('synthesizes hover for [role=link]', () => {
    const node = makeFrame({
      tag: 'span',
      attr: { role: 'link' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('synthesizes hover for [tabindex="0"] on a <div>', () => {
    const node = makeFrame({
      tag: 'div',
      attr: { tabindex: '0' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('synthesizes hover for elements with cursor:pointer', () => {
    const node = makeFrame({
      tag: 'div',
      classList: ['clickable'],
      styles: { cursor: 'pointer', backgroundColor: 'rgb(255, 0, 0)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });

  it('does NOT synthesize for [tabindex="-1"]', () => {
    const node = makeFrame({
      tag: 'div',
      attr: { tabindex: '-1' },
      styles: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
  });

  it('does NOT synthesize for non-interactive <div> without interactive signals', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { backgroundColor: 'rgb(200, 200, 200)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
  });

  it('does NOT synthesize for non-interactive <span>', () => {
    const node = makeFrame({
      tag: 'span',
      styles: { color: 'rgb(0, 0, 0)' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
  });

  it('synthesizes hover for ARIA roles: tab, menuitem, option', () => {
    for (const role of ['tab', 'menuitem', 'option']) {
      const node = makeFrame({
        tag: 'li',
        attr: { role },
        styles: {},
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = convertW2WToWireframe(node as any);
      expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
    }
  });

  it('synthesizes hover when node.hover exists but diff is empty (JS-driven hover) for interactive element', () => {
    // Edge case: CDP forced :hover but no CSS properties changed. Could be
    // a JS-driven hover the extraction couldn't capture. For interactive
    // elements, we still synthesize so they get a ComponentSet.
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

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
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

  it('apple.com case: <a class="tile-link"> with no real hover diff → synthetic fallback', () => {
    // Mega-menu flyout is a sibling, not a child. extractSubtree only
    // captures the <a>'s own subtree, so hover.styles matches node.styles.
    // Since <a> is interactive, FIX 2 synthesizes { opacity: '0.8' }.
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

    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
  });
});
