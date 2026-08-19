/**
 * `:margin` wrapper collapse.
 *
 * Figma has no margin, so `createMarginWrapper` (layout.ts) wraps every child
 * with a positive CSS margin in a `{name}:margin` frame whose padding carries
 * that margin. One extra layer per margined element — on iwm.org.uk that was
 * 60 frames of pure noise, and h2d (our fidelity target) emits none.
 *
 * Most of those wrappers are redundant: an auto-layout parent already has
 * `padding` and `itemSpacing`, which express the same spacing when the
 * siblings agree. This pass folds the margin into the parent wherever the
 * fold is *arithmetically identical* to what the wrapper renders today.
 *
 * ## The exactness rule
 *
 * The wrapper model renders exactly these numbers for a parent:
 *
 *   leading gap  = padding.mainStart + margin.mainStart(first)
 *   gap between i-1 and i = itemSpacing + margin.mainEnd(i-1) + margin.mainStart(i)
 *   trailing gap = padding.mainEnd + margin.mainEnd(last)
 *   cross insets = padding.cross ± margin.cross(i)
 *
 * A collapse is admissible only when the post-collapse model reproduces those
 * numbers unchanged, which makes the geometry delta exactly 0 rather than
 * "within tolerance". Anything that does not satisfy it keeps its wrapper —
 * asymmetric and mixed cases are expected to survive.
 *
 * Margins are clamped with `Math.max(0, …)` throughout because
 * `createMarginWrapper` clamps negative padding the same way; a negative
 * margin never contributed spacing in the first place.
 */

import type { WireframeNode } from "../types";

type Sides = { top: number; right: number; bottom: number; left: number };

const clamp = (v: number | undefined): number => Math.max(0, v || 0);

/** Children that participate in auto-layout flow (absolute/fixed do not). */
function flowChildren(parent: WireframeNode): WireframeNode[] {
  return parent.children.filter(
    (c) => c.position !== "absolute" && c.position !== "fixed"
  );
}

/**
 * True when this node renders as an auto-layout frame whose children pass
 * through `applyChildInAutoLayout` — the only place margin wrappers are made.
 * `NONE` counts: nodes.ts falls back to VERTICAL for block containers.
 * `GRID` does not: grid children take a separate path that ignores margin
 * entirely (nodes.ts), so folding it in would ADD spacing that isn't there.
 */
function isAutoLayoutParent(node: WireframeNode): boolean {
  return node.layoutMode !== "GRID";
}

/**
 * A negative margin contributes no spacing (the wrapper clamps its padding to
 * 0), but nodes.ts still folds it into the wrapper's `maxWidth` UNCLAMPED —
 * `cssMaxWidth + margin.left + margin.right`. Collapsing such a child would
 * therefore keep the spacing exact while quietly changing its max width, so
 * the whole parent is left alone. Vanishingly rare in practice: one node in
 * the whole iwm.org.uk capture.
 */
function hasNegativeMargin(child: WireframeNode): boolean {
  const m = child.margin;
  if (!m) return false;
  return m.top < 0 || m.right < 0 || m.bottom < 0 || m.left < 0;
}

/** Drop a margin object that no longer triggers a wrapper. */
function clearIfEmpty(child: WireframeNode): void {
  const m = child.margin;
  if (!m) return;
  if (m.top <= 0 && m.right <= 0 && m.bottom <= 0 && m.left <= 0) {
    child.margin = undefined;
  }
}

// ---------------------------------------------------------------------------
// Rule 1 — sole flow child → parent padding
// ---------------------------------------------------------------------------

/**
 * A lone child's margin is indistinguishable from parent padding: the wrapper
 * sits between the parent's content box and the child on all four sides, which
 * is precisely what padding does. Holds whether the parent HUGs (it grows by
 * the same amount either way) or is FIXED (the child is inset either way).
 */
function collapseSoleChild(parent: WireframeNode, kids: WireframeNode[]): void {
  if (kids.length !== 1) return;
  const child = kids[0];
  const m = child.margin;
  if (!m) return;

  parent.padding = {
    top: parent.padding.top + clamp(m.top),
    right: parent.padding.right + clamp(m.right),
    bottom: parent.padding.bottom + clamp(m.bottom),
    left: parent.padding.left + clamp(m.left),
  };
  child.margin = undefined;
}

// ---------------------------------------------------------------------------
// Rule 2/3 — uniform main-axis spacing → itemSpacing
// ---------------------------------------------------------------------------

/** Per-axis names of the four margin/padding sides, main axis first. */
type Axes = {
  mainStart: keyof Sides;
  mainEnd: keyof Sides;
  crossStart: keyof Sides;
  crossEnd: keyof Sides;
};

const VERTICAL_AXES: Axes = {
  mainStart: "top",
  mainEnd: "bottom",
  crossStart: "left",
  crossEnd: "right",
};

const HORIZONTAL_AXES: Axes = {
  mainStart: "left",
  mainEnd: "right",
  crossStart: "top",
  crossEnd: "bottom",
};

/**
 * `layoutMode: "NONE"` is a block container; nodes.ts renders it as a VERTICAL
 * auto-layout frame, so it shares the vertical axis mapping.
 */
