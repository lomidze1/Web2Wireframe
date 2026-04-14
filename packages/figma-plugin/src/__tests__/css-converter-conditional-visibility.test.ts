/**
 * Tests for conditional visibility filtering based on interactionMode.
 *
 * interactionMode="none": hidden elements (visibility:hidden, opacity:0) filtered (default)
 * interactionMode="variants": hidden elements preserved with isHiddenInDefault=true
 *                             for use in component variant rendering
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

describe('css-converter: conditional visibility filtering', () => {

  describe('interactionMode="none" (default)', () => {
    it('filters visibility:hidden elements (current behavior)', () => {
      const parent = makeFrame({
        tag: 'nav',
        width: 1440, height: 44,
        quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        children: [
          makeFrame({ tag: 'a', x: 0, y: 0, width: 46, height: 44, quad: [0, 0, 46, 0, 46, 44, 0, 44] }),
          makeFrame({
            tag: 'div', x: 0, y: 44, width: 1440, height: 500,
            quad: [0, 44, 1440, 44, 1440, 544, 0, 544],
            styles: { visibility: 'hidden' },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      // Hidden element filtered — only visible <a> remains
      expect(result.children!.length).toBe(1);
      expect(result.children![0].tag).toBe('a');
    });

    it('filters opacity:0 elements (current behavior)', () => {
      const parent = makeFrame({
        tag: 'div',
        width: 1440, height: 500,
        quad: [0, 0, 1440, 0, 1440, 500, 0, 500],
        children: [
          makeFrame({ tag: 'nav', x: 0, y: 0, width: 1440, height: 44, quad: [0, 0, 1440, 0, 1440, 44, 0, 44] }),
          makeFrame({
            tag: 'div', classList: ['curtain'],
            x: 0, y: 44, width: 1440, height: 920,
            quad: [0, 44, 1440, 44, 1440, 964, 0, 964],
            styles: { opacity: 0 },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      expect(result.children!.length).toBe(1);
      expect(result.children![0].tag).toBe('nav');
    });
  });

  describe('interactionMode="variants"', () => {
    it('preserves visibility:hidden elements with isHiddenInDefault=true', () => {
      const parent = makeFrame({
        tag: 'nav',
        width: 1440, height: 44,
        quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        children: [
          makeFrame({ tag: 'a', x: 0, y: 0, width: 46, height: 44, quad: [0, 0, 46, 0, 46, 44, 0, 44] }),
          makeFrame({
            tag: 'div', classList: ['submenu'],
            x: 0, y: 44, width: 1440, height: 500,
            quad: [0, 44, 1440, 44, 1440, 544, 0, 544],
            styles: { visibility: 'hidden' },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any, { interactionMode: 'variants' });

      // Hidden element preserved
      expect(result.children!.length).toBe(2);
      expect(result.children![1].tag).toBe('div');
      // Marked as hidden in default state
      expect(result.children![1].isHiddenInDefault).toBe(true);
    });

    it('preserves opacity:0 elements with isHiddenInDefault=true', () => {
      const parent = makeFrame({
        tag: 'div',
        width: 1440, height: 500,
        quad: [0, 0, 1440, 0, 1440, 500, 0, 500],
        children: [
          makeFrame({ tag: 'nav', x: 0, y: 0, width: 1440, height: 44, quad: [0, 0, 1440, 0, 1440, 44, 0, 44] }),
          makeFrame({
            tag: 'div', classList: ['curtain'],
            x: 0, y: 44, width: 1440, height: 920,
            quad: [0, 44, 1440, 44, 1440, 964, 0, 964],
            styles: { opacity: 0 },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any, { interactionMode: 'variants' });

      expect(result.children!.length).toBe(2);
      expect(result.children![1].isHiddenInDefault).toBe(true);
    });

    it('visible elements do NOT get isHiddenInDefault flag', () => {
      const parent = makeFrame({
        tag: 'div',
        width: 200, height: 50,
        quad: [0, 0, 200, 0, 200, 50, 0, 50],
        children: [
          makeFrame({ tag: 'a', x: 0, y: 0, width: 100, height: 50, quad: [0, 0, 100, 0, 100, 50, 0, 50] }),
          makeFrame({ tag: 'span', x: 100, y: 0, width: 100, height: 50, quad: [100, 0, 200, 0, 200, 50, 100, 50] }),
        ],
      });

      const result = convertW2WToWireframe(parent as any, { interactionMode: 'variants' });

      expect(result.children!.length).toBe(2);
      expect(result.children![0].isHiddenInDefault).toBeUndefined();
      expect(result.children![1].isHiddenInDefault).toBeUndefined();
    });
  });

  describe('regression', () => {
    it('display:contents still flattened in variants mode', () => {
      const parent = makeFrame({
        tag: 'ul',
        width: 500, height: 44,
        quad: [0, 0, 500, 0, 500, 44, 0, 44],
        children: [
          makeFrame({
            tag: 'li', x: 0, y: 0, width: 0, height: 0,
            quad: [0, 0, 0, 0, 0, 0, 0, 0],
            styles: { display: 'contents' },
            children: [
              makeFrame({ tag: 'a', x: 0, y: 0, width: 46, height: 44, quad: [0, 0, 46, 0, 46, 44, 0, 44] }),
              makeFrame({ tag: 'a', x: 50, y: 0, width: 39, height: 44, quad: [50, 0, 89, 0, 89, 44, 50, 44] }),
            ],
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any, { interactionMode: 'variants' });

      // display:contents still flattened
      expect(result.children!.length).toBe(2);
      expect(result.children![0].tag).toBe('a');
      expect(result.children![1].tag).toBe('a');
    });
  });
});
