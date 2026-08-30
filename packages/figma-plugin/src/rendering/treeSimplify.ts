/**
 * Tree simplification — discrete post-passes over the converted tree.
 *
 * `convertW2WToWireframe` is a single recursive descent, so every decision it
 * takes is local: it cannot know that once a child collapses, the PARENT has
 * become collapsible. h2d instead runs discrete passes over a materialized
 * descriptor tree — build (`S3`) → drop (`l8`, app.js:40341) → merge to a
 * fixpoint (`y3`/`g8`, app.js:40845/40858) → name (`iq`) — and restarts its
 * merge loop whenever a child is dropped or spliced. That difference is the
 * root cause of our extra layers.
 *
 * This module is the drop + merge half of that pipeline:
 *
 *   dropUselessNodes()          h2d `l8`  — delete nodes carrying no information
 *   collapseSingleChildFrames() h2d `h8`/`Oj` — fold a parent into its only child
 *   mergeInlineTextRuns()       h2d `_j`  — join adjacent inline TEXT siblings
 *                                           (rendering/textRunMerge.ts)
 *   simplifyTree()              h2d `y3`/`g8` — all three, to a fixpoint
 *
 * ## The neutrality rule
 *
 * Figma paints a frame as `fills → strokes → children`. Merging parent P into
 * its only child C therefore changes the paint order from
 *
 *     P.fills, P.strokes, C.fills, C.strokes, C.children
 *
 * to
 *
 *     [P.fills … C.fills], merged.strokes, C.children
 *
 * which is pixel-identical when EITHER P has no strokes (merged strokes are
 * C's) OR C has neither fills nor strokes (merged strokes are P's). Every
 * guard below follows from that identity rather than from a tolerance: h2d's
 * "child is fully opaque" test is unnecessary once P's fills are unshifted
 * BEHIND C's, but their "P's strokes replace C's" needs the extra condition to
 * stay neutral, so we require it.
 *
 * A pass returns `true` when it changed the tree — that is what drives the
 * fixpoint loop.
 */

import type { WireframeNode, FigmaStroke } from "../types";
import { chainNames } from "./naming";
import { mergeInlineTextRuns } from "./textRunMerge";
import { logger } from "../utils/logger";

/** Global geometry epsilon — h2d's `fe` (app.js:39782), as in css-converter. */
const GEOMETRY_EPSILON = 0.51;

/** Below this, a box contributes no flow space worth preserving. */
const SLIVER = 0.5;

/** Below this, a box is degenerate — h2d's `l8` size test. */
const DEGENERATE = 0.01;

/** Bound on the fixpoint loop. Real pages settle in one or two sweeps. */
const MAX_SWEEPS = 8;

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** Anything that puts pixels on the node's own box (Figma-ready or legacy). */
function paintsSomething(n: WireframeNode): boolean {
  return (
    (n.fills?.length ?? 0) > 0 ||
    (n.strokes?.length ?? 0) > 0 ||
    (n.effects?.length ?? 0) > 0 ||
    n.backgroundColor != null ||
    n.backgroundGradient != null ||
    (n.borderColor != null && (n.borderWidth ?? 0) > 0)
  );
}

/**
 * Text, an image or an SVG payload — content that only this node can render.
 * Never dropped, never collapsed away (see the module contract).
 */
function carriesContent(n: WireframeNode): boolean {
  return (
    n.type === "text" ||
    n.type === "placeholder" ||
    n.isPlaceholder === true ||
    !!n.imageUrl ||
    !!n.computedStyles?.svgMarkup ||
    !!n.textContent?.trim() ||
    (n.textFills?.length ?? 0) > 0
  );
}

/** Same rule as nodes.ts `cssOverflowClips` — a clipping box is doing work. */
function clips(n: WireframeNode): boolean {
  const o = n.overflow;
  return o === "hidden" || o === "scroll" || o === "auto";
}

function hasStrokePosition(n: WireframeNode, position: FigmaStroke["position"]): boolean {
  return !!n.strokes?.some((s) => s.position === position);
}

/** Hover variants / ComponentSet boundaries — identity we must not disturb. */
function carriesHoverIdentity(n: WireframeNode): boolean {
  return (
    (n.pseudoStateStyles != null &&
      Object.keys(n.pseudoStateStyles).length > 0) ||
    n.isHiddenInDefault === true
  );
}

// ---------------------------------------------------------------------------
// Drop pass — h2d `l8` (app.js:40341)
// ---------------------------------------------------------------------------

/**
 * Should this node be deleted outright?
 *
 * Guards first (they veto every rule), then the three drop rules.
 */
