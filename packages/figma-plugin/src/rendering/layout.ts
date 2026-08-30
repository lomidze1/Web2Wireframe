/**
 * Layout utilities for CSS → Figma Auto Layout conversion
 * Handles justify-content, align-items, margins, and border radius
 */

import type { WireframeNode } from "../types";

// ============================================================================
// Border Radius
// ============================================================================

/**
 * Extract single border radius value from number or object
 */
export function getBorderRadius(
  value:
    | number
    | {
        topLeft: number;
        topRight: number;
        bottomRight: number;
        bottomLeft: number;
      }
    | undefined
): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  // Return the maximum corner radius for uniform appearance
  return Math.max(
    value.topLeft || 0,
    value.topRight || 0,
    value.bottomRight || 0,
    value.bottomLeft || 0
  );
}

/**
 * Extract individual corner radii from border radius value
 */
export function getCornerRadii(
  value:
    | number
    | {
        topLeft: number;
        topRight: number;
        bottomRight: number;
        bottomLeft: number;
      }
    | undefined
): { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } {
  if (!value) return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
  if (typeof value === "number") {
    return {
      topLeft: value,
      topRight: value,
      bottomRight: value,
      bottomLeft: value,
    };
  }
  return value;
}

/**
 * Apply border radius to a Figma node, preserving per-corner asymmetry.
 * Each corner is clamped to half the smaller dimension. Collapsing
 * asymmetric corners to Math.max (the old behavior) lost every flat
 * corner — tabs, chat bubbles and `rounded-t-lg` cards rendered fully
 * rounded on all four corners.
 */
export function applyCornerRadii(
  target: {
    cornerRadius: unknown;
    topLeftRadius: number;
    topRightRadius: number;
    bottomRightRadius: number;
    bottomLeftRadius: number;
  },
  borderRadius: WireframeNode["borderRadius"] | undefined,
  width: number,
  height: number
): void {
  const radii = getCornerRadii(borderRadius);
  const maxRadius = Math.min(width, height) / 2;
  const topLeft = Math.min(radii.topLeft || 0, maxRadius);
  const topRight = Math.min(radii.topRight || 0, maxRadius);
  const bottomRight = Math.min(radii.bottomRight || 0, maxRadius);
  const bottomLeft = Math.min(radii.bottomLeft || 0, maxRadius);

  if (topLeft <= 0 && topRight <= 0 && bottomRight <= 0 && bottomLeft <= 0) {
    return;
  }
  if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
    target.cornerRadius = topLeft;
  } else {
    target.topLeftRadius = topLeft;
    target.topRightRadius = topRight;
    target.bottomRightRadius = bottomRight;
    target.bottomLeftRadius = bottomLeft;
  }
}

// ============================================================================
// Absolute-child constraints
// ============================================================================

export type AxisConstraint = "MIN" | "MAX" | "CENTER" | "STRETCH";

/**
 * Infer Figma constraints for an absolutely-positioned child from its
 * captured geometry. Computed CSS left/right/top/bottom are used values on
 * positioned elements (both sides always resolve to px), so authoring
 * intent must be read off the box instead:
 *   - spans (almost) the full axis → STRETCH (full-bleed overlays, inset:0)
 *   - equidistant from both edges → CENTER (centered modals/dropdowns)
 *   - closer to the far edge → MAX (close buttons, right-anchored badges)
 *   - otherwise → MIN (Figma's default)
 * Wrong guesses degrade to today's behavior (everything MIN), never worse.
 */
export function inferAxisConstraint(
  start: number,
  size: number,
  parentSize: number
): AxisConstraint {
  if (!(parentSize > 0) || !(size > 0)) return "MIN";
  const nearGap = start;
  const farGap = parentSize - (start + size);
  if (size >= parentSize * 0.9) return "STRETCH";
  if (Math.abs(nearGap - farGap) <= 2) return "CENTER";
  return farGap < nearGap ? "MAX" : "MIN";
}

