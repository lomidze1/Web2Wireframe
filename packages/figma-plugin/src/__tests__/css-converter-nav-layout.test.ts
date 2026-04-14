/**
 * Tests for nav layout properties in css-converter:
 * - justify-content: space-between → SPACE_BETWEEN
 * - position: fixed → preserved for layoutPositioning
 * - backdrop-filter: blur() → BACKGROUND_BLUR effect
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

describe('css-converter: nav layout properties', () => {
  describe('justify-content → primaryAxisAlignItems', () => {
    it('space-between is preserved in WireframeNode', () => {
      const nav = makeFrame({
        tag: 'ul',
        width: 980, height: 44,
        quad: [0, 0, 980, 0, 980, 44, 0, 44],
        styles: {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        children: [
          makeFrame({ tag: 'li', x: 0, y: 0, width: 30, height: 44, quad: [0, 0, 30, 0, 30, 44, 0, 44] }),
          makeFrame({ tag: 'li', x: 950, y: 0, width: 30, height: 44, quad: [950, 0, 980, 0, 980, 44, 950, 44] }),
        ],
      });

      const result = convertW2WToWireframe(nav as any);

      expect(result.justifyContent).toBe('space-between');
      expect(result.layoutMode).toBe('HORIZONTAL');
    });

    it('center is preserved', () => {
      const node = makeFrame({
        tag: 'div',
        width: 500, height: 50,
        quad: [0, 0, 500, 0, 500, 50, 0, 50],
        styles: {
          display: 'flex',
          justifyContent: 'center',
        },
      });

      const result = convertW2WToWireframe(node as any);
      expect(result.justifyContent).toBe('center');
    });

    it('flex-end is preserved', () => {
      const node = makeFrame({
        tag: 'div',
        width: 500, height: 50,
        quad: [0, 0, 500, 0, 500, 50, 0, 50],
        styles: {
          display: 'flex',
          justifyContent: 'flex-end',
        },
      });

      const result = convertW2WToWireframe(node as any);
      expect(result.justifyContent).toBe('flex-end');
    });
  });

  describe('position: fixed', () => {
    it('fixed position is preserved in WireframeNode', () => {
      const nav = makeFrame({
        tag: 'nav',
        width: 1440, height: 44,
        quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        styles: {
          position: 'fixed',
          display: 'flex',
          zIndex: 9999,
        },
      });

      const result = convertW2WToWireframe(nav as any);

      expect(result.position).toBe('fixed');
      expect(result.zIndex).toBe(9999);
    });

    it('sticky position is preserved', () => {
      const header = makeFrame({
        tag: 'header',
        width: 1440, height: 60,
        quad: [0, 0, 1440, 0, 1440, 60, 0, 60],
        styles: { position: 'sticky' },
      });

      const result = convertW2WToWireframe(header as any);
      expect(result.position).toBe('sticky');
    });
  });

  describe('backdrop-filter → BACKGROUND_BLUR', () => {
    it('blur value extracted as BACKGROUND_BLUR effect', () => {
      const nav = makeFrame({
        tag: 'nav',
        width: 1440, height: 44,
        quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        styles: {
          position: 'fixed',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'saturate(1.8) blur(20px)',
        },
      });

      const result = convertW2WToWireframe(nav as any);

      expect(result.effects).toBeDefined();
      const blurEffect = result.effects!.find((e: any) => e.type === 'BACKGROUND_BLUR');
      expect(blurEffect).toBeDefined();
      expect(blurEffect!.blurRadius).toBe(20);
    });

    it('no backdrop-filter → no BACKGROUND_BLUR', () => {
      const div = makeFrame({
        tag: 'div',
        width: 100, height: 50,
        quad: [0, 0, 100, 0, 100, 50, 0, 50],
        styles: { display: 'block' },
      });

      const result = convertW2WToWireframe(div as any);

      const blurEffect = result.effects?.find((e: any) => e.type === 'BACKGROUND_BLUR');
      expect(blurEffect).toBeUndefined();
    });

    it('CSS filter blur → LAYER_BLUR (not BACKGROUND_BLUR)', () => {
      const div = makeFrame({
        tag: 'div',
        width: 100, height: 50,
        quad: [0, 0, 100, 0, 100, 50, 0, 50],
        styles: { filter: 'blur(5px)' },
      });

      const result = convertW2WToWireframe(div as any);

      const layerBlur = result.effects?.find((e: any) => e.type === 'LAYER_BLUR');
      expect(layerBlur).toBeDefined();
      expect(layerBlur!.blurRadius).toBe(5);
    });
  });

  describe('Apple nav full structure', () => {
    it('Apple-style nav has correct layout properties', () => {
      // Simulate Apple's nav: fixed position, backdrop-filter, space-between
      const nav = makeFrame({
        tag: 'nav',
        classList: ['globalnav'],
        x: 0, y: 0, width: 1440, height: 44,
        quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        styles: {
          position: 'fixed',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'saturate(1.8) blur(20px)',
          zIndex: 9999,
        },
        children: [
          makeFrame({
            tag: 'div',
            classList: ['globalnav-content'],
            x: 208, y: 0, width: 1024, height: 44,
            quad: [208, 0, 1232, 0, 1232, 44, 208, 44],
            styles: { display: 'flex' },
            children: [
              makeFrame({
                tag: 'ul',
                classList: ['globalnav-list'],
                x: 230, y: 0, width: 980, height: 44,
                quad: [230, 0, 1210, 0, 1210, 44, 230, 44],
                styles: {
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                },
                children: [
                  makeFrame({ tag: 'li', x: 230, y: 0, width: 30, height: 44, quad: [230, 0, 260, 0, 260, 44, 230, 44] }),
                  makeFrame({ tag: 'li', x: 1180, y: 0, width: 30, height: 44, quad: [1180, 0, 1210, 0, 1210, 44, 1180, 44] }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = convertW2WToWireframe(nav as any);

      // Nav: fixed, backdrop blur
      expect(result.position).toBe('fixed');
      expect(result.zIndex).toBe(9999);
      expect(result.effects!.some((e: any) => e.type === 'BACKGROUND_BLUR')).toBe(true);

      // Find ul.globalnav-list deep in tree
      const content = result.children![0]; // div.globalnav-content
      const ul = content.children![0]; // ul.globalnav-list

      expect(ul.justifyContent).toBe('space-between');
      expect(ul.layoutMode).toBe('HORIZONTAL');
      expect(ul.children!.length).toBe(2);
    });
  });
});