function isUseless(n: WireframeNode): boolean {
  // --- guards -------------------------------------------------------------
  if (clips(n)) return false;
  if (hasStrokePosition(n, "OUTSIDE")) return false;
  if (carriesHoverIdentity(n)) return false;
  // TEXT carries content by definition, so the fontSize rule below has to run
  // before the content guard; every other content carrier is protected.
  if (n.type !== "text" && carriesContent(n)) return false;

  // --- rule 1: text that renders no glyphs --------------------------------
  if (n.type === "text") return n.fontSize === 0;

  // Anything with surviving children keeps its box: the children hang off it.
  // Bottom-up ordering means droppable children are already gone by now, so
  // a wrapper that emptied out still becomes eligible on this same sweep.
  if (n.children.length > 0) return false;

  // --- rule 2: degenerate box ---------------------------------------------
  if (n.width < DEGENERATE || n.height < DEGENERATE) return true;

  // --- rule 3: paints nothing, holds nothing ------------------------------
  // Narrowed against h2d, which drops every such node: an empty box at real
  // size still occupies flow space AND one `itemSpacing` gap in a Figma
  // auto-layout parent, so deleting it shifts every later sibling. Only
  // slivers — too thin to hold a meaningful slot — are safe.
  //
  // The out-of-flow case (absolute/fixed, so no flow slot at all) would also
  // be safe to drop and h2d does drop it, but it is deliberately NOT taken:
  // it is worth 5 nodes out of 2438 on stripe.com, and an unpainted fixed
  // overlay is more often a signal that extraction lost the element's paint
  // than genuine noise. Deleting it would hide that.
  if (paintsSomething(n)) return false;
  return n.width < SLIVER || n.height < SLIVER;
}

/**
 * Delete useless nodes, bottom-up. The root is never dropped — it is the
 * frame the whole import hangs from.
 *
 * Returns true when anything was removed.
 */
export function dropUselessNodes(root: WireframeNode): boolean {
  let changed = false;

  const visit = (n: WireframeNode): void => {
    for (const child of n.children) visit(child);
    const kept = n.children.filter((c) => !isUseless(c));
    if (kept.length !== n.children.length) {
      n.children = kept;
      changed = true;
    }
  };

  visit(root);
  return changed;
}

// ---------------------------------------------------------------------------
// Single-child collapse — h2d `h8` (app.js:39992) + `Oj` (app.js:40408)
// ---------------------------------------------------------------------------

const near = (a: number, b: number): boolean =>
  Math.abs(a - b) <= GEOMETRY_EPSILON;

/** Does the child's box coincide with the parent's, within the epsilon? */
function childExactlyFills(parent: WireframeNode, child: WireframeNode): boolean {
  return (
    near(child.x, 0) &&
    near(child.y, 0) &&
    near(child.width, parent.width) &&
    near(child.height, parent.height)
  );
}

function normalizedBlend(n: WireframeNode): string {
  const b = n.blendMode;
  return !b || b === "normal" || b === "pass-through" ? "normal" : b;
}

type Radius = WireframeNode["borderRadius"];

function radiusIsZero(r: Radius): boolean {
  if (typeof r === "number") return r === 0;
  return (
    r.topLeft === 0 && r.topRight === 0 && r.bottomRight === 0 && r.bottomLeft === 0
  );
}

function sameRadius(a: Radius, b: Radius): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "number") return radiusIsZero(b) && a === 0;
  if (typeof b === "number") return radiusIsZero(a) && b === 0;
  return (
    a.topLeft === b.topLeft &&
    a.topRight === b.topRight &&
    a.bottomRight === b.bottomRight &&
    a.bottomLeft === b.bottomLeft
  );
}

/**
 * The merged node carries ONE corner radius, so the collapse is only neutral
 * when the discarded radius was invisible: the radii already agree, or the
 * side losing its radius neither paints nor clips (a radius with nothing to
 * round and nothing to clip renders identically at any value).
 *
 * Returns the radius the merged node must use, or null when ambiguous.
 */
function resolveRadius(parent: WireframeNode, child: WireframeNode): Radius | null {
  if (sameRadius(parent.borderRadius, child.borderRadius)) return child.borderRadius;
  if (!paintsSomething(parent) && !clips(parent)) return child.borderRadius;
  if (!paintsSomething(child) && !clips(child)) return parent.borderRadius;
  return null;
}

/**
 * May `parent` be folded into its single `child`?
 *
 * Every condition is a consequence of the paint-order identity in the module
 * header, or protects an identity the renderer keys off downstream.
 */
