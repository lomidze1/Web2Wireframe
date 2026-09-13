/**
 * bakeSvgPresentation — computed SVG paint must survive extraction.
 *
 * web2wireframe.design's hero icons are inline <svg> with no fill/stroke in
 * the markup; the paint lives in a page CSS rule (`._diffIcon_ svg { stroke:
 * #2563eb; fill: none; … }`). Extraction ships `clone.outerHTML`, the rule
 * stays behind, and Figma's createNodeFromSvg falls back to the SVG defaults
 * (fill: black, stroke: none) — closed shapes render as black blobs, open
 * strokes vanish. Baking the computed values onto the clone as presentation
 * attributes makes the markup self-contained.
 *
 * The helper takes `getStyle` as a parameter so these tests feed it exact
 * computed values instead of depending on happy-dom's CSS cascade.
 */
import { describe, it, expect } from 'vitest';
import { bakeSvgPresentation } from './svg-style-baker';

/** Parse static test markup into an SVG element plus its deep clone. */
function makeSvg(markup: string): { original: SVGElement; clone: SVGElement } {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const original = doc.documentElement as unknown as SVGElement;
  const clone = original.cloneNode(true) as SVGElement;
  return { original, clone };
}

/** Fake getComputedStyle: per-tag property maps, empty string otherwise. */
function styleByTag(
  map: Record<string, Record<string, string>>,
): (el: Element) => CSSStyleDeclaration {
  return (el) =>
    ({
      getPropertyValue: (prop: string) =>
        map[el.tagName.toLowerCase()]?.[prop] ?? '',
    }) as unknown as CSSStyleDeclaration;
}