// ============================================================================
// CSS → Figma Auto Layout Mapping
// ============================================================================

/**
 * Convert CSS justify-content to Figma primaryAxisAlignItems.
 *
 * `reversed` marks a `row-reverse` / `column-reverse` container. There the CSS
 * main-start sits at the far edge, so packing swaps: the default `flex-start`
 * means "flush right" (Figma MAX) and `flex-end` means "flush left" (MIN).
 * Centered and distributed packing are symmetric and stay put.
 */
export function cssJustifyToFigma(
  justify: string | undefined,
  reversed = false
): "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" {
  if (!justify) return reversed ? "MAX" : "MIN";
  const map: Record<string, "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"> = {
    "flex-start": "MIN",
    start: "MIN",
    left: "MIN",
    "flex-end": "MAX",
    end: "MAX",
    right: "MAX",
    center: "CENTER",
    "space-between": "SPACE_BETWEEN",
    // Figma's SPACE_BETWEEN pins the first/last child to the edges, but CSS
    // space-around/evenly keep edge gaps too — mapping them there deleted the
    // edge spacing (nav bars, footers, tab strips). h2d keeps these MIN; the
    // real gaps come from measured itemSpacing/padding (css-converter).
    "space-around": "MIN",
    "space-evenly": "MIN",
    normal: "MIN",
  };
  const mapped = map[justify] || "MIN";
  if (!reversed) return mapped;
  if (mapped === "MIN") return "MAX";
  if (mapped === "MAX") return "MIN";
  return mapped;
}

/**
 * Convert CSS align-items to Figma counterAxisAlignItems
 */
export function cssAlignToFigma(
  align: string | undefined
): "MIN" | "CENTER" | "MAX" | "BASELINE" {
  if (!align) return "MIN";

  const map: Record<string, "MIN" | "CENTER" | "MAX" | "BASELINE"> = {
    "flex-start": "MIN",
    start: "MIN",
    "self-start": "MIN",
    "flex-end": "MAX",
    end: "MAX",
    "self-end": "MAX",
    center: "CENTER",
    stretch: "MIN", // Stretch handled via layoutAlign
    baseline: "BASELINE",
    normal: "MIN", // CSS default = not centered
  };

  return map[align] || "MIN";
}

/**
 * Convert CSS align-self to Figma layoutAlign
 * Used for child elements in Auto Layout
 */
export function cssAlignSelfToFigma(
  alignSelf: string | undefined,
  _parentCounterAlign: "MIN" | "CENTER" | "MAX" | "BASELINE"
): "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT" {
  if (!alignSelf || alignSelf === "auto") {
    return "INHERIT";
  }

  const map: Record<string, "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT"> = {
    "flex-start": "MIN",
    start: "MIN",
    "self-start": "MIN",
    "flex-end": "MAX",
    end: "MAX",
    "self-end": "MAX",
    center: "CENTER",
    stretch: "STRETCH",
    baseline: "MIN", // Figma doesn't support baseline for individual items
  };

  return map[alignSelf] || "INHERIT";
}

/**
 * Decide the `layoutAlign` to write on an auto-layout child, or `null` to leave
 * Figma's default in place.
 *
 * `align-self` wins over the node-level STRETCH intent, and CENTER is
 * deliberately dropped: Figma centers a whole line via the parent's
 * `counterAxisAlignItems`, and forcing CENTER per child fights that.
 */
export function resolveChildLayoutAlign(
  selfAlign: "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT",
  nodeLayoutAlign: "STRETCH" | "INHERIT" | undefined
): "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT" | null {
  if (selfAlign === "STRETCH") return "STRETCH";
  if (selfAlign === "MIN" || selfAlign === "MAX") return selfAlign;
  if (selfAlign === "CENTER") return "INHERIT";
  if (nodeLayoutAlign === "STRETCH") return "STRETCH";
  return null;
}

