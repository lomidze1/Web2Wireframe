/**
 * Tests for cross-axis FILL detection when CSS percentage widths (e.g., width: 100%)
 * are resolved to pixel values by the browser (e.g., "1440px").
 *
 * Bug: elements with width: 100% + margins get FIXED instead of FILL because
 * getSizing() only checks the literal string "100%", which doesn't match the
 * resolved pixel value.
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

describe('css-converter: resolved percentage width → FILL', () => {
  describe('vertical flex parent (cross-axis = horizontal)', () => {
    it('child with pixel width matching parent width → FILL', () => {
      const parent = makeFrame({
        width: 1440, height: 957,
        quad: [0, 0, 1440, 0, 1440, 957, 0, 957],
        styles: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        },
        children: [
          makeFrame({
            tag: 'div',
            classList: ['media-gallery-dotnav'],
            x: 0, y: 0, width: 1440, height: 24,
            quad: [0, 0, 1440, 0, 1440, 24, 0, 24],
            styles: {
              display: 'flex',
              flexDirection: 'row-reverse',
              flexGrow: 0,
              flexShrink: 1,
              alignItems: 'center',
              justifyContent: 'center',
              width: '1440px',   // resolved from CSS width: 100%
              height: '24px',
              marginTop: '12px',
              marginBottom: '12px',
              marginLeft: '0px',
              marginRight: '0px',
              position: 'relative',
            },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      const child = result.children![0];

      expect(child.layoutSizingHorizontal).toBe('FILL');
    });

    it('child with pixel width NOT matching parent → stays FIXED', () => {
      const parent = makeFrame({
        width: 1440, height: 957,
        quad: [0, 0, 1440, 0, 1440, 957, 0, 957],
        styles: {
          display: 'flex',
          flexDirection: 'column',
        },
        children: [
          makeFrame({
            tag: 'div',
            x: 0, y: 0, width: 224, height: 48,
            quad: [0, 0, 224, 0, 224, 48, 0, 48],
            styles: {
              display: 'flex',
              width: '224px',   // explicit fixed width, much smaller than parent
              height: '48px',
              flexGrow: 0,
            },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      const child = result.children![0];

      expect(child.layoutSizingHorizontal).toBe('FIXED');
    });

    it('accounts for parent padding when matching width', () => {
      // Parent has 20px padding on each side → content width = 1440 - 40 = 1400
      const parent = makeFrame({
        width: 1440, height: 500,
        quad: [0, 0, 1440, 0, 1440, 500, 0, 500],
        styles: {
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: '20px',
          paddingRight: '20px',
        },
        children: [
          makeFrame({
            tag: 'div',
            x: 20, y: 0, width: 1400, height: 24,
            quad: [20, 0, 1420, 0, 1420, 24, 20, 24],
            styles: {
              display: 'flex',
              width: '1400px',   // resolved from width: 100% (of content box)
              height: '24px',
              flexGrow: 0,
            },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      const child = result.children![0];

      expect(child.layoutSizingHorizontal).toBe('FILL');
    });

    it('width: "100%" string still works (direct percentage)', () => {
      const parent = makeFrame({
        width: 1440, height: 500,
        quad: [0, 0, 1440, 0, 1440, 500, 0, 500],
        styles: {
          display: 'flex',
          flexDirection: 'column',
        },
        children: [
          makeFrame({
            tag: 'div',
            x: 0, y: 0, width: 1440, height: 24,
            quad: [0, 0, 1440, 0, 1440, 24, 0, 24],
            styles: {
              display: 'flex',
              width: '100%',  // preserved by computedStyleMap
              height: '24px',
            },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      const child = result.children![0];

      expect(child.layoutSizingHorizontal).toBe('FILL');
    });
  });

  describe('horizontal flex parent (cross-axis = vertical)', () => {
    it('child with pixel height matching parent height → vertical FILL', () => {
      const parent = makeFrame({
        width: 500, height: 200,
        quad: [0, 0, 500, 0, 500, 200, 0, 200],
        styles: {
          display: 'flex',
          flexDirection: 'row',
        },
        children: [
          makeFrame({
            tag: 'div',
            x: 0, y: 0, width: 100, height: 200,
            quad: [0, 0, 100, 0, 100, 200, 0, 200],
            styles: {
              display: 'flex',
              width: '100px',
              height: '200px',  // resolved from height: 100%
              flexGrow: 0,
            },
          }),
        ],
      });

      const result = convertW2WToWireframe(parent as any);
      const child = result.children![0];

      expect(child.layoutSizingVertical).toBe('FILL');
    });
  });
});
