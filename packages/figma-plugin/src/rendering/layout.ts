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

// ============================================================================
// CSS → Figma Auto Layout Mapping
// ============================================================================

/**
 * Convert CSS justify-content to Figma primaryAxisAlignItems
 */
export function cssJustifyToFigma(
  justify: string | undefined
): "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" {
  if (!justify) return "MIN";
  const map: Record<string, "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"> = {
    "flex-start": "MIN",
    start: "MIN",
    left: "MIN",
    "flex-end": "MAX",
    end: "MAX",
    right: "MAX",
    center: "CENTER",
    "space-between": "SPACE_BETWEEN",
    "space-around": "SPACE_BETWEEN", // Figma approximation
    "space-evenly": "SPACE_BETWEEN", // Figma approximation
    normal: "MIN",
  };
  return map[justify] || "MIN";
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
  return margin.top > 0 || margin.right > 0 || margin.bottom > 0 || margin.left > 0;
}

/**
 * Create a wrapper frame that converts CSS margin to Figma padding.
 * The wrapper uses auto layout with HUG sizing — the parent determines
 * whether to FILL/STRETCH via applyChildInAutoLayout.
 * The inner child FILLs the wrapper so it expands within the padded area.
 */
export function createMarginWrapper(
  child: WireframeNode,
  childNode: SceneNode,
  parentLayoutMode: "HORIZONTAL" | "VERTICAL" | "NONE",
  textMode?: string
): FrameNode {
  const margin = child.margin!;
  const wrapper = figma.createFrame();

  wrapper.name = `${child.name}:margin`;
  wrapper.fills = [];
  wrapper.clipsContent = false;

  // Auto layout — HUG both axes (parent overrides to FILL if needed)
  wrapper.layoutMode = "VERTICAL";
  wrapper.layoutSizingHorizontal = "HUG";
  wrapper.layoutSizingVertical = "HUG";

  // Margin → padding conversion (clamp to 0 — Figma rejects negative padding)
  wrapper.paddingTop = Math.max(0, margin.top);
  wrapper.paddingRight = Math.max(0, margin.right);
  wrapper.paddingBottom = Math.max(0, margin.bottom);
  wrapper.paddingLeft = Math.max(0, margin.left);

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
    fc.layoutSizingHorizontal = "FILL";
    fc.layoutSizingVertical = "FILL";
  } else if (childNode.type === "TEXT") {
    const tc = childNode as TextNode;
    if (textMode === "semantic") {
      // Semantic placeholder: keep FIXED dimensions + NONE + ENDING truncation
      // set by createTextNode. Don't override to FILL+HEIGHT.
      tc.layoutSizingHorizontal = "FIXED";
      tc.layoutSizingVertical = "FIXED";
    } else {
      tc.layoutSizingHorizontal = "FILL";
      tc.textAutoResize = "HEIGHT";
    }
  }

  return wrapper;
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
