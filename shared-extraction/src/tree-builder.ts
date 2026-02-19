/**
 * Tree Builder - Builds ExtractedElement tree from parsed snapshot
 *
 * This is the main extraction logic that converts DOM + CSS into Figma-ready elements.
 * Used by both Browser Extension and Plugin_Backend.
 */

import type { ExtractedElement, CDPMatchedStyles } from "./types";
import type { ParsedSnapshotNode } from "./snapshot";
import { extractPropertyFromMatchedRules, extractPseudoStyles } from "./css";
import {
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
} from "./style-parsers";
import {
  parseColor,
  isGradient,
  parseBorderRadius,
  generateId,
  getSemanticName,
  getLayoutMode,
  getLayoutSizing,
} from "./utils";
import {
  SKIP_TAGS,
  TEXT_TAGS,
  MEDIA_TAGS,
  MAX_TREE_DEPTH,
} from "./constants";

// ============================================================================
// BODY ORIGINAL CSS (for preserving original gradient syntax)
// ============================================================================

export interface BodyOriginalCSS {
  background: string | null;
  backgroundImage: string | null;
  backgroundColor: string | null;
  selector: string;
}

// ============================================================================
// BUILD ELEMENT TREE OPTIONS
// ============================================================================

export interface BuildTreeOptions {
  viewportWidth: number;
  cssVariablesMap?: Map<string, string>;
  bodyOriginalCSS?: BodyOriginalCSS | null;
  browserDpr?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if element needs frame wrapper for text
 * (has padding, background, border, shadow, or border-radius)
 */
function needsFrameWrapper(
  padding: { top: number; right: number; bottom: number; left: number },
  fills: unknown[],
  strokes: unknown[],
  effects: unknown[],
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  }
): boolean {
  if (
    padding.top > 0 ||
    padding.right > 0 ||
    padding.bottom > 0 ||
    padding.left > 0
  ) {
    return true;
  }

  if (fills.length > 0) return true;
  if (strokes.length > 0) return true;
  if (effects.length > 0) return true;

  if (
    borderRadius.topLeft > 0 ||
    borderRadius.topRight > 0 ||
    borderRadius.bottomRight > 0 ||
    borderRadius.bottomLeft > 0
  ) {
    return true;
  }

  return false;
}

/**
 * Collect direct text content from immediate TEXT_NODE children only
 */
function collectDirectText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): string {
  const childIndices = childrenMap.get(nodeIndex) || [];
  const textParts: string[] = [];
  let hasElementChildren = false;

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (child && child.nodeType === 3 && child.textContent) {
      textParts.push(child.textContent);
    }
    if (child && child.nodeType === 1) {
      hasElementChildren = true;
    }
  }

  let result = textParts.join("");
  result = result.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");

  if (hasElementChildren) {
    result = result.replace(/^\s+/, "");
  } else {
    result = result.trim();
  }

  return result;
}

/**
 * Recursively collect ALL text from inline elements
 */
function collectAllInlineText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): string {
  const node = nodes[nodeIndex];
  if (!node) return "";

  if (node.nodeType === 3) {
    return node.textContent || "";
  }

  const childIndices = childrenMap.get(nodeIndex) || [];
  const textParts: string[] = [];

  for (const childIdx of childIndices) {
    const childText = collectAllInlineText(childIdx, nodes, childrenMap);
    if (childText) {
      textParts.push(childText);
    }
  }

  let result = textParts.join(" ");
  result = result
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return result;
}

/**
 * Check if element is a "leaf" text element (has no element children)
 */
function isLeafElement(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): boolean {
  const childIndices = childrenMap.get(nodeIndex) || [];

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (child && child.nodeType === 1) {
      return false;
    }
  }

  return true;
}

/**
 * Create a synthetic text child element
 */