function canCollapse(parent: WireframeNode, child: WireframeNode): boolean {
  if (parent.children.length !== 1) return false;
  if (!childExactlyFills(parent, child)) return false;

  // The survivor must be a plain frame: text/image/svg payloads belong to the
  // node that declared them and must never be merged into another identity.
  if (child.type !== "frame" || carriesContent(child)) return false;

  // Paint-order identity (module header).
  const parentHasStrokes = (parent.strokes?.length ?? 0) > 0;
  if (parentHasStrokes) {
    if ((child.fills?.length ?? 0) > 0 || (child.strokes?.length ?? 0) > 0) return false;
    // An OUTSIDE stroke paints beyond the box; it would still land on the same
    // box after the merge, but only if nothing else about the box changes.
    // Cheaper to refuse than to prove.
    if (hasStrokePosition(parent, "OUTSIDE")) return false;
  }

  // A parent effect wraps the parent's whole subtree; after the merge it would
  // apply to a different fill stack. h2d refuses this too.
  if ((parent.effects?.length ?? 0) > 0) return false;

  if (normalizedBlend(parent) !== "normal" || normalizedBlend(child) !== "normal") {
    return false;
  }

  if (resolveRadius(parent, child) === null) return false;

  // Geometry we cannot recompose: a transform is applied around the node's own
  // measured box, and `transform` is only ever set for a non-identity one
  // (parseCssTransform early-outs on near-identity).
  if (parent.transform != null || child.transform != null) return false;

  // nodes.ts wraps a margined child in a `:margin` frame — collapsing would
  // change which box that wrapper insets.
  const m = child.margin;
  if (m && (m.top || m.right || m.bottom || m.left)) return false;

  // Identities the renderer keys off: hover variants, and the fixed/sticky
  // markers that drive root re-parenting.
  if (carriesHoverIdentity(parent) || carriesHoverIdentity(child)) return false;
  for (const n of [parent, child]) {
    if (n.position === "fixed" || n.position === "sticky") return false;
  }

  // h2d's `__isNameSemantic` guard: a node with an element-level identity keeps
  // its own frame once it holds more than one child. The single-child
  // requirement above already makes this unreachable, and the test suite pins
  // that — kept explicit so the invariant is visible if the rule ever loosens.
  if (parent.name && parent.children.length > 1) return false;

  return true;
}

/** Tags with no identity of their own — h2d's generic containers. */
const GENERIC_TAGS = new Set(["div", "span"]);

/** Union of two class lists, order preserved, duplicates removed. */
function mergeClassNames(a: string | undefined, b: string | undefined): string | undefined {
  const parts = `${a ?? ""} ${b ?? ""}`.split(/\s+/).filter(Boolean);
  const seen = new Set(parts);
  return seen.size > 0 ? Array.from(seen).join(" ") : undefined;
}

/**
 * Fold `parent` into its only child (h2d `Oj`): the child survives and the
 * parent's box properties are transplanted onto it. Returns the survivor.
 */
