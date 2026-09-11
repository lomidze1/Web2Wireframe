/**
 * A relative `font-size` inside an inline <svg> reaches Figma as 1px.
 *
 * stripe.com's "Sign in" button is a knockout mask: a white rect covering the
 * button, with the label cut out of it so the layer beneath shows through.
 *
 *   <mask id="cutoutMask">
 *     <rect width="100%" height="100%" fill="white"/>
 *     <text x="50%" y="50%" font-size="1em" fill="black">Sign in</text>
 *   </mask>
 *
 * `1em` only means anything against a CSS context, and Figma's
 * createNodeFromSvg has none — it takes the number and drops the unit, so the
 * label imports at fontSize 1, measuring 3.28 x 0.38px, and the button arrives
 * blank. h2d bakes the computed size and gets 45 x 17 at fontSize 14.
 *
 * Font-size is baked only onto text elements, for the reason STOP_PROPS already
 * documents: `getComputedStyle` answers `font-size` on every element, so baking
 * it everywhere would put an attribute on each of an icon's shapes for nothing.
 *
 * Lives beside svg-style-baker.test.ts rather than inside it — that file has
 * unrelated work in flight.
 */
import { describe, it, expect } from 'vitest';
import { bakeSvgPresentation } from './svg-style-baker';

function makeSvg(markup: string): { original: SVGElement; clone: SVGElement } {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const original = doc.documentElement as unknown as SVGElement;
  const clone = original.cloneNode(true) as SVGElement;
  return { original, clone };
}

function styleByTag(
  map: Record<string, Record<string, string>>,
): (el: Element) => CSSStyleDeclaration {
  return (el) =>
    ({
      getPropertyValue: (prop: string) =>
        map[el.tagName.toLowerCase()]?.[prop] ?? '',
    }) as unknown as CSSStyleDeclaration;
}

/** stripe.com's cutout mask, as the extractor serializes it. */
const CUTOUT_MASK =
  '<svg xmlns="http://www.w3.org/2000/svg" class="navigation-item__sign-in__mask">' +
  '<defs><mask id="cutoutMask">' +
  '<rect x="0" y="0" width="100%" height="100%" fill="rgb(255, 255, 255)"/>' +
  '<text x="50%" y="50%" font-size="1em" fill="rgb(0, 0, 0)">Sign in</text>' +
  '</mask></defs>' +
  '<rect x="0" y="0" width="100%" height="100%" fill="rgb(6, 27, 49)" opacity="0.1"/>' +
  '</svg>';

const at = (el: SVGElement, sel: string): Element => el.querySelector(sel)!;

describe('bakeSvgPresentation — font-size on text', () => {
  it('replaces a relative font-size with the computed pixel value', () => {
    const { original, clone } = makeSvg(CUTOUT_MASK);

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ text: { 'font-size': '14px' } }),
    );

    const text = at(clone, 'text');
    expect(text.getAttribute('font-size')).toBe('14px');
    // Replaced, not appended — an element carries one attribute of a name, but
    // the assertion states the intent: `1em` must not survive anywhere.
    expect(clone.outerHTML).not.toContain('1em');
  });

  it('bakes a size onto text that declared none', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Label</text></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ text: { 'font-size': '18.5px' } }),
    );

    expect(at(clone, 'text').getAttribute('font-size')).toBe('18.5px');
  });

  it('treats tspan and textPath like text', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><text><tspan>a</tspan></text>' +
        '<text><textPath href="#p">b</textPath></text></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({
        text: { 'font-size': '14px' },
        tspan: { 'font-size': '11px' },
        textpath: { 'font-size': '12px' },
      }),
    );

    expect(at(clone, 'tspan').getAttribute('font-size')).toBe('11px');
    expect(at(clone, 'textPath').getAttribute('font-size')).toBe('12px');
  });

  it('leaves non-text elements without a font-size attribute', () => {
    // getComputedStyle answers font-size for every element; writing it on each
    // shape of an icon is payload noise and nothing else.
    const { original, clone } = makeSvg(CUTOUT_MASK);

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({
        text: { 'font-size': '14px' },
        rect: { 'font-size': '16px' },
        svg: { 'font-size': '16px' },
        mask: { 'font-size': '16px' },
      }),
    );

    for (const el of Array.from(clone.querySelectorAll('rect, mask, defs'))) {
      expect(el.hasAttribute('font-size')).toBe(false);
    }
    expect(clone.hasAttribute('font-size')).toBe(false);
  });

  it('leaves the paint baking it already did untouched', () => {
    const { original, clone } = makeSvg(CUTOUT_MASK);

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({
        text: { 'font-size': '14px', fill: 'rgb(0, 0, 0)' },
        rect: { fill: 'rgb(255, 255, 255)' },
      }),
    );

    expect(at(clone, 'mask rect').getAttribute('fill')).toBe('rgb(255, 255, 255)');
    expect(at(clone, 'text').getAttribute('fill')).toBe('rgb(0, 0, 0)');
  });
});
