/**
 * nestElements.ts
 *
 * Turns the AI's flat element list into a containment hierarchy.
 *
 * The screenshot analysis reports every element at top level, including the
 * `section-bg` bands (Hero, Navigation Bar, Footer, …). Rendered as-is, those
 * bands become empty coloured rectangles with their content sitting beside
 * them as siblings — a Footer frame with nothing in it, and the footer's
 * links floating next to it in the layer list.
 *
 * Sections are the only containers created here. Cards and grids already
 * receive whatever children the model nests inside them; re-parenting into
 * them by geometry alone is riskier (they carry auto-layout, so an imprecise
 * box would fight the layout rather than sit where it was measured).
 */

import type { SimplifiedElement } from "./wireframeConverter.js";

/** A section covering more of the page than this wraps everything — it is a
 *  page backdrop, not a section, and must not swallow the whole document. */
const MAX_SECTION_PAGE_RATIO = 0.9;

/** Fraction of a candidate's area that must fall inside a section. Loose
 *  enough for the model's noisy boxes, tight enough that an element merely
 *  grazing a section boundary stays out. */
const MIN_CONTAINMENT = 0.6;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxOf(el: SimplifiedElement): Box {
  return {
    x: Number(el.x) || 0,
    y: Number(el.y) || 0,
    width: Number(el.width) || 0,
    height: Number(el.height) || 0,
  };
}

function area(b: Box): number {
  return Math.max(0, b.width) * Math.max(0, b.height);
}

/** Fraction of `inner` that lies inside `outer`. */
function containment(inner: Box, outer: Box): number {
  const ix = Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x);
  const iy = Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y);
  if (ix <= 0 || iy <= 0) return 0;
  const innerArea = area(inner);
  if (innerArea <= 0) return 0;
  return (ix * iy) / innerArea;
}

function centerInside(inner: Box, outer: Box): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height;
}

/**
 * Nest top-level elements into the smallest `section-bg` that contains them.
 *
 * Child boxes stay in PAGE space — `convertSectionBackground` converts them to
 * parent-relative when it builds the frame, the same way `applyChildBBox` does
 * for card children.
 *
 * Returns the new top-level list. Sections are MUTATED in place (children are
 * appended to `elements`), matching how postProcessAbsoluteResult and
 * shiftResultToPage already treat analysis results. Safe because each viewport
 * converts its own `scaleAbsoluteResult` deep clone — but callers must not
 * hand the same object to two conversions.
 */
export function nestBySections(
  elements: SimplifiedElement[],
  pageHeight: number,
): SimplifiedElement[] {
  const list = elements || [];
  if (list.length < 2) return list;

  const sections = list.filter(
    (el) =>
      el.type === "section-bg" &&
      area(boxOf(el)) > 0 &&
      // A band taller than most of the page is a backdrop, not a section.
      (!(pageHeight > 0) || boxOf(el).height <= pageHeight * MAX_SECTION_PAGE_RATIO),
  );
  if (sections.length === 0) return list;

  // Smallest-first: the first section that accepts an element is the tightest
  // fit, so nested sections win over the band that wraps them.
  const bySizeAsc = [...sections].sort((a, b) => area(boxOf(a)) - area(boxOf(b)));

  const nested = new Set<SimplifiedElement>();

  const findParent = (el: SimplifiedElement): SimplifiedElement | null => {
    const box = boxOf(el);
    for (const candidate of bySizeAsc) {
      if (candidate === el) continue;
      const outer = boxOf(candidate);
      if (area(outer) <= area(box)) continue; // parents must be bigger
      if (!centerInside(box, outer)) continue;
      if (containment(box, outer) < MIN_CONTAINMENT) continue;
      return candidate;
    }
    return null;
  };

  // Resolve every element's parent against the ORIGINAL geometry first, so
  // the outcome doesn't depend on the order things get moved.
  const parentOf = new Map<SimplifiedElement, SimplifiedElement>();
  for (const el of list) {
    const parent = findParent(el);
    if (parent) parentOf.set(el, parent);
  }

  for (const [el, parent] of parentOf) {
    // Guard against a cycle (A inside B inside A) from contradictory boxes.
    let ancestor: SimplifiedElement | undefined = parent;
    let cyclic = false;
    while (ancestor) {
      if (ancestor === el) {
        cyclic = true;
        break;
      }
      ancestor = parentOf.get(ancestor);
    }
    if (cyclic) continue;

    if (!Array.isArray(parent.elements)) parent.elements = [];
    (parent.elements as SimplifiedElement[]).push(el);
    nested.add(el);
  }

  return list.filter((el) => !nested.has(el));
}
