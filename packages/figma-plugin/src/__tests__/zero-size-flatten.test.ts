/**
 * Zero-size wrapper flattening + visibility filtering tests.
 *
 * 1. Zero-size flattening: Apple.com's div#globalheader is display:inline,
 *    w=0, h=0. Inside it: nav.globalnav (position:fixed, w=1440, h=44).
 *    Without flattening, the 0x0 wrapper becomes a clipped Figma frame.
 *
 * 2. Visibility filtering: Apple.com's flyout menus have visibility:hidden,
 *    globalnav-curtain has opacity:0. These should be pruned (h2d does this).
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';
import type { W2WFrameNode, Quad } from '@w2w/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const quad = (x: number, y: number, w: number, h: number): Quad =>
  [x, y, x + w, y, x + w, y + h, x, y + h];

function makeFrame(
  overrides: Partial<W2WFrameNode> & { tag: string; x: number; y: number; width: number; height: number },
): W2WFrameNode {
  const { tag, x, y, width, height, ...rest } = overrides;
  return {
    type: 'FRAME',
    tag,
    x,
    y,
    width,
    height,
    quad: quad(x, y, width, height),
    classList: rest.classList || [],
    attr: rest.attr || {},
    styles: rest.styles || {},
    children: rest.children || [],
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Zero-size wrapper flattening', () => {
  it('promotes children of 0x0 wrapper into parent', () => {
    // Simulate Apple.com structure:
    // body > div#globalheader(0x0) > nav.globalnav(fixed, 1440x44)
    const nav = makeFrame({
      tag: 'nav',
      classList: ['globalnav'],
      x: 0,
      y: 70,
      width: 1440,
      height: 44,
      styles: { position: 'fixed', display: 'block', backgroundColor: 'rgba(255,255,255,0.8)' },
      children: [],
    });

    const zeroWrapper = makeFrame({
      tag: 'div',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      styles: {},
      children: [nav],
    });

    const main = makeFrame({
      tag: 'main',
      x: 0,
      y: 114,
      width: 1440,
      height: 4000,
      styles: { display: 'block' },
      children: [],
    });

    const body = makeFrame({
      tag: 'body',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: { display: 'block' },
      children: [zeroWrapper, main],
    });

    const html = makeFrame({
      tag: 'html',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: {},
      children: [body],
    });

    const result = convertW2WToWireframe(html);

    // Body node should have nav + main as direct children (no 0x0 wrapper)
    const bodyNode = result.children![0]; // body
    expect(bodyNode.tag).toBe('body');

    // Should have nav promoted from the zero-size wrapper + main = 2 children
    const childTags = bodyNode.children!.map((c) => c.tag);
    expect(childTags).toContain('nav');
    expect(childTags).toContain('main');
    // Zero-size wrapper div should NOT be a child
    expect(bodyNode.children!.some((c) => c.tag === 'div' && c.width < 1 && c.height < 1)).toBe(false);
  });

  it('promotes multiple children from a zero-size wrapper', () => {
    const child1 = makeFrame({
      tag: 'nav',
      x: 0,
      y: 0,
      width: 1440,
      height: 44,
      styles: { position: 'fixed' },
      children: [],
    });

    const child2 = makeFrame({
      tag: 'div',
      classList: ['curtain'],
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      styles: { position: 'fixed' },
      children: [],
    });

    const zeroWrapper = makeFrame({
      tag: 'div',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      styles: {},
      children: [child1, child2],
    });

    const parent = makeFrame({
      tag: 'body',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: { display: 'block' },
      children: [zeroWrapper],
    });

    const html = makeFrame({
      tag: 'html',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: {},
      children: [parent],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];

    // Both children promoted from wrapper
    expect(bodyNode.children!.length).toBe(2);
    expect(bodyNode.children![0].tag).toBe('nav');
    expect(bodyNode.children![1].tag).toBe('div');
  });

  it('does NOT flatten normal-size wrappers', () => {
    const child = makeFrame({
      tag: 'nav',
      x: 0,
      y: 0,
      width: 1440,
      height: 44,
      styles: {},
      children: [],
    });

    const normalWrapper = makeFrame({
      tag: 'div',
      x: 0,
      y: 0,
      width: 1440,
      height: 44,
      styles: { display: 'block' },
      children: [child],
    });

    const body = makeFrame({
      tag: 'body',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: { display: 'block' },
      children: [normalWrapper],
    });

    const html = makeFrame({
      tag: 'html',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: {},
      children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];

    // Wrapper preserved — 1 child (the wrapper div), not flattened
    expect(bodyNode.children!.length).toBe(1);
    expect(bodyNode.children![0].tag).toBe('div');
    expect(bodyNode.children![0].children!.length).toBe(1);
    expect(bodyNode.children![0].children![0].tag).toBe('nav');
  });

  it('removes zero-size wrapper with no children', () => {
    const emptyZeroWrapper = makeFrame({
      tag: 'div',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      styles: {},
      children: [],
    });

    const main = makeFrame({
      tag: 'main',
      x: 0,
      y: 0,
      width: 1440,
      height: 4000,
      styles: { display: 'block' },
      children: [],
    });

    const body = makeFrame({
      tag: 'body',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: { display: 'block' },
      children: [emptyZeroWrapper, main],
    });

    const html = makeFrame({
      tag: 'html',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: {},
      children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];

    // Empty zero-size wrapper removed, only main remains
    expect(bodyNode.children!.length).toBe(1);
    expect(bodyNode.children![0].tag).toBe('main');
  });

  it('preserves position:fixed on promoted children', () => {
    const nav = makeFrame({
      tag: 'nav',
      x: 0,
      y: 70,
      width: 1440,
      height: 44,
      styles: { position: 'fixed', zIndex: '9999' },
      children: [],
    });

    const zeroWrapper = makeFrame({
      tag: 'div',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      styles: {},
      children: [nav],
    });

    const body = makeFrame({
      tag: 'body',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: { display: 'block' },
      children: [zeroWrapper],
    });

    const html = makeFrame({
      tag: 'html',
      x: 0,
      y: 0,
      width: 1440,
      height: 5000,
      styles: {},
      children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];
    const promotedNav = bodyNode.children![0];

    expect(promotedNav.tag).toBe('nav');
    expect(promotedNav.position).toBe('fixed');
  });
});

// ---------------------------------------------------------------------------
// Visibility / opacity filtering
// ---------------------------------------------------------------------------

describe('Visibility filtering in CSS converter', () => {
  it('skips children with visibility:hidden (flyout menus)', () => {
    const visibleNav = makeFrame({
      tag: 'ul',
      classList: ['globalnav-submenu-trigger-group'],
      x: 0, y: 0, width: 100, height: 44,
      styles: { display: 'flex' },
      children: [],
    });

    const hiddenFlyout = makeFrame({
      tag: 'div',
      classList: ['globalnav-submenu-link-store'],
      x: 0, y: 44, width: 1024, height: 400,
      styles: { visibility: 'hidden', overflow: 'hidden' },
      children: [
        makeFrame({ tag: 'div', x: 0, y: 44, width: 1024, height: 400, styles: {}, children: [] }),
      ],
    });

    const navItem = makeFrame({
      tag: 'div',
      classList: ['globalnav-item'],
      x: 0, y: 0, width: 100, height: 44,
      styles: { display: 'block' },
      children: [visibleNav, hiddenFlyout],
    });

    const body = makeFrame({
      tag: 'body', x: 0, y: 0, width: 1440, height: 5000,
      styles: { display: 'block' },
      children: [navItem],
    });

    const html = makeFrame({
      tag: 'html', x: 0, y: 0, width: 1440, height: 5000,
      styles: {}, children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];
    const navItemNode = bodyNode.children![0];

    // Only the visible trigger group, flyout pruned
    expect(navItemNode.children!.length).toBe(1);
    expect(navItemNode.children![0].className).toBe('globalnav-submenu-trigger-group');
  });

  it('skips children with opacity:0 (curtain overlay)', () => {
    const curtain = makeFrame({
      tag: 'div',
      classList: ['globalnav-curtain'],
      x: 0, y: 0, width: 1440, height: 900,
      styles: { visibility: 'hidden', opacity: 0 },
      children: [],
    });

    const main = makeFrame({
      tag: 'main', x: 0, y: 44, width: 1440, height: 4000,
      styles: { display: 'block' }, children: [],
    });

    const body = makeFrame({
      tag: 'body', x: 0, y: 0, width: 1440, height: 5000,
      styles: { display: 'block' },
      children: [curtain, main],
    });

    const html = makeFrame({
      tag: 'html', x: 0, y: 0, width: 1440, height: 5000,
      styles: {}, children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];

    // Curtain pruned, only main remains
    expect(bodyNode.children!.length).toBe(1);
    expect(bodyNode.children![0].tag).toBe('main');
  });

  it('skips children with opacity:"0" (string value)', () => {
    const invisible = makeFrame({
      tag: 'div', x: 0, y: 0, width: 100, height: 100,
      styles: { opacity: '0' }, children: [],
    });

    const visible = makeFrame({
      tag: 'div', x: 0, y: 100, width: 100, height: 100,
      styles: { opacity: '1' }, children: [],
    });

    const body = makeFrame({
      tag: 'body', x: 0, y: 0, width: 1440, height: 5000,
      styles: { display: 'block' },
      children: [invisible, visible],
    });

    const html = makeFrame({
      tag: 'html', x: 0, y: 0, width: 1440, height: 5000,
      styles: {}, children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];

    expect(bodyNode.children!.length).toBe(1);
    expect(bodyNode.children![0].y).toBe(100);
  });

  it('keeps visible elements (visibility not set or visible)', () => {
    const normal = makeFrame({
      tag: 'div', x: 0, y: 0, width: 100, height: 100,
      styles: { display: 'block' }, children: [],
    });

    const explicitVisible = makeFrame({
      tag: 'div', x: 0, y: 100, width: 100, height: 100,
      styles: { visibility: 'visible', opacity: '1' }, children: [],
    });

    const body = makeFrame({
      tag: 'body', x: 0, y: 0, width: 1440, height: 5000,
      styles: { display: 'block' },
      children: [normal, explicitVisible],
    });

    const html = makeFrame({
      tag: 'html', x: 0, y: 0, width: 1440, height: 5000,
      styles: {}, children: [body],
    });

    const result = convertW2WToWireframe(html);
    const bodyNode = result.children![0];

    // Both preserved
    expect(bodyNode.children!.length).toBe(2);
  });
});
