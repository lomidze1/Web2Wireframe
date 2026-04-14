/**
 * Tests for expanded hover diff CSS properties in css-converter.
 *
 * Phase 2A adds: visibility, transform (rotate), outlineWidth, letterSpacing
 * to HOVER_DIFF_PROPERTIES, so computeHoverDiff detects changes in these.
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME', x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: 'div', classList: [], attr: {}, styles: {}, children: [],
    ...overrides,
  };
}

describe('css-converter: expanded hover diff properties', () => {
  it('visibility change appears in hover diff', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { visibility: 'visible' },
      hover: makeFrame({ styles: { visibility: 'hidden' } }),
    });

    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover!['visibility']).toBe('hidden');
  });

  it('transform with rotate() appears in hover diff', () => {
    const node = makeFrame({
      tag: 'a',
      styles: { transform: 'none' },
      hover: makeFrame({ styles: { transform: 'rotate(45deg)' } }),
    });

    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover!['transform']).toBe('rotate(45deg)');
  });

  it('outlineWidth change appears in hover diff', () => {
    const node = makeFrame({
      tag: 'button',
      styles: { outlineWidth: '0px' },
      hover: makeFrame({ styles: { outlineWidth: '3px' } }),
    });

    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover!['outline-width']).toBe('3px');
  });

  it('letterSpacing change appears in hover diff', () => {
    const node = makeFrame({
      tag: 'a',
      styles: { letterSpacing: 'normal' },
      hover: makeFrame({ styles: { letterSpacing: '2px' } }),
    });

    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover!['letter-spacing']).toBe('2px');
  });

  it('new + old properties mixed in same diff', () => {
    const node = makeFrame({
      tag: 'a',
      styles: { backgroundColor: 'rgb(0,0,0)', visibility: 'visible', transform: 'none' },
      hover: makeFrame({
        styles: { backgroundColor: 'rgb(255,0,0)', visibility: 'hidden', transform: 'rotate(10deg)' },
      }),
    });

    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles).toBeDefined();
    const diff = result.pseudoStateStyles!.hover!;
    expect(diff['background-color']).toBe('rgb(255,0,0)');
    expect(diff['visibility']).toBe('hidden');
    expect(diff['transform']).toBe('rotate(10deg)');
  });

  it('unchanged new properties excluded from diff', () => {
    const node = makeFrame({
      tag: 'a',
      styles: { visibility: 'visible', transform: 'none', backgroundColor: 'black' },
      hover: makeFrame({
        styles: { visibility: 'visible', transform: 'none', backgroundColor: 'red' },
      }),
    });

    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles).toBeDefined();
    const diff = result.pseudoStateStyles!.hover!;
    expect(diff['background-color']).toBe('red');
    // Unchanged → NOT in diff
    expect(diff['visibility']).toBeUndefined();
    expect(diff['transform']).toBeUndefined();
  });
});