// ============================================================================
// CSS → Figma Grid Child Alignment
// ============================================================================

type GridChildAlign = "MIN" | "CENTER" | "MAX" | "STRETCH";

const GRID_ALIGN_MAP: Record<string, GridChildAlign> = {
  "flex-start": "MIN",
  start: "MIN",
  "self-start": "MIN",
  "flex-end": "MAX",
  end: "MAX",
  "self-end": "MAX",
  center: "CENTER",
  stretch: "STRETCH",
  normal: "STRETCH", // CSS grid default for align-items is stretch
};

/**
 * Convert CSS align-items to Figma gridChildVerticalAlign for grid children.
 * CSS align-items on a grid container controls vertical alignment of items in their cells.
 */
export function cssAlignToGridChild(align: string | undefined): GridChildAlign {
  if (!align) return "STRETCH";
  return GRID_ALIGN_MAP[align] || "STRETCH";
}

/**
 * Convert CSS justify-items to Figma gridChildHorizontalAlign for grid children.
 * CSS justify-items on a grid container controls horizontal alignment of items in their cells.
 */
export function cssJustifyToGridChild(justify: string | undefined): GridChildAlign {
  if (!justify) return "STRETCH";
  return GRID_ALIGN_MAP[justify] || "STRETCH";
}

/** Global geometry epsilon — h2d's `fe`, as in css-converter/treeSimplify. */
const GRID_ALIGN_EPSILON = 0.51;

/**
 * Recover a grid child's cell alignment from where the browser actually put
 * it, for the axis CSS cannot tell us about.
 *
 * `justify-items` — the property that centres an item horizontally in its
 * cell — is not part of the capture, so `place-items: center` reaches us as
 * `align-items: center` alone and the horizontal half is lost (glinc.io's
 * 64x64 `.iconWrap` put its 32x32 icon at x=1 instead of x=16). The measured
 * insets say it plainly: equal gaps on both sides is a centred item.
 *
 * Returns null whenever the geometry does not name one alignment — the
 * caller then keeps whatever CSS said.
 */
export function inferGridChildAlign(
  offsetStart: number,
  childSize: number,
  cellSize: number,
): "CENTER" | "MAX" | null {
  const endGap = cellSize - offsetStart - childSize;
  // Overhanging or degenerate geometry describes no alignment.
  if (offsetStart < -GRID_ALIGN_EPSILON || endGap < -GRID_ALIGN_EPSILON) return null;
  const hasStart = offsetStart > GRID_ALIGN_EPSILON;
  const hasEnd = endGap > GRID_ALIGN_EPSILON;
  if (hasStart && hasEnd) {
    return Math.abs(offsetStart - endGap) <= GRID_ALIGN_EPSILON ? "CENTER" : null;
  }
  // Pinned to the far edge. A child at the start needs no override: MIN is
  // what a non-stretching grid item does by default.
  if (hasStart) return "MAX";
  return null;
}

/**
 * Use text-align as fallback for frame alignment when no explicit
 * justify-content/align-items is set. In CSS, text-align on a block
 * container centers inline/inline-block children.
 */
export function applyTextAlignFallback(
  frame: FrameNode,
  textAlign: string | undefined,
  justifyContent: string | undefined,
  alignItems: string | undefined
): void {
  if (!textAlign || textAlign === "left" || textAlign === "start") return;

  const alignMap: Record<string, "CENTER" | "MAX"> = {
    center: "CENTER",
    right: "MAX",
    end: "MAX",
  };
  const mapped = alignMap[textAlign];
  if (!mapped) return;

  // "normal" is the CSS default for non-flex block elements — treat as unset
  const isDefault = (v: string | undefined) => !v || v === "normal";

  // VERTICAL layout: text-align affects horizontal (cross-axis) alignment
  if (frame.layoutMode === "VERTICAL" && isDefault(alignItems)) {
    frame.counterAxisAlignItems = mapped;
  }
  // HORIZONTAL layout: text-align affects horizontal (primary-axis) alignment
  if (frame.layoutMode === "HORIZONTAL" && isDefault(justifyContent)) {
    frame.primaryAxisAlignItems = mapped;
  }
}