/** The web2wireframe icon rule, as Chrome computes it. */
const OUTLINE_ICON_STYLE = {
  fill: 'none',
  stroke: 'rgb(37, 99, 235)',
  'stroke-width': '1.8px',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

describe('bakeSvgPresentation', () => {
  it('bakes CSS-only paint onto an attribute-less icon (root and shapes)', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="6.5" width="16" height="13" rx="2"/><path d="M4 10.5h16"/></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({
        svg: OUTLINE_ICON_STYLE,
        rect: OUTLINE_ICON_STYLE,
        path: OUTLINE_ICON_STYLE,
      }),
    );

    for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
      expect(el.getAttribute('stroke')).toBe('rgb(37, 99, 235)');
      expect(el.getAttribute('fill')).toBe('none');
      expect(el.getAttribute('stroke-linecap')).toBe('round');
      expect(el.getAttribute('stroke-linejoin')).toBe('round');
    }
  });

  it('strips the px unit from stroke-width', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ svg: { 'stroke-width': '1.8px' }, path: { 'stroke-width': '2px' } }),
    );

    expect(clone.getAttribute('stroke-width')).toBe('1.8');
    expect(clone.querySelector('path')!.getAttribute('stroke-width')).toBe('2');
  });

  it('gives a diverging child its own value, not the root value', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/><circle cx="5" cy="5" r="2"/></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({
        svg: { fill: 'none' },
        path: { fill: 'none' },
        circle: { fill: 'rgb(255, 0, 0)' },
      }),
    );

    expect(clone.querySelector('path')!.getAttribute('fill')).toBe('none');
    expect(clone.querySelector('circle')!.getAttribute('fill')).toBe('rgb(255, 0, 0)');
  });

  it('rewrites an existing attribute the CSS overrode — computed is the truth', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" fill="red"/></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ svg: {}, path: { fill: 'rgb(37, 99, 235)' } }),
    );

    expect(clone.querySelector('path')!.getAttribute('fill')).toBe('rgb(37, 99, 235)');
  });

  it('never writes an attribute for an empty computed value', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>',
    );

    bakeSvgPresentation(original, clone, styleByTag({}));

    expect(clone.hasAttribute('fill')).toBe(false);
    expect(clone.querySelector('path')!.hasAttribute('stroke')).toBe(false);
  });

  it('mutates only the clone, never the live element', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>',
    );

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ svg: OUTLINE_ICON_STYLE, path: OUTLINE_ICON_STYLE }),
    );

    expect(original.hasAttribute('stroke')).toBe(false);
    expect(original.querySelector('path')!.hasAttribute('fill')).toBe(false);
    expect(clone.getAttribute('stroke')).toBe('rgb(37, 99, 235)');
  });

  it('survives a clone/original element-count mismatch without throwing', () => {
    const { original, clone } = makeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>',
    );
    clone.querySelector('path')!.remove();

    expect(() =>
      bakeSvgPresentation(original, clone, styleByTag({ svg: OUTLINE_ICON_STYLE })),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Gradient stops — stripe.com
// ---------------------------------------------------------------------------

/**
 * stripe.com's gradient icons colour their stops through CSS custom properties
 * scoped to the <svg> itself:
 *
 *   <stop stop-color="var(--icon-gradient-start)">
 *
 * Figma's SVG parser has no variable resolution, so an unbaked stop imported as
 * black and the whole icon with it. The browser resolves it — getComputedStyle
 * on the stop returns the real colour — so the bake has to carry stop-color too.
 */
describe('bakeSvgPresentation — gradient stops', () => {
  const GRADIENT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="url(#g)" d="M0 0h24v24H0z"/>' +
    '<defs><linearGradient id="g">' +
    '<stop stop-color="var(--icon-gradient-start)"/>' +
    '<stop offset="1" stop-color="var(--icon-gradient-end)"/>' +
    '</linearGradient></defs></svg>';

  it('bakes the resolved stop-color, replacing the var() reference', () => {
    const { original, clone } = makeSvg(GRADIENT_SVG);

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ stop: { 'stop-color': 'rgb(127, 125, 252)', 'stop-opacity': '1' } }),
    );

    for (const stop of Array.from(clone.querySelectorAll('stop'))) {
      expect(stop.getAttribute('stop-color')).toBe('rgb(127, 125, 252)');
    }
    expect(clone.outerHTML).not.toContain('var(--icon-gradient');
  });

  it('bakes stop-opacity as well', () => {
    const { original, clone } = makeSvg(GRADIENT_SVG);

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({ stop: { 'stop-color': 'rgb(1, 2, 3)', 'stop-opacity': '0.5' } }),
    );

    expect(clone.querySelector('stop')?.getAttribute('stop-opacity')).toBe('0.5');
  });

  it('never writes stop-color onto an element that is not a stop', () => {
    // getComputedStyle answers stop-color on ANY element — with the initial
    // black. Writing it everywhere would put `stop-color="rgb(0, 0, 0)"` on 7
    // of this icon's 10 elements: pure noise in the payload.
    const { original, clone } = makeSvg(GRADIENT_SVG);

    bakeSvgPresentation(
      original,
      clone,
      // Every tag reports the property, exactly as the browser does.
      styleByTag({
        svg: { 'stop-color': 'rgb(0, 0, 0)' },
        path: { 'stop-color': 'rgb(0, 0, 0)' },
        defs: { 'stop-color': 'rgb(0, 0, 0)' },
        lineargradient: { 'stop-color': 'rgb(0, 0, 0)' },
        stop: { 'stop-color': 'rgb(127, 125, 252)' },
      }),
    );

    for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
      if (el.tagName.toLowerCase() === 'stop') continue;
      expect(el.hasAttribute('stop-color')).toBe(false);
    }
  });

  it('still bakes the ordinary paint properties on every element', () => {
    const { original, clone } = makeSvg(GRADIENT_SVG);

    bakeSvgPresentation(
      original,
      clone,
      styleByTag({
        svg: OUTLINE_ICON_STYLE,
        path: OUTLINE_ICON_STYLE,
        stop: { 'stop-color': 'rgb(1, 2, 3)' },
      }),
    );

    expect(clone.querySelector('path')?.getAttribute('stroke')).toBe('rgb(37, 99, 235)');
    expect(clone.getAttribute('fill')).toBe('none');
  });
});
