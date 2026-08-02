/**
 * Post-render orphan sweep.
 *
 * `figma.createFrame()` auto-parents new frames to `figma.currentPage`. Every
 * render path that creates a frame and re-parents it later (child loops,
 * margin wrappers, hover-master intermediates in hoverConsolidation) can leak
 * a page-root orphan when an exception or a silently-failing `remove()` lands
 * between creation and append — telex.ge imports left a dozen empty
 * "div#product_labels_update_*" frames at (0,0).
 *
 * The sweep runs after the render finishes: any page-root FRAME that (a) did
 * not exist before the render, (b) is not one of the nodes we deliberately
 * keep (wireframe Section, Components Section), and (c) carries an
 * element-derived name (getNodeName produces `tag`, `tag#id` or `tag.class`)
 * or the explicit `__w2w-orphan` marker, is a render leak and is removed.
 * The name check keeps anything a user might have created mid-render (Figma
 * default names like "Frame 12" don't match).
 */

/** Minimal structural surface the sweep needs — keeps unit tests figma-free. */
export interface SweepCandidate {
  id: string;
  name: string;
  type: string;
}

const HTML_TAGS =
  "div|span|section|header|footer|nav|main|aside|ul|ol|li|a|button|img|svg|p|" +
  "h[1-6]|i|b|em|strong|small|form|input|label|select|textarea|table|thead|" +
  "tbody|tr|td|th|figure|figcaption|article|picture|video|audio|iframe|body|html";

// `div`, `div#some-id`, `div.some-class`, plus the explicit orphan marker.
const ELEMENT_NAME_RE = new RegExp(`^(?:__w2w-orphan$|(?:${HTML_TAGS})(?:[.#][^\\s].*)?$)`);

/** True when a layer name looks like a converter-generated element name. */
export function isElementDerivedName(name: string): boolean {
  return ELEMENT_NAME_RE.test(name);
}

/**
 * Return the page-root children that qualify as render orphans.
 * Pure function — the caller removes them.
 */
export function collectRenderOrphans<T extends SweepCandidate>(
  pageChildren: readonly T[],
  preexistingIds: ReadonlySet<string>,
  keepIds: ReadonlySet<string>,
): T[] {
  return pageChildren.filter(
    (c) =>
      c.type === "FRAME" &&
      !preexistingIds.has(c.id) &&
      !keepIds.has(c.id) &&
      isElementDerivedName(c.name),
  );
}
