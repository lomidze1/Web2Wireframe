/**
 * Visibility filtering for DOM extraction.
 *
 * 1. display: none → skip
 * 2. No offsetParent + zero size → skip (except body/html/fixed/sticky)
 * 3. overflow: hidden + size < 1px → skip
 * 4. clip: rect(0,0,0,0) → skip
 * 5. clipPath: inset(50%+) → skip
 */

/** Tags to skip entirely during DOM traversal (non-visual) */
export const SKIP_TAGS = new Set([
  'script', 'style', 'meta', 'noscript', 'link', 'head', 'title',
  'br', 'base', 'template', 'dialog', 'colgroup', 'col', 'datalist',
]);

/**
 * Check if an element should be skipped during extraction.
 * Returns true if the element is invisible/non-visual.
 */
export function isHidden(el: HTMLElement): boolean {
  const computed = getComputedStyle(el);

  // 1. display: none
  if (computed.display === 'none') return true;

  // display: contents elements have no box but their children are visible
  if (computed.display === 'contents') return false;

  // 2. visibility: hidden (still takes space, but content invisible)
  //    We keep these to preserve layout spacing

  // 3. No offsetParent + zero size (but not body/html/fixed/sticky/inline with text)
  const tag = el.tagName.toLowerCase();
  if (tag !== 'body' && tag !== 'html') {
    const pos = computed.position;
    const display = computed.display;
    if (pos !== 'fixed' && pos !== 'sticky') {
      if (el.offsetParent === null) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          // Allow inline elements with text content (e.g. <span>/month</span>)
          const isInline = display === 'inline' || display === 'inline-block';
          if (!isInline || !el.textContent?.trim()) return true;
        }
      }
    }
  }

  // 4. overflow: hidden + tiny size (< 1px)
  if (computed.overflow === 'hidden' || computed.overflow === 'hidden hidden') {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return true;
  }

  // 5. Clip-based hiding patterns (screen-reader-only)
  const clipPath = computed.clipPath;
  if (clipPath) {
    if (isHiddenByClipPath(clipPath)) return true;
  }

  // Legacy clip: rect(0, 0, 0, 0)
  const clip = (computed as unknown as Record<string, string>).clip;
  if (clip && clip !== 'auto') {
    if (clip === 'rect(0px, 0px, 0px, 0px)' || clip === 'rect(0, 0, 0, 0)') {
      return true;
    }
  }

  return false;
}

/**
 * Check if clipPath value hides the element completely.
 * Common patterns: inset(50%), inset(100%), inset(0px 0px 99.9% 99.9%)
 */
function isHiddenByClipPath(clipPath: string): boolean {
  if (!clipPath.startsWith('inset(')) return false;

  const match = clipPath.match(/^inset\((.+)\)$/);
  if (!match) return false;

  const values = match[1].split(/\s+/);

  // inset(50%) or inset(100%)
  if (values.length === 1) {
    const val = parseFloat(values[0]);
    if (values[0].endsWith('%') && val >= 50) return true;
  }

  // inset(0px 0px 99.9% 99.9%) — almost entirely clipped
  if (values.length === 4) {
    const v3 = parseFloat(values[2]);
    const v4 = parseFloat(values[3]);
    if (values[2].endsWith('%') && values[3].endsWith('%') && v3 >= 99 && v4 >= 99) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an element is outside the viewport bounds.
 * Elements completely off-screen are skipped.
 *
 * Purely geometric. Content parked outside the viewport by a horizontal
 * scroller (carousel slides) is exempt from culling, but that exemption is
 * NOT decided here — the traversal carries it down from the scroll container
 * itself (see `isHorizontalScrollContainer`). Deciding it per element, by
 * walking ancestors, made survival depend on how deeply a node happened to be
 * nested: a slide's `<div class="price">` was kept while the `<span>` holding
 * the actual number, one level deeper, was culled — leaving empty price boxes.
 */
export function isOffscreen(rect: DOMRect, viewportWidth: number): boolean {
  // Completely to the right of the viewport
  if (rect.left >= viewportWidth) return true;
  // Completely below viewport (but we capture full scroll height, so don't filter by Y)
  // Completely to the left (strict: zero-width elements at x=0 are NOT offscreen)
  if (rect.right < 0) return true;

  return false;
}

/**
 * Is this element a horizontally scrollable/clipping container — i.e. a
 * carousel or slider viewport whose content extends past its own box?
 *
 * Everything inside such a container is real page content reachable by
 * scrolling (or by the slider's own transform), so the traversal stops
 * viewport-culling once it enters one.
 *
 * `<html>`/`<body>` are excluded: `body { overflow-x: hidden }` is a
 * near-universal "kill horizontal scroll" guard, and treating it as a scroller
 * would disable culling for the entire page and drag every off-canvas menu
 * into the capture.
 */
export function isHorizontalScrollContainer(
  el: Element,
  computed: CSSStyleDeclaration,
): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return false;

  const ox = computed.overflowX;
  if (ox !== 'auto' && ox !== 'scroll' && ox !== 'hidden') return false;

  return el.scrollWidth > el.clientWidth + 1;
}
