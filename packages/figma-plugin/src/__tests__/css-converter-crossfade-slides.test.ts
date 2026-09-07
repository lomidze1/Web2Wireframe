/**
 * Crossfade carousels: the slides that are not showing must survive the import.
 *
 * stripe.com stacks all eight slides in one box and fades between them, so
 * seven of them carry `opacity: 0` at capture time. Dropping every transparent
 * box lost seven eighths of that section — h2d keeps all eight, transparency
 * and all.
 *
 * The exemption is deliberately narrow: a transparent box is a slide only when
 * an OPAQUE sibling occupies the same box. Apple's globalnav-curtain is a lone
 * transparent overlay with no such sibling and must keep being dropped, or the
 * import gains a page-covering sheet (measured: the broad rule would have added
 * 45% more nodes to apple.com and 0 useful ones).
 */

import { describe, it, expect, vi } from 'vitest';
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

function makeText(value: string, overrides: Record<string, unknown> = {}) {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 400, height: 40,
    quad: [0, 0, 400, 0, 400, 40, 0, 40],
    value,
    font: 'Arial Regular',
    ...overrides,
  };
}

/** One slide of a crossfade deck: same box as its siblings, its own headline. */
function makeSlide(headline: string, opacity: number) {
  return makeFrame({
    tag: 'div',
    classList: ['squeezy-carousel__item-details'],
    x: 97, y: 200, width: 1232, height: 75,
    quad: [97, 200, 1329, 200, 1329, 275, 97, 275],
    styles: { opacity },
    children: [makeText(headline, { x: 97, y: 200, width: 1232, height: 40 })],
  });
}

/** The deck: one showing slide plus `hidden` faded-out ones. */
function makeDeck(hidden: number) {
  const slides = [makeSlide('Businesses on Stripe generated $1.9T', 1)];
  for (let i = 0; i < hidden; i++) slides.push(makeSlide(`Hidden headline ${i}`, 0));

  return makeFrame({
    tag: 'div',
    classList: ['squeezy-carousel__items-details-container'],
    x: 97, y: 200, width: 1232, height: 75,
    quad: [97, 200, 1329, 200, 1329, 275, 97, 275],
    children: slides,
  });
}

