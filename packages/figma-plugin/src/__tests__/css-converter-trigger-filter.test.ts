/**
 * Tests for filtering tiny trigger buttons in css-converter.
 *
 * Apple nav items contain 2 children: a visible link (44px height)
 * and a hidden dropdown trigger button (1px height). The trigger
 * buttons create noise in wireframe output and should be filtered.
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('css-converter: trigger button filtering', () => {
  it('filters 1px-height button inside nav item', () => {
    const parent = makeFrame({
      tag: 'li',
      width: 46, height: 44,
      quad: [0, 0, 46, 0, 46, 44, 0, 44],
      styles: { display: 'flex', flexDirection: 'column' },
      children: [
        // Visible nav link
        makeFrame({
          tag: 'a',
          x: 0, y: 0, width: 46, height: 44,
          quad: [0, 0, 46, 0, 46, 44, 0, 44],
          styles: { display: 'flex' },
        }),
        // 1px trigger button — should be filtered
        makeFrame({
          tag: 'button',
          x: 0, y: 44, width: 46, height: 1,
          quad: [0, 44, 46, 44, 46, 45, 0, 45],
          styles: {},
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // Only the <a> link should remain
    expect(result.children!.length).toBe(1);
    expect(result.children![0].tag).toBe('a');
  });

  it('does NOT filter 1px-height div (not a button)', () => {
    const parent = makeFrame({
      tag: 'li',
      width: 46, height: 44,
      quad: [0, 0, 46, 0, 46, 44, 0, 44],
      children: [
        makeFrame({
          tag: 'a',
          x: 0, y: 0, width: 46, height: 44,
          quad: [0, 0, 46, 0, 46, 44, 0, 44],
        }),
        // 1px div — could be a border/separator, should NOT be filtered
        makeFrame({
          tag: 'div',
          x: 0, y: 44, width: 46, height: 1,
          quad: [0, 44, 46, 44, 46, 45, 0, 45],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    // Both children should remain
    expect(result.children!.length).toBe(2);
  });

  it('does NOT filter 2px-height button (above threshold)', () => {
    const parent = makeFrame({
      tag: 'li',
      width: 46, height: 44,
      quad: [0, 0, 46, 0, 46, 44, 0, 44],
      children: [
        makeFrame({
          tag: 'button',
          x: 0, y: 0, width: 46, height: 2,
          quad: [0, 0, 46, 0, 46, 2, 0, 2],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    expect(result.children!.length).toBe(1);
    expect(result.children![0].tag).toBe('button');
  });

  it('filters element with role="button" and height < 2', () => {
    const parent = makeFrame({
      tag: 'ul',
      width: 200, height: 44,
      quad: [0, 0, 200, 0, 200, 44, 0, 44],
      children: [
        makeFrame({
          tag: 'li',
          x: 0, y: 0, width: 46, height: 1,
          quad: [0, 0, 46, 0, 46, 1, 0, 1],
          attr: { role: 'button' },
        }),
        makeFrame({
          tag: 'li',
          x: 50, y: 0, width: 46, height: 44,
          quad: [50, 0, 96, 0, 96, 44, 50, 44],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    expect(result.children!.length).toBe(1);
    expect(result.children![0].height).toBe(44);
  });

  it('filters 0-height button', () => {
    const parent = makeFrame({
      tag: 'div',
      width: 100, height: 44,
      quad: [0, 0, 100, 0, 100, 44, 0, 44],
      children: [
        makeFrame({
          tag: 'button',
          x: 0, y: 0, width: 22, height: 0,
          quad: [0, 0, 22, 0, 22, 0, 0, 0],
        }),
        makeFrame({
          tag: 'a',
          x: 0, y: 0, width: 100, height: 44,
          quad: [0, 0, 100, 0, 100, 44, 0, 44],
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as any);

    expect(result.children!.length).toBe(1);
    expect(result.children![0].tag).toBe('a');
  });
});