function transplant(parent: WireframeNode, child: WireframeNode): WireframeNode {
  const radius = resolveRadius(parent, child);

  // Fills: the parent's go BEHIND the child's — same z-order as the two
  // stacked frames rendered before the merge.
  const parentFills = parent.fills ?? [];
  const childFills = child.fills ?? [];
  if (parentFills.length > 0) {
    child.fills = [...parentFills, ...childFills];
  }
  if (!child.backgroundColor) child.backgroundColor = parent.backgroundColor;
  if (!child.backgroundGradient) child.backgroundGradient = parent.backgroundGradient;

  // Strokes: guarded above so at most one side has them.
  if ((parent.strokes?.length ?? 0) > 0) {
    child.strokes = parent.strokes;
    child.borderColor = parent.borderColor;
    child.borderWidth = parent.borderWidth;
  }

  child.opacity = parent.opacity * child.opacity;
  if (radius !== null) child.borderRadius = radius;

  // Clipping: the boxes coincide, so clipping at either level clips the same
  // pixels — the merged node clips when either did.
  if (clips(parent) && !clips(child)) child.overflow = parent.overflow;

  // Position accumulates: the child was placed relative to the parent.
  child.x = parent.x + child.x;
  child.y = parent.y + child.y;

  // Outer-layout identity: the merged node now sits in the GRANDPARENT's
  // layout, so it must present the parent's constraints, not the child's.
  child.position = parent.position;
  child.zIndex = parent.zIndex;
  child.cssOrder = parent.cssOrder;
  child.margin = parent.margin;
  child.alignSelf = parent.alignSelf;
  child.horizontallyCentered = parent.horizontallyCentered;
  child.layoutGrow = parent.layoutGrow;
  child.layoutAlign = parent.layoutAlign;
  child.layoutSizingHorizontal = parent.layoutSizingHorizontal;
  child.layoutSizingVertical = parent.layoutSizingVertical;
  child.gridColumnStart = parent.gridColumnStart;
  child.gridColumnEnd = parent.gridColumnEnd;
  child.gridRowStart = parent.gridRowStart;
  child.gridRowEnd = parent.gridRowEnd;
  child.cssMaxWidth = parent.cssMaxWidth ?? child.cssMaxWidth;
  child.cssMinWidth = parent.cssMinWidth ?? child.cssMinWidth;
  child.cssMinHeight = parent.cssMinHeight ?? child.cssMinHeight;
  child.cssMaxHeight = parent.cssMaxHeight ?? child.cssMaxHeight;
  child.href = child.href ?? parent.href;
  // The merged node IS the <a>, so it keeps the click target too — folding an
  // icon link's wrapper must not drop its only way to be clickable.
  child.linkReactionUrl = child.linkReactionUrl ?? parent.linkReactionUrl;
  child.linkAnchorId = child.linkAnchorId ?? parent.linkAnchorId;
  // The merged node IS both elements, so it answers to either one's `id` — an
  // `#anchor` pointing at the folded-away wrapper must still find a target.
  child.anchorId = child.anchorId ?? parent.anchorId;
  child.needsCursorPointer = child.needsCursorPointer ?? parent.needsCursorPointer;
  child.constrainProportions = child.constrainProportions ?? parent.constrainProportions;

  // The merged node genuinely IS both elements, so it answers to both class
  // lists. nodes.ts feeds `tag` + `className` into the plugin-palette colour
  // heuristics (convertFillsToPaints, getSmartTextColor); dropping the
  // parent's half would silently change those colours.
  child.className = mergeClassNames(parent.className, child.className);
  // One tag has to win. The innermost identity wins — same rule chainNames
  // uses — except when it is a generic container and the parent's is not, so
  // `<nav><div>…</div></nav>` still reads as a nav downstream.
  if (GENERIC_TAGS.has(child.tag) && !GENERIC_TAGS.has(parent.tag)) {
    child.tag = parent.tag;
  }

  // Names merge the h2d way (`List → Item → Link`). Both may still be empty
  // here — this pass runs before stage-2 role naming, which fills them in.
  child.name = chainNames([parent.name, child.name]);

  return child;
}

/**
 * Fold every collapsible parent into its only child, bottom-up.
 * Returns true when anything collapsed.
 */
export function collapseSingleChildFrames(root: WireframeNode): boolean {
  let changed = false;

  const visit = (n: WireframeNode): void => {
    for (const child of n.children) visit(child);
    n.children = n.children.map((child) => {
      if (child.children.length !== 1) return child;
      const only = child.children[0];
      if (!canCollapse(child, only)) return child;
      changed = true;
      return transplant(child, only);
    });
  };

  // The root itself is never folded away — the import hangs from it — but its
  // descendants are, which `visit` covers.
  visit(root);
  return changed;
}

// ---------------------------------------------------------------------------
// Fixpoint — h2d `y3` / `g8` (app.js:40845 / 40858)
// ---------------------------------------------------------------------------

function countNodes(n: WireframeNode): number {
  let total = 1;
  for (const c of n.children) total += countNodes(c);
  return total;
}

/**
 * Run the drop, collapse and text-merge passes until a full sweep changes
 * nothing.
 *
 * This is what MULTIPLIES the two passes: without it, every collapse unlocks a
 * parent collapse that is then never attempted. Both passes are bottom-up, so
 * one sweep already reaches most of the fixpoint; the loop catches the cases
 * where a drop re-opens a collapse (or vice versa) in an ancestor already
 * visited.
 *
 * Bounded at {@link MAX_SWEEPS} so a rule that oscillates is visible in the
 * log instead of hanging the import.
 */
export function simplifyTree(root: WireframeNode): void {
  const before = countNodes(root);
  let sweeps = 0;

  for (let i = 0; i < MAX_SWEEPS; i++) {
    sweeps = i + 1;
    const dropped = dropUselessNodes(root);
    const collapsed = collapseSingleChildFrames(root);
    // Text merge runs LAST in the sweep — h2d's ordering, and the only one
    // that works: two runs separated by a wrapper frame become siblings the
    // moment `collapseSingleChildFrames` dissolves it, and the next sweep
    // joins them.
    const merged = mergeInlineTextRuns(root);
    if (!dropped && !collapsed && !merged) break;
  }

  const after = countNodes(root);
  if (sweeps >= MAX_SWEEPS) {
    logger.warn("Tree simplify hit the sweep cap", { sweeps, before, after });
  } else {
    logger.info("Tree simplify", { sweeps, before, after, removed: before - after });
  }
}
