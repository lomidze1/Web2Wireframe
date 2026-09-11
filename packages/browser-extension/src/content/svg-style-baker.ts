/**
 * Bake computed SVG paint into a detached clone's markup.
 *
 * Inline <svg> icons are routinely painted by page CSS rather than by markup
 * attributes (`.icon svg { stroke: #2563eb; fill: none }` — Lucide, Feather,
 * Heroicons outline, web2wireframe.design's own hero icons). Extraction ships
 * `clone.outerHTML`; the CSS rule stays on the page, so Figma's
 * createNodeFromSvg falls back to the SVG spec defaults — `fill: black`,
 * `stroke: none` — turning outline icons into black blobs and erasing open
 * strokes entirely.
 *
 * The fix is h2d's: at capture time, read each element's COMPUTED paint (which
 * already resolves the cascade, `currentColor`, and inheritance) and write it
 * onto the clone as presentation attributes, making the markup self-contained.
 *
 * Presentation attributes — not a `style=""` attribute — on purpose: the
 * plugin's icon-library dedup (svgLibrary.normalizeSvg) strips exactly these
 * attributes before hashing, so color variants of one shape keep collapsing
 * into a single component, unchanged.
 */

/** Paint-critical properties, in the order they're written. */
const PRESENTATION_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
] as const;

/**
 * Paint carried only by a `<stop>`.
 *
 * stripe.com colours its gradient icons through CSS custom properties scoped to
 * the `<svg>` (`stop-color: var(--icon-gradient-start)`), and Figma's SVG parser
 * has no variable resolution — an unbaked stop imports as black and takes the
 * whole icon with it.
 *
 * Kept apart from {@link PRESENTATION_PROPS} because `getComputedStyle` answers
 * `stop-color` on ANY element, with the initial black: baking it everywhere put
 * `stop-color="rgb(0, 0, 0)"` on 7 of one icon's 10 elements — noise in every
 * payload, for nothing.
 */
const STOP_PROPS = ['stop-color', 'stop-opacity'] as const;

/**
 * Type size, which only a text element can use.
 *
 * A relative `font-size` is meaningless without a CSS context and Figma's SVG
 * parser has none — it reads the number and drops the unit. stripe.com's "Sign
 * in" button is a knockout mask whose label is `font-size="1em"`, and it
 * imported at fontSize 1: a 3.28 × 0.38px sliver where h2d gets 45 × 17 at 14.
 * The computed value is already absolute, so baking it is the whole fix.
 *
 * Kept apart from {@link PRESENTATION_PROPS} for the same reason as
 * {@link STOP_PROPS}: `getComputedStyle` answers `font-size` on ANY element, so
 * baking it everywhere would hang an attribute on every shape of every icon for
 * nothing.
 */
const TEXT_PROPS = ['font-size'] as const;

/** Elements that render glyphs, i.e. the ones {@link TEXT_PROPS} applies to. */
const TEXT_TAGS = new Set(['text', 'tspan', 'textpath']);

/**
 * Copy the computed values of {@link PRESENTATION_PROPS} from every element of
 * `original` onto the corresponding element of `clone`.
 *
 * `original` and `clone` are walked in lockstep — a deep clone preserves
 * element order 1:1, so index N of `querySelectorAll('*')` matches on both
 * sides. Only the clone is mutated; the live DOM is never touched.
 *
 * `getStyle` defaults to `getComputedStyle` and exists as a parameter so unit
 * tests can supply exact computed values.
 */
export function bakeSvgPresentation(
  original: SVGElement,
  clone: SVGElement,
  getStyle: (el: Element) => CSSStyleDeclaration = (el) => getComputedStyle(el),
): void {
  const sources = [original, ...Array.from(original.querySelectorAll('*'))];
  const targets = [clone, ...Array.from(clone.querySelectorAll('*'))];
  const count = Math.min(sources.length, targets.length);

  for (let i = 0; i < count; i++) {
    let style: CSSStyleDeclaration;
    try {
      style = getStyle(sources[i]);
    } catch {
      continue; // detached/foreign node — leave this element as captured
    }
    for (const prop of PRESENTATION_PROPS) {
      const value = style.getPropertyValue(prop);
      if (!value) continue;
      // Computed stroke-width carries a unit ("1.8px"); the presentation
      // attribute wants the bare number.
      const attrValue =
        prop === 'stroke-width' ? value.replace(/px$/, '') : value;
      targets[i].setAttribute(prop, attrValue);
    }
    const tag = sources[i].tagName.toLowerCase();
    if (tag === 'stop') {
      for (const prop of STOP_PROPS) {
        const value = style.getPropertyValue(prop);
        if (value) targets[i].setAttribute(prop, value);
      }
    }
    if (TEXT_TAGS.has(tag)) {
      for (const prop of TEXT_PROPS) {
        const value = style.getPropertyValue(prop);
        if (value) targets[i].setAttribute(prop, value);
      }
    }
  }
}
