/**
 * The extractor emits the revealed state of a reversible scroll reveal.
 *
 * The shared auto-scroll (`W2W_SCROLL_AND_SAMPLE_EXPRESSION`) marks elements
 * that were visible while the page scrolled but are `opacity: 0` again at the
 * top (Webflow IX2 / GSAP fade-outs) with `data-w2w-reveal-transform`. Without
 * reading it, the plugin drops them — vaayu.tech lost 58 elements this way.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { W2W_REVEAL_MARKER_ATTR } from '@w2w/shared';
import { cleanupMarkers, extractSubtree } from './extractor';

function mount(html: string): void {
  document.body.innerHTML = html;
  // happy-dom has no layout: give every element a real box so nothing is culled.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 40, width: 400, height: 40,
    toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('reveal marker', () => {
  it('a marked transparent element is emitted as revealed, with the recorded transform', () => {
    mount(
      `<div id="t" style="opacity:0; transform: translate3d(0px, 14px, 0px)" ${W2W_REVEAL_MARKER_ATTR}="matrix(1, 0, 0, 1, 0, 4)">We are proud</div>`,
    );

    const node = extractSubtree('#t');

    expect(node).not.toBeNull();
    expect(node!.styles.opacity).toBeUndefined();
    expect(node!.styles.transform).toBe('matrix(1, 0, 0, 1, 0, 4)');
  });

  it('a recorded transform of none leaves no transform', () => {
    mount(`<div id="t" style="opacity:0; transform: translate3d(0px, 14px, 0px)" ${W2W_REVEAL_MARKER_ATTR}="none">x</div>`);

    const node = extractSubtree('#t');

    expect(node!.styles.opacity).toBeUndefined();
    expect(node!.styles.transform).toBeUndefined();
  });

  it('a marked element still fading out (nearly transparent) is emitted as revealed', () => {
    mount(`<div id="t" style="opacity:0.0001" ${W2W_REVEAL_MARKER_ATTR}="none">footer</div>`);

    const node = extractSubtree('#t');

    expect(node!.styles.opacity).toBeUndefined();
  });

  it('an unmarked transparent element stays transparent (menus, modals)', () => {
    mount('<div id="t" style="opacity:0">menu</div>');

    const node = extractSubtree('#t');

    expect(node!.styles.opacity).toBe(0);
  });

  it('a marker on an element that is visible again is ignored', () => {
    mount(`<div id="t" style="opacity:0.5" ${W2W_REVEAL_MARKER_ATTR}="none">x</div>`);

    const node = extractSubtree('#t');

    expect(node!.styles.opacity).toBe(0.5);
  });

  it('cleanupMarkers removes the reveal marker', () => {
    mount(`<div id="t" ${W2W_REVEAL_MARKER_ATTR}="none">x</div>`);

    cleanupMarkers();

    expect(document.querySelector(`[${W2W_REVEAL_MARKER_ATTR}]`)).toBeNull();
  });
});