// ============================================================================
// Margin Wrapper
// ============================================================================

/**
 * Check if a node needs a margin wrapper frame
 * Wrapper frames are created for elements with CSS margins
 * since Figma doesn't have margin - only padding
 */
export function needsMarginWrapper(
  margin: { top: number; right: number; bottom: number; left: number } | undefined
): boolean {
  if (!margin) return false;
  // Non-zero, not merely positive. A NEGATIVE margin is the "bleed out of a
  // padded container" idiom (stripe.com uses it on 17 nodes), and it needs a
  // wrapper just as much — see the positional branch in createMarginWrapper.
  return margin.top !== 0 || margin.right !== 0 || margin.bottom !== 0 || margin.left !== 0;
}

/** Smallest width/height Figma accepts on a frame. */
const FIGMA_MIN_SIZE = 0.01;

/**
 * Build the margin box for a child that BLEEDS — one whose margin pulls it
 * outside its own slot (`margin: 0 -15px`, `margin-top: -60px`).
 *
 * Figma rejects negative padding, so the offset has to be expressed as
 * position instead: a `layoutMode: "NONE"` frame sized to the margin box, with
 * the child placed at the margin offset inside it. Same arithmetic as the
 * padding wrapper below — `childSize + leadingMargin + trailingMargin` — only
 * in the one form Figma will accept below zero. h2d does exactly this.
 *
 * No `layoutSizing*` is set: those setters are invalid on a frame that has
 * neither auto layout of its own nor an auto-layout parent yet, and Figma
 * treats a NONE frame as FIXED anyway. The bleed's own width survives because
 * css-converter's `hasNegativeInlineMargin` gate already pinned the child to
 * FIXED, so `applyChildInAutoLayout` never stretches the wrapper.
 *
 * A margin box of exactly zero is kept, floored at Figma's 0.01 minimum: it
 * means the browser gave the element no space on that axis while still
 * painting it, which is stripe.com's `div.divider-container` — 1264x120 with
 * `margin: -60px -16px` inside a parent measuring 0px tall. Only a box that
 * goes NEGATIVE returns null: that would need the element to pull its
 * following siblings past its own start, and Figma has no negative space to
 * express it with. The caller then appends the child bare, as before.
 */
function createBleedWrapper(
  child: WireframeNode,
  childNode: SceneNode,
  margin: { top: number; right: number; bottom: number; left: number },
): FrameNode | null {
  const width = childNode.width + margin.left + margin.right;
  const height = childNode.height + margin.top + margin.bottom;
  if (width < 0 || height < 0) return null;

  const wrapper = figma.createFrame();
  wrapper.name = `${child.name}:margin`;
  wrapper.fills = [];
  // The whole point is that the child paints outside this box.
  wrapper.clipsContent = false;
  wrapper.layoutMode = "NONE";
  wrapper.resize(Math.max(width, FIGMA_MIN_SIZE), Math.max(height, FIGMA_MIN_SIZE));

  wrapper.appendChild(childNode);
  childNode.x = margin.left;
  childNode.y = margin.top;

  return wrapper;
}

/**
 * Create a wrapper frame that converts CSS margin to Figma padding.
 * The wrapper uses auto layout with HUG sizing — the parent determines
 * whether to FILL/STRETCH via applyChildInAutoLayout.
 * The inner child FILLs the wrapper so it expands within the padded area.
 *
 * A margin with any negative side takes the positional route instead — see
 * {@link createBleedWrapper} — and may return null when the margin box
 * collapses.
 */