function createSyntheticTextChild(
  width: number,
  height: number,
  textColor: string | null,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  lineHeight: number | string,
  letterSpacing: number,
  textAlign: string,
  textContent: string,
  xOffset: number = 0
): ExtractedElement {
  return {
    id: generateId(),
    type: "text",
    tag: "#text",
    name: "Text",
    x: xOffset,
    y: 0,
    width: Math.max(10, width),
    height: Math.max(10, height),
    position: "relative",
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    justifyContent: "normal",
    alignItems: "normal",
    flexWrap: "nowrap",
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor,
    borderColor: null,
    borderWidth: 0,
    borderRadius: {
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    },
    boxShadow: null,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    textAlign,
    textContent,
    opacity: 1,
    isPlaceholder: false,
    children: [],
  };
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

/**
 * Build element tree from snapshot nodes
 *
 * @param nodes - Parsed snapshot nodes
 * @param nodesByBackendId - Map of backendNodeId to node (for lookups)
 * @param matchedStylesMap - Map of backendNodeId to matched CSS rules
 * @param options - Build options (viewport, variables, etc.)
 * @returns Root ExtractedElement tree
 */
export function buildElementTree(
  nodes: ParsedSnapshotNode[],
  _nodesByBackendId: Map<number, ParsedSnapshotNode>,
  matchedStylesMap: Map<number, CDPMatchedStyles>,
  options: BuildTreeOptions
): ExtractedElement {
  const {
    viewportWidth,
    cssVariablesMap = new Map(),
    bodyOriginalCSS = null,
    browserDpr = 1,
  } = options;

  // Find body node
  const bodyNode = nodes.find((n) => n.nodeName === "body");
  if (!bodyNode) {
    throw new Error("Could not find body element");
  }

  // Build children map
  const childrenMap = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentIndex >= 0) {
      if (!childrenMap.has(node.parentIndex)) {
        childrenMap.set(node.parentIndex, []);
      }
      childrenMap.get(node.parentIndex)!.push(node.index);
    }
  }

  // Recursive tree builder
  function buildNode(
    node: ParsedSnapshotNode,
    parentX: number,
    parentY: number,
    depth: number
  ): ExtractedElement | null {
    if (depth > MAX_TREE_DEPTH) return null;

    const tag = node.nodeName;

    // Skip non-element nodes
    if (node.nodeType !== 1) return null;

    // Skip unwanted tags
    if (SKIP_TAGS.includes(tag as (typeof SKIP_TAGS)[number])) return null;

    // Skip invisible nodes
    if (!node.bounds || node.bounds.width < 1 || node.bounds.height < 1)
      return null;

    // Scale bounds by devicePixelRatio
    const scaledBounds = {
      x: node.bounds.x / browserDpr,
      y: node.bounds.y / browserDpr,
      width: node.bounds.width / browserDpr,
      height: node.bounds.height / browserDpr,
    };

    const { x, y } = scaledBounds;
    const computedStyles = node.computedStyles;
    const width = scaledBounds.width;
    const height = scaledBounds.height;
    const matchedStyles = matchedStylesMap.get(node.backendNodeId) || null;

    // Determine element type
    const isMedia =
      MEDIA_TAGS.includes(tag as (typeof MEDIA_TAGS)[number]) ||
      Boolean(computedStyles["background-image"]?.includes("url("));
    const isText = TEXT_TAGS.includes(tag as (typeof TEXT_TAGS)[number]);

    // Extract styles
    const resolvedVariables = cssVariablesMap;

    // Get background values
    let backgroundImage: string | null = null;
    let backgroundShorthand: string | null = null;

    // Body special case
    if (tag === "body" && bodyOriginalCSS) {
      backgroundShorthand = bodyOriginalCSS.background;
      backgroundImage = bodyOriginalCSS.backgroundImage;
    } else if (matchedStyles) {
      backgroundImage = extractPropertyFromMatchedRules(
        matchedStyles,
        "background-image"
      );
      backgroundShorthand = extractPropertyFromMatchedRules(
        matchedStyles,
        "background"
      );
    }

    const computedBgColor = computedStyles["background-color"];
    const bgColorForFills =
      computedBgColor &&
      computedBgColor !== "transparent" &&
      computedBgColor !== "rgba(0, 0, 0, 0)"
        ? computedBgColor
        : null;

    // Parse fills
    const fills = parseBackgroundToFills(
      backgroundShorthand || backgroundImage,
      bgColorForFills,
      resolvedVariables,
      { width, height }
    );

    // Legacy fields
    let backgroundColor: string | null = null;
    let backgroundGradient: string | null = null;

    if (backgroundImage && isGradient(backgroundImage)) {
      backgroundGradient = backgroundImage;
    } else if (backgroundShorthand && isGradient(backgroundShorthand)) {
      backgroundGradient = backgroundShorthand;
    }
    if (!backgroundGradient && bgColorForFills) {
      backgroundColor = parseColor(bgColorForFills);
    }

    // Text color
    const textColor = parseColor(computedStyles["color"]);

    // Parse strokes
    const strokes = parseBordersToStrokes(
      computedStyles["border-width"],
      computedStyles["border-color"],
      computedStyles["border-style"],
      computedStyles["border-top"],
      computedStyles["border-right"],
      computedStyles["border-bottom"],
      computedStyles["border-left"],
      resolvedVariables
    );

    // Legacy border fields
    const borderColor = parseColor(computedStyles["border-color"]);
    const borderWidth = parseInt(computedStyles["border-width"] || "0") || 0;
    const borderRadius = parseBorderRadius(
      computedStyles["border-radius"] || "0"
    );

    // Parse effects
    let boxShadow: string | null = null;
    if (matchedStyles) {
      const matchedShadow = extractPropertyFromMatchedRules(
        matchedStyles,
        "box-shadow"
      );
      if (matchedShadow && matchedShadow !== "none") {
        boxShadow = matchedShadow;
      }
    }
    if (!boxShadow && computedStyles["box-shadow"] !== "none") {
      boxShadow = computedStyles["box-shadow"] || null;
    }

    const shadowEffects = parseBoxShadowToEffects(boxShadow);

    let backdropFilter: string | null = null;
    if (matchedStyles) {
      backdropFilter = extractPropertyFromMatchedRules(
        matchedStyles,
        "backdrop-filter"
      );
    }
    if (!backdropFilter) {
      backdropFilter = computedStyles["backdrop-filter"] || null;
    }

    const blurEffects = parseBackdropFilterToEffects(backdropFilter);
    const effects = [...shadowEffects, ...blurEffects];

    // Typography
    const fontFamily = (computedStyles["font-family"] || "Inter")
      .split(",")[0]
      ?.replace(/['"]/g, "")
      .trim();
    const fontSize = parseInt(computedStyles["font-size"] || "14") || 14;
    const fontWeight = parseInt(computedStyles["font-weight"] || "400") || 400;
    const lineHeight = computedStyles["line-height"] || "normal";
    const letterSpacing =
      parseFloat(computedStyles["letter-spacing"] || "0") || 0;
    const textAlign = computedStyles["text-align"] || "left";

    // Layout
    const padding = {
      top: parseInt(computedStyles["padding-top"]) || 0,
      right: parseInt(computedStyles["padding-right"]) || 0,
      bottom: parseInt(computedStyles["padding-bottom"]) || 0,
      left: parseInt(computedStyles["padding-left"]) || 0,
    };

    const gapStr = computedStyles["gap"] || computedStyles["row-gap"] || "0";
    const itemSpacing = parseInt(gapStr) || 0;

    const justifyContent = computedStyles["justify-content"] || undefined;
    const alignItems = computedStyles["align-items"] || undefined;
    const flexWrap = computedStyles["flex-wrap"] || undefined;

    const flexGrowValue = parseFloat(computedStyles["flex-grow"] || "0") || 0;
    const layoutGrow: 0 | 1 | undefined = flexGrowValue > 0 ? 1 : undefined;
    const alignSelf = computedStyles["align-self"];
    const layoutAlign: "STRETCH" | "INHERIT" | undefined =
      alignSelf === "stretch" ? "STRETCH" : undefined;

    const layoutSizing = getLayoutSizing(computedStyles, flexGrowValue, alignSelf);

    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    // CSS Positioning
    const cssPosition = computedStyles["position"] as ExtractedElement["position"];
    const position =
      cssPosition && cssPosition !== "static" ? cssPosition : undefined;
    const zIndexStr = computedStyles["z-index"];
    const zIndex =
      zIndexStr && zIndexStr !== "auto" ? parseInt(zIndexStr) : undefined;

    // Detect horizontal centering
    let horizontallyCentered = false;
    if (matchedStyles) {
      const marginLeft = extractPropertyFromMatchedRules(
        matchedStyles,
        "margin-left"
      );
      const marginRight = extractPropertyFromMatchedRules(
        matchedStyles,
        "margin-right"
      );
      const marginShorthand = extractPropertyFromMatchedRules(
        matchedStyles,
        "margin"
      );

      if (marginShorthand && /\bauto\b/i.test(marginShorthand)) {
        horizontallyCentered = true;
      } else if (marginLeft === "auto" || marginRight === "auto") {
        horizontallyCentered = true;
      }
    }

    // Hover styles
    let hoverStyles: Record<string, string> | null = null;
    if (
      matchedStyles &&
      (tag === "button" || tag === "a" || node.attributes.role === "button")
    ) {
      hoverStyles = extractPseudoStyles(matchedStyles, "hover");
    }

    // Aggregate text
    let aggregatedText = node.textContent || "";

    if (!aggregatedText) {
      if (tag === "li" || tag === "a") {
        aggregatedText = collectAllInlineText(node.index, nodes, childrenMap);
      } else {
        aggregatedText = collectDirectText(node.index, nodes, childrenMap);
      }
    }

    const isLeaf = isLeafElement(node.index, nodes, childrenMap);
    const finalText = aggregatedText;

    // Smart wrapping
    const wouldBeText = isText || (isLeaf && aggregatedText && tag !== "a");
    const requiresWrapper =
      wouldBeText &&
      needsFrameWrapper(padding, fills, strokes, effects, borderRadius);

    const shouldBeText = wouldBeText && !requiresWrapper;
    const shouldBeFrameWithTextChild = wouldBeText && requiresWrapper;

    // Determine element type
    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMedia) {
      elementType = "placeholder";
    } else if (shouldBeText && finalText) {
      elementType = "text";
    }

    const isListItemWithText = tag === "li" && !!finalText;
    const isLinkWithText = tag === "a" && !!finalText;
    const needsSyntheticTextChild =
      isListItemWithText || shouldBeFrameWithTextChild || isLinkWithText;
    const frameTextContent = needsSyntheticTextChild ? "" : finalText;

    // Build element
    const element: ExtractedElement = {
      id: generateId(),
      type: elementType,
      tag,
      className: node.attributes["class"] || undefined,
      name: getSemanticName(tag, node.attributes),
      x: x - parentX,
      y: y - parentY,
      width: Math.ceil(width),
      height: Math.ceil(height),
      position,
      zIndex,
      layoutMode: getLayoutMode(computedStyles, tag),
      itemSpacing,
      padding,
      justifyContent,
      alignItems,
      flexWrap,
      layoutGrow,
      layoutAlign,
      layoutSizingHorizontal: layoutSizing.horizontal,
      layoutSizingVertical: layoutSizing.vertical,
      fills,
      strokes,
      effects,
      backgroundColor,
      backgroundGradient,
      textColor,
      borderColor,
      borderWidth,
      borderRadius,
      boxShadow,
      fontFamily,
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      textAlign,
      textContent: frameTextContent,
      opacity,
      isPlaceholder: isMedia,
      horizontallyCentered: horizontallyCentered || undefined,
      children: [],
      hoverStyles: hoverStyles || undefined,
    };

    // Process children
    const childIndices = childrenMap.get(node.index) || [];
    for (const childIdx of childIndices) {
      const childNode = nodes[childIdx];
      if (childNode) {
        // Skip children outside viewport
        if (childNode.bounds && childNode.bounds.x / browserDpr >= viewportWidth) {
          continue;
        }

        const childElement = buildNode(childNode, x, y, depth + 1);
        if (childElement && childElement.width > 3 && childElement.height > 3) {
          // Clip child width if extends beyond viewport
          if (childElement.x + childElement.width > viewportWidth) {
            childElement.width = Math.max(0, viewportWidth - childElement.x);
          }
          element.children.push(childElement);
        }
      }
    }

    // Auto-upgrade parent alignment if child is centered
    if (element.children.length > 0) {
      const hasCenteredChild = element.children.some(
        (child) => child.horizontallyCentered
      );

      if (hasCenteredChild) {
        if (element.layoutMode === "NONE") {
          element.layoutMode = "VERTICAL";
          element.justifyContent = "normal";
        }
        if (element.layoutMode === "VERTICAL") {
          element.alignItems = "center";
        }
      }
    }

    // Add synthetic text child for list items
    // Note: Don't require element.children.length === 0 because ::before pseudo-elements
    // are already added as children, but we still need the text content
    if (isListItemWithText && finalText) {
      // Check if we already have a text child (avoid duplicates)
      const hasTextChild = element.children.some(
        (c) => c.type === "text" && c.tag === "#text"
      );
      if (!hasTextChild) {
        const bulletWidth = padding.left || 16;
        element.children.push(
          createSyntheticTextChild(
            width - bulletWidth - padding.right,
            height,
            textColor,
            fontFamily,
            fontSize,
            fontWeight,
            lineHeight,
            letterSpacing,
            textAlign,
            finalText,
            bulletWidth
          )
        );
      }
    }

    // Add synthetic text child for wrapped text elements
    if (shouldBeFrameWithTextChild && finalText) {
      element.children.push(
        createSyntheticTextChild(
          width - padding.left - padding.right,
          height - padding.top - padding.bottom,
          textColor,
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
          textAlign,
          finalText
        )
      );
    }

    // Add synthetic text child for links
    // Note: Don't require element.children.length === 0 because some links may have
    // pseudo-elements or other children, but we still need the text content
    if (isLinkWithText && finalText) {
      // Check if we already have a text child (avoid duplicates)
      const hasTextChild = element.children.some(
        (c) => c.type === "text" && c.tag === "#text"
      );
      if (!hasTextChild) {
        element.children.push(
          createSyntheticTextChild(
            width - padding.left - padding.right,
            height - padding.top - padding.bottom,
            textColor,
            fontFamily,
            fontSize,
            fontWeight,
            lineHeight,
            letterSpacing,
            textAlign,
            finalText
          )
        );
      }
    }

    return element;
  }

  const tree = buildNode(bodyNode, 0, 0, 0);
  if (!tree) {
    throw new Error("Failed to build element tree");
  }

  // Recalculate X positions for centered elements
  const actualBodyWidth = bodyNode.bounds
    ? bodyNode.bounds.width / browserDpr
    : viewportWidth;

  if (
    actualBodyWidth !== viewportWidth &&
    Math.abs(actualBodyWidth - viewportWidth) > 1
  ) {
    function recalculateXPositions(
      element: ExtractedElement,
      parentWidth: number
    ): void {
      if (element.horizontallyCentered && element.width < parentWidth) {
        const newX = Math.round((parentWidth - element.width) / 2);
        element.x = newX;
      }

      for (const child of element.children) {
        recalculateXPositions(child, element.width);
      }
    }

    for (const child of tree.children) {
      recalculateXPositions(child, viewportWidth);
    }
  }

  // Override body width to viewport
  tree.width = viewportWidth;

  return tree;
}
