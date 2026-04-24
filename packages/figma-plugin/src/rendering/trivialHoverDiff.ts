/**
 * Trivial-hover-diff filter (h2d-parity).
 *
 * A hover diff is "trivial" when it contains no property that produces a
 * visible change on the rendered element. Most commonly this happens on
 * image-card anchors (`a.tile-link`) where the cascade resolves hover and
 * base to identical styles for every paintable property — the only
 * surviving diff keys are cursor, pointer-events, user-select, or a
 * text-decoration-line override that matches the base (apple.com
 * `.tile-link:hover { text-decoration-line: none }` with base also none).
 *
 * When a diff is trivial we DO NOT create a hover variant. The element
 * still gets marked as interactive (see `needsCursorPointer`) so nodes.ts
 * can attach a self-referencing ON_HOVER reaction and Figma Preview shows
 * cursor:pointer — matching h2d's behavior without ghost ComponentSets.
 */

/** CSS props whose presence alone never produces a visible delta. */
const TRIVIAL_PROPS = new Set([
  "cursor",
  "pointer-events",
  "user-select",
  "-webkit-user-select",
  "-moz-user-select",
  "touch-action",
  "will-change",
  "caret-color",
]);

/**
 * Returns true when every key in the diff is either:
 *   - in TRIVIAL_PROPS, OR
 *   - `text-decoration-line: none` (non-change for elements whose base
 *     already has no underline — common on image anchors), OR
 *   - `opacity: 1` (base is the Figma default).
 *
 * An empty diff counts as trivial (nothing visible to render).
 */
export function isTrivialHoverDiff(diff: Record<string, string>): boolean {
  const keys = Object.keys(diff);
  if (keys.length === 0) return true;

  for (const key of keys) {
    if (TRIVIAL_PROPS.has(key)) continue;
    // text-decoration-line: none — apple .tile-link pattern. The DIFF
    // layer doesn't know the base value, but `none` is the CSS default
    // for <a> inside most contexts except bare `<a>` with user-agent
    // underlines. For safety we treat it as trivial only when it's the
    // SOLE change (so `none + color:red` still counts as real).
    if (key === "text-decoration-line" && diff[key] === "none" && keys.length === 1) continue;
    // opacity: 1 matches the Figma default — no visible delta.
    if (key === "opacity" && parseFloat(diff[key]) >= 0.99 && keys.length === 1) continue;
    // Any other key is a real visual change.
    return false;
  }

  return true;
}
