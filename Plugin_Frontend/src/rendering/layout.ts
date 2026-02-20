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
 * Create a wrapper frame that converts CSS margin to Figma padding
 * The wrapper has padding equal to the element's margin
 * The child element is placed inside with its original styles
 */
export function createMarginWrapper(
  child: WireframeNode,
  childNode: SceneNode,
  parentLayoutMode: "HORIZONTAL" | "VERTICAL" | "NONE"
): FrameNode {
  const margin = child.margin!;
  const wrapper = figma.createFrame();

  // Name the wrapper to indicate it's a margin wrapper
  wrapper.name = `${child.name}:margin`;

  // Make wrapper transparent (no fill)
  wrapper.fills = [];

  // Size: child size + margins
  const wrapperWidth = child.width + margin.left + margin.right;
  const wrapperHeight = child.height + margin.top + margin.bottom;
  wrapper.resize(Math.max(wrapperWidth, 1), Math.max(wrapperHeight, 1));

  // Apply Auto Layout to position child correctly
  wrapper.layoutMode = parentLayoutMode === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";

  // Set padding = margin values
  wrapper.paddingTop = margin.top;
  wrapper.paddingRight = margin.right;
  wrapper.paddingBottom = margin.bottom;
  wrapper.paddingLeft = margin.left;

  // Center the child in wrapper
  wrapper.primaryAxisAlignItems = "MIN";
  wrapper.counterAxisAlignItems = "MIN";

  // No extra spacing
  wrapper.itemSpacing = 0;

  // Add child to wrapper
  wrapper.appendChild(childNode);

  return wrapper;
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