export function createMarginWrapper(
  child: WireframeNode,
  childNode: SceneNode,
  parentLayoutMode: "HORIZONTAL" | "VERTICAL" | "NONE",
  textMode?: string
): FrameNode | null {
  const margin = child.margin!;

  if (margin.top < 0 || margin.right < 0 || margin.bottom < 0 || margin.left < 0) {
    return createBleedWrapper(child, childNode, margin);
  }

  const wrapper = figma.createFrame();

  wrapper.name = `${child.name}:margin`;
  wrapper.fills = [];
  wrapper.clipsContent = false;

  // Auto layout — HUG both axes (parent overrides to FILL if needed)
  wrapper.layoutMode = "VERTICAL";
  wrapper.layoutSizingHorizontal = "HUG";
  wrapper.layoutSizingVertical = "HUG";

  // Margin → padding conversion. Every side is >= 0 here: the negative case
  // took the positional route above.
  wrapper.paddingTop = margin.top;
  wrapper.paddingRight = margin.right;
  wrapper.paddingBottom = margin.bottom;
  wrapper.paddingLeft = margin.left;

  wrapper.primaryAxisAlignItems = "MIN";
  wrapper.counterAxisAlignItems = "MIN";
  wrapper.itemSpacing = 0;

  // Add child — make it FILL the wrapper
  wrapper.appendChild(childNode);

  if (
    childNode.type === "FRAME" ||
    childNode.type === "COMPONENT" ||
    childNode.type === "INSTANCE"
  ) {
    const fc = childNode as FrameNode;
    // FIXED children must KEEP their browser-measured size: forcing FILL
    // inside this HUG wrapper resolves to content size, shrinking the child.
    // telex.ge footer: float columns (FIXED 281px) collapsed to their text
    // width and the four columns jammed together. Non-FIXED children keep
    // the original FILL-the-wrapper behavior (wrapper may later FILL/STRETCH).
    fc.layoutSizingHorizontal =
      child.layoutSizingHorizontal === "FIXED" ? "FIXED" : "FILL";
    fc.layoutSizingVertical =
      child.layoutSizingVertical === "FIXED" ? "FIXED" : "FILL";
  } else if (childNode.type === "TEXT") {
    const tc = childNode as TextNode;
    if (textMode === "semantic") {
      // Semantic placeholder: keep FIXED dimensions + NONE + ENDING truncation
      // set by createTextNode. Don't override to FILL+HEIGHT.
      tc.layoutSizingHorizontal = "FIXED";
      tc.layoutSizingVertical = "FIXED";
    } else if (
      child.layoutSizingHorizontal === "HUG" &&
      (child.browserLineCount || 1) <= 1
    ) {
      // Content-width mode: single-line coalesced text whose natural width
      // exceeds the parent (e.g. Apple.com tile subheads). The css-converter
      // sets HUG to preserve the intrinsic width; if we force FILL here the
      // text would wrap to the narrower wrapper and lose its natural size.
      // Multi-line text must NEVER take this branch — WIDTH_AND_HEIGHT would
      // render the joined lines as one nowrap run.
      tc.layoutSizingHorizontal = "HUG";
      tc.textAutoResize = "WIDTH_AND_HEIGHT";
    } else if (
      child.layoutSizingHorizontal === "FIXED" &&
      (child.browserLineCount || 1) > 1
    ) {
      // Multi-line text with a FIXED browser width (e.g. a display:table
      // quote sized by shrink-to-fit): keep the captured wrap width and let
      // height grow. FILL would stretch it to the wrapper; HUG would nowrap.
      tc.layoutSizingHorizontal = "FIXED";
      tc.textAutoResize = "HEIGHT";
    } else {
      tc.layoutSizingHorizontal = "FILL";
      tc.textAutoResize = "HEIGHT";
    }
  }

  return wrapper;
}

// ============================================================================
// Grow Eligibility (exact-fit gate)
// ============================================================================