const headlines = (node: unknown): string[] => {
  const out: string[] = [];
  const walk = (n: any): void => {
    if (typeof n?.textContent === 'string' && n.textContent) out.push(n.textContent);
    for (const child of n?.children ?? []) walk(child);
  };
  walk(node);
  return out;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('css-converter: crossfade carousel slides', () => {
  it('keeps faded-out slides that share a box with an opaque sibling', () => {
    const result = convertW2WToWireframe(makeDeck(7) as any);

    expect(result.children!.length).toBe(8);
    const text = headlines(result).join(' | ');
    expect(text).toContain('Businesses on Stripe generated $1.9T');
    expect(text).toContain('Hidden headline 0');
    expect(text).toContain('Hidden headline 6');
  });

  it('carries the transparency through, so a kept slide paints nothing', () => {
    const result = convertW2WToWireframe(makeDeck(1) as any);

    const opacities = result.children!.map((child) => (child as any).opacity);
    expect(opacities).toContain(0);
    expect(opacities).toContain(1);
  });

  it('still drops a lone transparent overlay — apple.com globalnav-curtain', () => {
    const page = makeFrame({
      width: 1440, height: 964,
      quad: [0, 0, 1440, 0, 1440, 964, 0, 964],
      children: [
        makeFrame({
          tag: 'nav', x: 0, y: 0, width: 1440, height: 44,
          quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        }),
        makeFrame({
          tag: 'div', classList: ['globalnav-curtain'],
          x: 0, y: 44, width: 1440, height: 920,
          quad: [0, 44, 1440, 44, 1440, 964, 0, 964],
          styles: { opacity: 0 },
          children: [makeText('menu item', { x: 0, y: 44, width: 200, height: 30 })],
        }),
      ],
    });

    const result = convertW2WToWireframe(page as any);

    expect(result.children!.length).toBe(1);
    expect(result.children![0].tag).toBe('nav');
  });

  it('drops a transparent sibling that sits in a different box', () => {
    const page = makeFrame({
      width: 1000, height: 400,
      quad: [0, 0, 1000, 0, 1000, 400, 0, 400],
      children: [
        makeFrame({
          x: 0, y: 0, width: 400, height: 100,
          quad: [0, 0, 400, 0, 400, 100, 0, 100],
          children: [makeText('showing', { width: 400, height: 40 })],
        }),
        // Same size, 200px lower — a stacked deck this is not.
        makeFrame({
          x: 0, y: 200, width: 400, height: 100,
          quad: [0, 200, 400, 200, 400, 300, 0, 300],
          styles: { opacity: 0 },
          children: [makeText('elsewhere', { x: 0, y: 200, width: 400, height: 40 })],
        }),
      ],
    });

    const result = convertW2WToWireframe(page as any);

    expect(result.children!.length).toBe(1);
    expect(headlines(result).join(' ')).not.toContain('elsewhere');
  });

  it('drops a transparent sibling that carries no content', () => {
    const page = makeFrame({
      width: 400, height: 100,
      quad: [0, 0, 400, 0, 400, 100, 0, 100],
      children: [
        makeFrame({
          x: 0, y: 0, width: 400, height: 100,
          quad: [0, 0, 400, 0, 400, 100, 0, 100],
          children: [makeText('showing', { width: 400, height: 40 })],
        }),
        // Same box, opaque sibling present — but it is an empty decorative wash.
        makeFrame({
          classList: ['gradient-wash'],
          x: 0, y: 0, width: 400, height: 100,
          quad: [0, 0, 400, 0, 400, 100, 0, 100],
          styles: { opacity: 0 },
        }),
      ],
    });

    const result = convertW2WToWireframe(page as any);

    expect(result.children!.length).toBe(1);
  });

  it('leaves visibility:hidden filtering exactly as it was', () => {
    const page = makeFrame({
      width: 400, height: 100,
      quad: [0, 0, 400, 0, 400, 100, 0, 100],
      children: [
        makeFrame({
          x: 0, y: 0, width: 400, height: 100,
          quad: [0, 0, 400, 0, 400, 100, 0, 100],
          children: [makeText('showing', { width: 400, height: 40 })],
        }),
        makeFrame({
          x: 0, y: 0, width: 400, height: 100,
          quad: [0, 0, 400, 0, 400, 100, 0, 100],
          styles: { visibility: 'hidden' },
          children: [makeText('hidden by visibility', { width: 400, height: 40 })],
        }),
      ],
    });

    const result = convertW2WToWireframe(page as any);

    expect(result.children!.length).toBe(1);
    expect(headlines(result).join(' ')).not.toContain('hidden by visibility');
  });

  it('does not report a kept slide as lost content', () => {
    const onSkippedFrame = vi.fn();

    convertW2WToWireframe(makeDeck(7) as any, { onSkippedFrame } as any);

    const reported = onSkippedFrame.mock.calls.map(([entry]) => entry.layerName).join(' ');
    expect(reported).not.toMatch(/squeezy-carousel__item-details/);
  });
});

// ---------------------------------------------------------------------------
// A box whose content IS its paint
// ---------------------------------------------------------------------------

/**
 * stripe.com's stats gradient is a childless <div> whose whole purpose is a
 * radial-gradient background — six of them stacked, one opaque and five faded
 * out. h2d keeps all six; we dropped five because "carries content" only ever
 * counted text, SVG and images.
 */
function paintedDeck(styles: Record<string, unknown>) {
  const box = (over: Record<string, unknown>) =>
    makeFrame({
      x: 0, y: 0, width: 400, height: 200,
      quad: [0, 0, 400, 0, 400, 200, 0, 200],
      ...over,
    });

  return makeFrame({
    width: 400, height: 200,
    quad: [0, 0, 400, 0, 400, 200, 0, 200],
    children: [
      // The showing face, opaque and painted the same way.
      box({ classList: ['showing'], styles }),
      box({ classList: ['faded'], styles: { ...styles, opacity: 0 } }),
    ],
  });
}

const keptChildren = (styles: Record<string, unknown>) =>
  convertW2WToWireframe(paintedDeck(styles) as any).children!.length;

describe('css-converter: transparent boxes that paint', () => {
  it('keeps a faded gradient box — its background is the content', () => {
    expect(keptChildren({ backgroundImage: 'radial-gradient(at 50% 50%, rgb(203, 131, 255), rgb(255, 144, 185))' })).toBe(2);
  });

  it('keeps a faded box with a solid background', () => {
    expect(keptChildren({ backgroundColor: 'rgb(83, 58, 253)' })).toBe(2);
  });

  it('keeps a faded box that is only a border', () => {
    expect(
      keptChildren({ borderTopWidth: '2px', borderTopColor: 'rgb(0, 0, 0)', borderTopStyle: 'solid' }),
    ).toBe(2);
  });

  it('keeps a faded box that only casts a shadow', () => {
    expect(keptChildren({ boxShadow: 'rgba(0, 0, 0, 0.1) 0px 30px 60px -50px' })).toBe(2);
  });

  it('a zero-width border is not paint, whatever colour it declares', () => {
    // Every element reports a borderTopColor — the CSS default is black — so
    // colour alone must never count. Width is what decides.
    expect(
      keptChildren({ borderTopWidth: '0px', borderTopColor: 'rgb(0, 0, 0)', borderTopStyle: 'solid' }),
    ).toBe(1);
  });

  it('a fully transparent background colour is not paint', () => {
    expect(keptChildren({ backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none' })).toBe(1);
  });

  it('still drops a painted box with no opaque twin — apple.com stays safe', () => {
    const page = makeFrame({
      width: 1440, height: 964,
      quad: [0, 0, 1440, 0, 1440, 964, 0, 964],
      children: [
        makeFrame({
          tag: 'nav', x: 0, y: 0, width: 1440, height: 44,
          quad: [0, 0, 1440, 0, 1440, 44, 0, 44],
        }),
        makeFrame({
          classList: ['globalnav-curtain'],
          x: 0, y: 44, width: 1440, height: 920,
          quad: [0, 44, 1440, 44, 1440, 964, 0, 964],
          styles: { opacity: 0, backgroundColor: 'rgb(255, 255, 255)' },
        }),
      ],
    });

    expect(convertW2WToWireframe(page as any).children!.length).toBe(1);
  });

  it('does not add the dropped decoration to the import report', () => {
    // The report answers "would a person miss this?" — a decorative wash with
    // no opaque twin is dropped, but it is not lost content.
    const onSkippedFrame = vi.fn();
    const page = makeFrame({
      width: 400, height: 300,
      quad: [0, 0, 400, 0, 400, 300, 0, 300],
      children: [
        makeFrame({
          x: 0, y: 0, width: 400, height: 100,
          quad: [0, 0, 400, 0, 400, 100, 0, 100],
          children: [makeText('showing', { width: 400, height: 40 })],
        }),
        makeFrame({
          classList: ['decorative-wash'],
          x: 0, y: 150, width: 400, height: 100,
          quad: [0, 150, 400, 150, 400, 250, 0, 250],
          styles: { opacity: 0, backgroundImage: 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))' },
        }),
      ],
    });

    convertW2WToWireframe(page as any, { onSkippedFrame } as any);

    const reported = onSkippedFrame.mock.calls.map(([e]) => e.layerName).join(' ');
    expect(reported).not.toMatch(/decorative-wash/);
  });
});
