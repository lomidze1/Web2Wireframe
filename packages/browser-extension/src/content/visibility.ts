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
 */
export function isOffscreen(rect: DOMRect, viewportWidth: number, _viewportHeight: number): boolean {
  // Completely to the right of viewport
  if (rect.left >= viewportWidth) return true;
  // Completely below viewport (but we capture full scroll height, so don't filter by Y)
  // Completely to the left
  if (rect.right <= 0) return true;

  return false;
}
