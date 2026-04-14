/**
 * Tests for FIX 2 — synthetic hover fallback.
 *
 * When node.hover is undefined (CSS capture failed, timed out, or no
 * :hover rule was authored) but the element is clearly interactive
 * (button, link, [role=button], [tabindex], cursor:pointer), the converter
 * should synthesize a default hover state so that the Figma plugin still
 * creates a ComponentSet with a Hover variant. The synthesized diff is
 * `opacity: 0.8` — universal and tag-agnostic.
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

describe('css-converter: synthetic hover fallback (FIX 2)', () => {
  it('synthesizes hover for <button> when node.hover is undefined', () => {
    const node = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0, 0, 255)' },
      // No hover field at all
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeDefined();
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

  it('does NOT synthesize when a real hover diff is present (real data wins)', () => {
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

    // Real hover diff has backgroundColor change — must NOT be replaced
    // by synthetic opacity: 0.8
    expect(result.pseudoStateStyles?.hover).toEqual({
      'background-color': 'rgb(255, 0, 0)',
    });
  });

  it('DOES synthesize when node.hover exists but diff is empty (JS-driven hover)', () => {
    // Edge case: CDP forced :hover but no CSS properties changed. Could be
    // a JS-driven hover the extraction couldn't capture. Fall back to synthetic
    // for interactive tags so the user still gets a visible variant.
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
});
