/**
 * Tests for float and inline-block layout detection in css-converter:
 * - float: left/right/inline-start/inline-end children → parent HORIZONTAL
 * - display: inline-block children → parent HORIZONTAL
 * - float children → FIXED sizing (not FILL)
 * - regression: block children → unchanged behavior
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

describe('css-converter: float and inline-block layout', () => {
  describe('float children → parent HORIZONTAL', () => {
    it('float:left children make parent HORIZONTAL', () => {
      const parent = makeFrame({
        width: 746, height: 26,
        quad: [0, 0, 746, 0, 746, 26, 0, 26],
        styles: { display: 'block' },
        children: [
          makeFrame({
            x: 0, y: 0, width: 267, height: 16,
            quad: [0, 0, 267, 0, 267, 16, 0, 16],
            styles: { display: 'block', cssFloat: 'left' },
          }),
          makeFrame({
            x: 267, y: 0, width: 419, height: 21,
            quad: [267, 0, 686, 0, 686, 21, 267, 21],
            styles: { display: 'block', cssFloat: 'left' },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      expect(result.layoutMode).toBe('HORIZONTAL');
    });

    it('float:inline-start treated same as float:left', () => {
      const parent = makeFrame({
        width: 746, height: 26,
        quad: [0, 0, 746, 0, 746, 26, 0, 26],
        styles: { display: 'block' },
        children: [
          makeFrame({
            x: 0, y: 0, width: 267, height: 16,
            quad: [0, 0, 267, 0, 267, 16, 0, 16],
            styles: { display: 'block', cssFloat: 'inline-start' },
          }),
          makeFrame({
            x: 267, y: 0, width: 419, height: 21,
            quad: [267, 0, 686, 0, 686, 21, 267, 21],
            styles: { display: 'block', cssFloat: 'inline-start' },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      expect(result.layoutMode).toBe('HORIZONTAL');
    });

    it('float children get FIXED sizing (not FILL)', () => {
      const parent = makeFrame({
        width: 746, height: 26,
        quad: [0, 0, 746, 0, 746, 26, 0, 26],
        styles: { display: 'block' },
        children: [
          makeFrame({
            x: 0, y: 0, width: 267, height: 16,
            quad: [0, 0, 267, 0, 267, 16, 0, 16],
            styles: { display: 'block', cssFloat: 'left', width: '267px' },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      const child = result.children![0];
      expect(child.layoutSizingHorizontal).toBe('FIXED');
    });
  });

  describe('inline-block children → parent HORIZONTAL', () => {
    it('inline-block children make parent HORIZONTAL', () => {
      const parent = makeFrame({
        tag: 'ul',
        width: 419, height: 21,
        quad: [0, 0, 419, 0, 419, 21, 0, 21],
        styles: { display: 'block' },
        children: [
          makeFrame({
            tag: 'li', x: 0, y: 0, width: 86, height: 16,
            quad: [0, 0, 86, 0, 86, 16, 0, 16],
            styles: { display: 'inline-block' },
            children: [{ type: 'TEXT', value: 'Privacy Policy', x: 0, y: 0, width: 86, height: 16, font: '400 12px Arial' }],
          }),
          makeFrame({
            tag: 'li', x: 92, y: 0, width: 82, height: 16,
            quad: [92, 0, 174, 0, 174, 16, 92, 16],
            styles: { display: 'inline-block' },
            children: [{ type: 'TEXT', value: 'Terms of Use', x: 92, y: 0, width: 82, height: 16, font: '400 12px Arial' }],
          }),
          makeFrame({
            tag: 'li', x: 180, y: 0, width: 110, height: 16,
            quad: [180, 0, 290, 0, 290, 16, 180, 16],
            styles: { display: 'inline-block' },
            children: [{ type: 'TEXT', value: 'Sales and Refunds', x: 180, y: 0, width: 110, height: 16, font: '400 12px Arial' }],
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      expect(result.layoutMode).toBe('HORIZONTAL');
    });

    it('display:inline non-text children make parent HORIZONTAL', () => {
      // Use li tags (not in INLINE_TEXT_TAGS) with display:inline
      // span/a/strong with only TEXT children are text-coalescing candidates, not layout children
      const parent = makeFrame({
        tag: 'ul',
        width: 300, height: 20,
        quad: [0, 0, 300, 0, 300, 20, 0, 20],
        styles: { display: 'block' },
        children: [
          makeFrame({
            tag: 'li', x: 0, y: 0, width: 100, height: 16,
            quad: [0, 0, 100, 0, 100, 16, 0, 16],
            styles: { display: 'inline' },
            children: [{ type: 'TEXT', value: 'Link A', x: 0, y: 0, width: 100, height: 16, font: '400 12px Arial' }],
          }),
          makeFrame({
            tag: 'li', x: 110, y: 0, width: 100, height: 16,
            quad: [110, 0, 210, 0, 210, 16, 110, 16],
            styles: { display: 'inline' },
            children: [{ type: 'TEXT', value: 'Link B', x: 110, y: 0, width: 100, height: 16, font: '400 12px Arial' }],
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      expect(result.layoutMode).toBe('HORIZONTAL');
    });
  });

  describe('regression: block children remain unchanged', () => {
    it('block children in block parent do not become HORIZONTAL', () => {
      const parent = makeFrame({
        width: 400, height: 100,
        quad: [0, 0, 400, 0, 400, 100, 0, 100],
        styles: { display: 'block' },
        children: [
          makeFrame({
            x: 0, y: 0, width: 400, height: 30,
            quad: [0, 0, 400, 0, 400, 30, 0, 30],
            styles: { display: 'block' },
          }),
          makeFrame({
            x: 0, y: 30, width: 400, height: 30,
            quad: [0, 30, 400, 30, 400, 60, 0, 60],
            styles: { display: 'block' },
          }),
          makeFrame({
            x: 0, y: 60, width: 400, height: 30,
            quad: [0, 60, 400, 60, 400, 90, 0, 90],
            styles: { display: 'block' },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      // Block children in block parent: should NOT become HORIZONTAL
      expect(result.layoutMode).not.toBe('HORIZONTAL');
    });
  });
});