function axesOf(parent: WireframeNode): Axes {
  return parent.layoutMode === "HORIZONTAL" ? HORIZONTAL_AXES : VERTICAL_AXES;
}

/**
 * Which sibling neighbours which — and hence which margins meet in a gap —
 * depends on the order nodes.ts appends children in. Two passes there can
 * differ from DOM order for IN-FLOW children: `sortByFlexOrder` (CSS `order`)
 * and `reverseFlexChildren` (`row-reverse` / `column-reverse`). Rather than
 * mirror that logic (the reversal runs per wrapped line), skip those parents
 * and let them keep their wrappers. Both passes bail out on `layoutMode:
 * "NONE"`, so block containers are always safe.
 *
 * `sortChildrenForStacking` only moves absolute/fixed children, which are
 * excluded from `kids` already.
 */
function rendersInDomOrder(parent: WireframeNode, kids: WireframeNode[]): boolean {
  if (parent.layoutMode !== "HORIZONTAL" && parent.layoutMode !== "VERTICAL") {
    return true;
  }
  if (
    parent.flexDirection === "row-reverse" ||
    parent.flexDirection === "column-reverse"
  ) {
    return false;
  }
  return !kids.some((k) => k.cssOrder != null);
}

/**
 * Two wrappers between adjacent siblings stack their paddings, so the rendered
 * gap is `itemSpacing + prev.marginEnd + next.marginStart`. When that sum is
 * the same for every pair, one `itemSpacing` reproduces all of them exactly and
 * every wrapper in the parent becomes redundant.
 *
 * Requires the cross-axis margins to be absent: those do not fit in
 * `itemSpacing`, and leaving them behind would keep the wrapper anyway. (The
 * uniform-cross-axis case is handled separately by `collapseUniformCrossAxis`.)
 */
function collapseUniformMainAxis(
  parent: WireframeNode,
  kids: WireframeNode[],
  axes: Axes
): void {
  if (kids.length < 2) return;
  if (!kids.some((k) => k.margin)) return;
  if (!rendersInDomOrder(parent, kids)) return;

  const side = (k: WireframeNode, s: keyof Sides): number => clamp(k.margin?.[s]);

  // Cross-axis margin can't be expressed by itemSpacing — bail out.
  if (
    kids.some(
      (k) => side(k, axes.crossStart) > 0 || side(k, axes.crossEnd) > 0
    )
  ) {
    return;
  }

  const spacing = side(kids[0], axes.mainEnd) + side(kids[1], axes.mainStart);
  for (let i = 2; i < kids.length; i++) {
    const gap = side(kids[i - 1], axes.mainEnd) + side(kids[i], axes.mainStart);
    if (gap !== spacing) return;
  }

  parent.itemSpacing += spacing;
  parent.padding[axes.mainStart] += side(kids[0], axes.mainStart);
  parent.padding[axes.mainEnd] += side(kids[kids.length - 1], axes.mainEnd);
  for (const k of kids) k.margin = undefined;
}

// ---------------------------------------------------------------------------
// Rule 4 — uniform cross-axis margin → parent padding
// ---------------------------------------------------------------------------

/**
 * A cross-axis margin every sibling shares is indistinguishable from parent
 * padding: each child is inset by the same amount, so MIN/CENTER/MAX
 * counter-axis alignment all land where they did, and a HUG parent grows by
 * the same total either way. Uniformity is what makes that true — one child
 * with a different inset would move.
 *
 * Runs BEFORE the main-axis rule: cross-axis margin vetoes that rule, and
 * clearing it here is what lets rows like iwm.org.uk's `ul.navigation__menu`
 * (`margin: 5px 22px 5px 11px` on all five `<li>`) collapse completely.
 */
function collapseUniformCrossAxis(
  parent: WireframeNode,
  kids: WireframeNode[],
  axes: Axes
): void {
  if (kids.length < 2) return;

  const start = clamp(kids[0].margin?.[axes.crossStart]);
  const end = clamp(kids[0].margin?.[axes.crossEnd]);
  if (start === 0 && end === 0) return;

  for (const k of kids) {
    if (
      clamp(k.margin?.[axes.crossStart]) !== start ||
      clamp(k.margin?.[axes.crossEnd]) !== end
    ) {
      return;
    }
  }

  parent.padding[axes.crossStart] += start;
  parent.padding[axes.crossEnd] += end;
  for (const k of kids) {
    if (!k.margin) continue;
    k.margin[axes.crossStart] = 0;
    k.margin[axes.crossEnd] = 0;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Fold redundant child margins into their parent's padding/itemSpacing,
 * in place, over the whole tree. Only call for auto-layout imports —
 * absolute mode positions children by x/y and never builds a wrapper.
 */
export function collapseMarginWrappers(root: WireframeNode): void {
  const visit = (parent: WireframeNode): void => {
    const kids = flowChildren(parent);
    if (isAutoLayoutParent(parent) && !kids.some(hasNegativeMargin)) {
      const axes = axesOf(parent);
      collapseSoleChild(parent, kids);
      // Cross axis first — it is what unblocks the main-axis rule.
      collapseUniformCrossAxis(parent, kids, axes);
      collapseUniformMainAxis(parent, kids, axes);
      kids.forEach(clearIfEmpty);
    }
    parent.children.forEach(visit);
  };
  visit(root);
}