/** Sub-pixel slack, matching geometrySupportsVerticalStack in nodes.ts. */
const FIT_EPSILON = 0.51;

/**
 * May the growing children of this container actually grow in Figma?
 *
 * CSS resolves `flex-grow` against the space left on ONE line; Figma's
 * `layoutGrow = 1` divides the whole container between the growing children.
 * The two agree only when the measured children already fill the container —
 * otherwise Figma hands out space CSS never gave, squeezing every child.
 *
 * stripe.com's bento is the case: six cards measuring 816/400/400/400/400/1232
 * all declare `flex: 1 1 …` inside a 1232px row, because they wrap onto three
 * lines. Honouring grow packed them onto one line at 191.67px each.
 *
 * Mirrors h2d's `Hq`: the run must fit exactly, and the grow candidates must
 * all be the same size — otherwise Figma would even out proportions the
 * browser had set differently.
 */
export function growFitsContainer(opts: {
  /** Container's main-axis length. */
  parentLength: number;
  /** Main-axis padding before the first child. */
  paddingStart: number;
  /** Main-axis padding after the last child. */
  paddingEnd: number;
  /** Measured main-axis length of each in-flow child, in order. */
  childLengths: number[];
  itemSpacing: number;
  /** Indices into childLengths of the children carrying layoutGrow === 1. */
  growIndices: number[];
}): boolean {
  const { parentLength, paddingStart, paddingEnd, childLengths, itemSpacing, growIndices } = opts;

  if (childLengths.length === 0) return true;

  const content =
    childLengths.reduce((sum, len) => sum + len, 0) +
    (childLengths.length - 1) * itemSpacing;

  if (Math.abs(paddingStart + paddingEnd + content - parentLength) > FIT_EPSILON) {
    return false;
  }

  // Figma gives every grow child the same share, so differently sized
  // candidates would come out equal — a proportion the page never showed.
  const candidates = growIndices.map((i) => childLengths[i]).filter((len) => len !== undefined);
  if (candidates.length > 1) {
    const first = candidates[0];
    if (candidates.some((len) => Math.abs(len - first) > FIT_EPSILON)) return false;
  }

  return true;
}

// ============================================================================
// Main Axis Sizing Resolution (FILL-in-HUG guard)
// ============================================================================

/**
 * Resolve main-axis sizing for a child in auto layout.
 * FILL inside a HUG parent is impossible in Figma — downgrade to HUG + minSize.
 */
export function resolveMainAxisSizing(
  childSizing: "FILL" | "HUG" | "FIXED" | undefined,
  childGrow: 0 | 1 | undefined,
  parentSizing: "FILL" | "HUG" | "FIXED",
  childSize: number
): { sizing: "FILL" | "HUG" | "FIXED"; minSize?: number } {
  const wantsFill = childSizing === "FILL" || childGrow === 1;
  if (!wantsFill) return { sizing: childSizing || "HUG" };

  // FILL on main axis inside HUG parent → HUG + minSize
  if (parentSizing === "HUG") {
    return { sizing: "HUG", minSize: childSize };
  }
  return { sizing: "FILL" };
}

// ============================================================================
// Sizing Mode Conversion
// ============================================================================

/**
 * Determine Figma sizing mode from CSS/wireframe properties
 */
export function getSizingMode(
  node: WireframeNode,
  axis: "horizontal" | "vertical"
): "FIXED" | "HUG" | "FILL" {
  if (axis === "horizontal") {
    if (node.layoutSizingHorizontal) {
      return node.layoutSizingHorizontal;
    }
    // Default: FIXED for explicit width, HUG for text
    if (node.type === "text") return "HUG";
    return "FIXED";
  } else {
    if (node.layoutSizingVertical) {
      return node.layoutSizingVertical;
    }
    // Default: HUG for text, FIXED for frames
    if (node.type === "text") return "HUG";
    return "FIXED";
  }
}
