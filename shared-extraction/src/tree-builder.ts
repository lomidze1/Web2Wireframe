/**
 * Tree Builder - Builds ExtractedElement tree from parsed snapshot
 *
 * This is the main extraction logic that converts DOM + CSS into Figma-ready elements.
 * Used by both Browser Extension and Plugin_Backend.
 */

import type { ExtractedElement, CDPMatchedStyles, StyledTextSegment } from "./types";
import type { ParsedSnapshotNode, TextBoxInfo } from "./snapshot";
import { extractPropertyFromMatchedRules, extractPseudoStyles } from "./css";
import {
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
  extractCSSVariableName,
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
 * Inline tags that should be collected as styled segments (not as separate elements)
 */
const INLINE_TAGS = [
  "a", "span", "strong", "em", "b", "i", "u", "s", "small", "mark",
  "sub", "sup", "code", "kbd", "var", "abbr", "cite", "q", "del", "ins",
];

/**
 * Collect styled text segments from element and its inline children
 * This preserves individual styles for each inline element
 *
 * @example
 * <h2>Questions? Email us at <a>support@example.com</a></h2>
 * Returns:
 * [
 *   { text: "Questions? Email us at ", color: "#000", fontWeight: 700, fontSize: 24, tag: "h2" },
 *   { text: "support@example.com", color: "#0066cc", fontWeight: 700, fontSize: 24, tag: "a", isLink: true }
 * ]
 */
function collectStyledText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
  parentStyles: {
    color: string | null;
    fontWeight: number;
    fontSize: number;
    fontFamily: string;
    fontFamilyList?: string[];
    textDecoration?: "underline" | "line-through" | "none";
  }
): StyledTextSegment[] {
  const node = nodes[nodeIndex];
  if (!node) return [];

  const segments: StyledTextSegment[] = [];
  const childIndices = childrenMap.get(nodeIndex) || [];

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (!child) continue;

    // TEXT_NODE - use parent styles
    if (child.nodeType === 3) {
      const text = child.textContent || "";
      if (text.trim()) {
        segments.push({
          text: text,
          color: parentStyles.color,
          fontWeight: parentStyles.fontWeight,
          fontSize: parentStyles.fontSize,
          fontFamily: parentStyles.fontFamily,
          fontFamilyList: parentStyles.fontFamilyList,
          tag: node.nodeName,
          textDecoration: parentStyles.textDecoration,
        });
      }
    }
    // Element node - check if inline
    else if (child.nodeType === 1) {
      const tag = child.nodeName.toLowerCase();

      if (INLINE_TAGS.includes(tag)) {
        // Get this element's computed styles
        const childColor = parseColor(child.computedStyles["color"]) || parentStyles.color;
        const childFontWeight = parseInt(child.computedStyles["font-weight"] || "0") || parentStyles.fontWeight;
        const childFontSize = parseInt(child.computedStyles["font-size"] || "0") || parentStyles.fontSize;
        const childFontFamilyRaw = child.computedStyles["font-family"] || parentStyles.fontFamily;
        const childFontFamilyList = childFontFamilyRaw
          .split(",")
          .map((f: string) => f.replace(/['"]/g, "").trim())
          .filter((f: string) => f.length > 0);
        const childFontFamily = childFontFamilyList[0] || parentStyles.fontFamily;

        // Parse text-decoration
        const rawTextDecoration = child.computedStyles["text-decoration"] ||
                                  child.computedStyles["text-decoration-line"] || "";
        let childTextDecoration: "underline" | "line-through" | "none" | undefined = parentStyles.textDecoration;
        if (rawTextDecoration.includes("underline")) {
          childTextDecoration = "underline";
        } else if (rawTextDecoration.includes("line-through")) {
          childTextDecoration = "line-through";
        } else if (rawTextDecoration === "none") {
          childTextDecoration = "none";
        }

        // Recursively collect text from this inline element
        const childStyles = {
          color: childColor,
          fontWeight: childFontWeight,
          fontSize: childFontSize,
          fontFamily: childFontFamily,
          fontFamilyList: childFontFamilyList,
          textDecoration: childTextDecoration,
        };

        const childSegments = collectStyledText(childIdx, nodes, childrenMap, childStyles);

        // Mark segments from inline elements with their tag
        for (const seg of childSegments) {
          segments.push({
            ...seg,
            tag: tag,
            isLink: tag === "a",
            textDecoration: seg.textDecoration || childTextDecoration,
          });
        }
      } else {
        // Non-inline element - skip (will be processed as separate element)
      }
    }
  }

  return segments;
}

/**
 * Get bullet character based on list-style-type
 */
function getBulletCharacter(listStyleType: string, index: number = 0): string {
  switch (listStyleType) {
    case "disc":
      return "•";
    case "circle":
      return "○";
    case "square":
      return "■";
    case "decimal":
      return `${index + 1}.`;
    case "decimal-leading-zero":
      return `${String(index + 1).padStart(2, "0")}.`;
    case "lower-alpha":
    case "lower-latin":
      return `${String.fromCharCode(97 + (index % 26))}.`;
    case "upper-alpha":
    case "upper-latin":
      return `${String.fromCharCode(65 + (index % 26))}.`;
    case "lower-roman":
      return `${toRoman(index + 1).toLowerCase()}.`;
    case "upper-roman":
      return `${toRoman(index + 1)}.`;
    case "none":
      return "";
    default:
      return "•"; // Default to disc
  }
}

/**
 * Convert number to Roman numeral
 */
function toRoman(num: number): string {
  const romanNumerals: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];
  let result = "";
  for (const [value, numeral] of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result;
}

/**
 * Count text lines from textBoxes
 * Each textBox represents one rendered line of text
 *
 * Skips pseudo-element children (::marker, ::before, ::after) because they
 * render as separate Figma elements with their own width/height.
 * Including their textBoxes would inflate the line count — e.g. a single-line
 * <li> with a ::marker bullet would be counted as 2 lines instead of 1.
 *
 * @param nodeIndex - Index of parent element
 * @param nodes - All parsed nodes
 * @param childrenMap - Map of nodeIndex -> children indices
 * @returns Number of text lines (from textBoxes.length)
 */
export function countTextLines(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): number {
  let totalLines = 0;

  // Check direct TEXT_NODE children, skip pseudo-elements
  const childIndices = childrenMap.get(nodeIndex) || [];
  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (!child || !child.textBoxes || child.textBoxes.length === 0) continue;

    // Skip pseudo-elements — they render as separate Figma elements
    // nodeType -1 = pseudo-element in DOMSnapshot
    if (child.nodeType === -1) continue;
    const name = child.nodeName?.toLowerCase() || "";
    if (name === "::marker" || name === "::before" || name === "::after") continue;

    totalLines += child.textBoxes.length;
  }

  // Also check if parent element itself has textBoxes (for inline elements)
  const parentNode = nodes[nodeIndex];
  if (parentNode && parentNode.textBoxes && parentNode.textBoxes.length > 0) {
    totalLines += parentNode.textBoxes.length;
  }

  return totalLines || 1; // Default to 1 line if no textBoxes found
}

/**
 * Collect textBoxes from direct TEXT_NODE children
 * Returns combined bounds of all text boxes (relative to parent, scaled by DPR)
 *
 * @param nodeIndex - Index of parent element
 * @param nodes - All parsed nodes
 * @param childrenMap - Map of nodeIndex -> children indices
 * @param parentBoundsRaw - Parent's raw bounds from CDP (NOT scaled)
 * @param browserDpr - Device pixel ratio for scaling
 */
export function collectTextBoxes(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
  parentBoundsRaw: { x: number; y: number; width: number; height: number },
  browserDpr: number = 1
): { x: number; y: number; width: number; height: number } | null {
  const childIndices = childrenMap.get(nodeIndex) || [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasTextBoxes = false;

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    // Skip ::before/::after pseudo-elements — their text boxes (e.g. bullet "•")
    // would pull minX to 0, causing the real text to get wrong x position
    if (child && child.nodeName && child.nodeName.startsWith("::")) {
      continue;
    }
    // Look at TEXT_NODEs and elements with textBoxes
    if (child && child.textBoxes && child.textBoxes.length > 0) {
      for (const box of child.textBoxes) {
        hasTextBoxes = true;
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }
    }
  }

  // Also check if parent element itself has textBoxes (for inline elements)
  const parentNode = nodes[nodeIndex];
  if (parentNode && parentNode.textBoxes && parentNode.textBoxes.length > 0) {
    for (const box of parentNode.textBoxes) {
      hasTextBoxes = true;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
  }

  if (!hasTextBoxes) {
    return null;
  }

  // Convert absolute coordinates to relative (from parent's top-left)
  // and scale by browserDpr (since textBoxes are raw CDP values)
  return {
    x: (minX - parentBoundsRaw.x) / browserDpr,
    y: (minY - parentBoundsRaw.y) / browserDpr,
    width: (maxX - minX) / browserDpr,
    height: (maxY - minY) / browserDpr,
  };
}

// ============================================================================
// CSS DEFAULT VALUES FILTER
// ============================================================================

const CSS_DEFAULT_VALUES: Record<string, string[]> = {
  "display": ["inline"],
  "position": ["static"],
  "opacity": ["1"],
  "visibility": ["visible"],
  "overflow": ["visible"],
  "z-index": ["auto"],
  "flex-grow": ["0"],
  "flex-shrink": ["1"],
  "flex-basis": ["auto"],
  "flex-direction": ["row"],
  "flex-wrap": ["nowrap"],
  "justify-content": ["normal"],
  "align-items": ["normal"],
  "align-self": ["auto"],
  "text-decoration": ["none", "none solid rgb(0, 0, 0)"],
  "text-transform": ["none"],
  "font-style": ["normal"],
  "text-align": ["start"],
  "list-style-type": ["disc"],
  "list-style-position": ["outside"],
  "transform": ["none"],
  "filter": ["none"],
  "backdrop-filter": ["none"],
  "box-shadow": ["none"],
  "background-image": ["none"],
  "background-size": ["auto", "auto auto"],
  "background-position": ["0% 0%"],
  "background-repeat": ["repeat"],
  "border-style": ["none"],
  "grid-template-columns": ["none"],
  "grid-template-rows": ["none"],
  "grid-auto-flow": ["row"],
};

/**
 * Filter out CSS default values to keep JSON compact.
 * Keeps only non-default, meaningful values (~15-25 properties per element).
 */
export function filterDefaultStyles(styles: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    if (!value || value === "") continue;
    // Skip zero-value dimensional properties (but keep typography zeros)
    if (value === "0px" || value === "0" || value === "0px 0px" || value === "normal") {
      const isTypography = prop === "letter-spacing" || prop === "line-height";
      if (!isTypography) continue;
    }
    // Skip known defaults
    const defaults = CSS_DEFAULT_VALUES[prop];
    if (defaults && defaults.includes(value)) continue;
    // Skip transparent/empty colors for backgrounds and borders
    if (value === "rgba(0, 0, 0, 0)" || value === "transparent") {
      if (prop.includes("background") || prop.includes("border-color")) continue;
    }
    filtered[prop] = value;
  }
  return filtered;
}

/**
 * Create a synthetic text child element
 *
 * @param width - Text element width (from textBoxes or calculated)
 * @param height - Text element height
 * @param textColor - Text color
 * @param fontFamily - Font family
 * @param fontSize - Font size
 * @param fontWeight - Font weight
 * @param lineHeight - Line height
 * @param letterSpacing - Letter spacing
 * @param textAlign - Text alignment
 * @param textContent - Actual text content
 * @param xOffset - X position relative to parent (from textBoxes or calculated)
 * @param yOffset - Y position relative to parent (from textBoxes or 0)
 * @param browserLineCount - Number of lines from browser (from textBoxes.length)
 * @param computedStyles - Filtered computed styles passthrough
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
  xOffset: number = 0,
  yOffset: number = 0,
  browserLineCount?: number,
  computedStyles?: Record<string, string>
): ExtractedElement {
  return {
    id: generateId(),
    type: "text",
    tag: "#text",
    name: "Text",
    x: xOffset,
    y: yOffset,
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
    browserLineCount,
    computedStyles,
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

    // Extract CSS variable references from matched rules (before resolving)
    let bgVariableRef: string | null = null;
    let bgColorVariableRef: string | null = null;
    let textColorVariableRef: string | null = null;
    let borderColorVariableRef: string | null = null;

    if (matchedStyles) {
      // background / background-image may contain var()
      bgVariableRef = extractCSSVariableName(backgroundShorthand || backgroundImage || "");

      // background-color from matched rules (computed value has no var())
      const rawBgColor = extractPropertyFromMatchedRules(matchedStyles, "background-color");
      bgColorVariableRef = extractCSSVariableName(rawBgColor || "");

      // text color from matched rules
      const rawColor = extractPropertyFromMatchedRules(matchedStyles, "color");
      textColorVariableRef = extractCSSVariableName(rawColor || "");

      // border-color from matched rules
      const rawBorderColor = extractPropertyFromMatchedRules(matchedStyles, "border-color");
      borderColorVariableRef = extractCSSVariableName(rawBorderColor || "");
    } else if (tag === "body" && bodyOriginalCSS) {
      // Body fallback: extract variable refs from bodyOriginalCSS
      // (body often lacks matchedStyles but bodyOriginalCSS preserves var() syntax)
      bgVariableRef = extractCSSVariableName(backgroundShorthand || backgroundImage || "");
      bgColorVariableRef = extractCSSVariableName(bodyOriginalCSS.backgroundColor || "");
    }

    // Parse fills
    const fills = parseBackgroundToFills(
      backgroundShorthand || backgroundImage,
      bgColorForFills,
      resolvedVariables,
      { width, height }
    );

    // Attach CSS variable reference to fills
    const fillVarRef = bgVariableRef || bgColorVariableRef;
    if (fillVarRef && fills.length > 0) {
      fills[0].cssVariable = fillVarRef;
    }

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

    // Attach CSS variable reference to strokes
    if (borderColorVariableRef && strokes.length > 0) {
      strokes[0].cssVariable = borderColorVariableRef;
    }

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
    const fontFamilyRaw = computedStyles["font-family"] || "Inter";
    const fontFamilyList = fontFamilyRaw
      .split(",")
      .map((f: string) => f.replace(/['"]/g, "").trim())
      .filter((f: string) => f.length > 0);
    const fontFamily = fontFamilyList[0] || "Inter";
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
    let styledSegments: StyledTextSegment[] = [];

    // Check if element has inline children that need styled segments
    const hasInlineChildren = (childrenMap.get(node.index) || []).some(childIdx => {
      const child = nodes[childIdx];
      return child && child.nodeType === 1 && INLINE_TAGS.includes(child.nodeName.toLowerCase());
    });

    // Text-containing tags that should collect styled segments
    const TEXT_CONTENT_TAGS = [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "span", "li", "a", "label", "button",
      "strong", "em", "b", "i", "small",
    ];

    if (!aggregatedText) {
      if (tag === "li" || tag === "a") {
        aggregatedText = collectAllInlineText(node.index, nodes, childrenMap);
      } else {
        aggregatedText = collectDirectText(node.index, nodes, childrenMap);
      }
    }

    // Collect styled segments for elements with inline children
    if (hasInlineChildren && TEXT_CONTENT_TAGS.includes(tag)) {
      // Parse parent's text-decoration
      const rawTextDecoration = computedStyles["text-decoration"] ||
                                computedStyles["text-decoration-line"] || "";
      let parentTextDecoration: "underline" | "line-through" | "none" | undefined;
      if (rawTextDecoration.includes("underline")) {
        parentTextDecoration = "underline";
      } else if (rawTextDecoration.includes("line-through")) {
        parentTextDecoration = "line-through";
      }

      const parentStyles = {
        color: textColor,
        fontWeight,
        fontSize,
        fontFamily,
        fontFamilyList,
        textDecoration: parentTextDecoration,
      };
      styledSegments = collectStyledText(node.index, nodes, childrenMap, parentStyles);

      // Also update aggregatedText from styled segments (full text)
      if (styledSegments.length > 0) {
        aggregatedText = styledSegments.map(seg => seg.text).join("");
      }
    }

    // Get list-style-type for <li> elements
    const listStyleType = tag === "li"
      ? (computedStyles["list-style-type"] || "disc")
      : undefined;

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
      fontFamilyList,
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      textAlign,
      textContent: frameTextContent,
      styledSegments: styledSegments.length > 0 ? styledSegments : undefined,
      listStyleType,
      opacity,
      isPlaceholder: isMedia,
      horizontallyCentered: horizontallyCentered || undefined,
      children: [],
      hoverStyles: hoverStyles || undefined,
      computedStyles: filterDefaultStyles(computedStyles),
      textColorVariable: textColorVariableRef || undefined,
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

    // Get real text bounds from textBoxes (if available)
    // This gives us the actual rendered text position and size
    const textBounds = node.bounds
      ? collectTextBoxes(node.index, nodes, childrenMap, node.bounds, browserDpr)
      : null;

    // Count text lines from browser (from textBoxes.length)
    const browserLineCount = countTextLines(node.index, nodes, childrenMap);

    // Set browserLineCount for text elements
    if (elementType === "text" && browserLineCount > 0) {
      element.browserLineCount = browserLineCount;
    }

    // Add synthetic text child for list items
    // Note: Don't require element.children.length === 0 because ::before pseudo-elements
    // are already added as children, but we still need the text content
    if (isListItemWithText && finalText) {
      // Check if we already have a text child with the same content (avoid duplicates)
      const hasTextChild = element.children.some(
        (c) => c.type === "text" && c.textContent?.trim() === finalText?.trim()
      );
      if (!hasTextChild) {
        // Use textBounds if available, otherwise fallback to calculated position
        const bulletWidth = padding.left || 16;
        const textWidth = textBounds ? textBounds.width : width - bulletWidth - padding.right;
        let textX = textBounds ? textBounds.x : bulletWidth;
        const textY = textBounds ? textBounds.y : 0;
        const textHeight = textBounds ? textBounds.height : height;

        // Safety: if ::before child exists and textX < padding.left, the text
        // should start after the bullet area (padding.left)
        const hasPseudoBefore = element.children.some(
          (c) => c.tag === "::before"
        );
        if (hasPseudoBefore && textX < (padding.left || 0)) {
          textX = padding.left || bulletWidth;
        }

        // Add bullet character to styled segments (for proper bullet rendering)
        const bulletChar = getBulletCharacter(listStyleType || "disc");
        const bulletSpacing = "  "; // Two spaces between bullet and text

        // Create styled segments with bullet
        let textWithBulletSegments: StyledTextSegment[] = [];
        if (bulletChar) {
          // Add bullet as first segment
          textWithBulletSegments.push({
            text: bulletChar + bulletSpacing,
            color: textColor,
            fontWeight,
            fontSize,
            fontFamily,
            tag: "::marker",
          });

          // Add text segments
          if (styledSegments.length > 0) {
            textWithBulletSegments.push(...styledSegments);
          } else {
            textWithBulletSegments.push({
              text: finalText,
              color: textColor,
              fontWeight,
              fontSize,
              fontFamily,
              tag: "li",
            });
          }
        }

        // Create text child with full text (including bullet)
        const fullTextWithBullet = bulletChar
          ? bulletChar + bulletSpacing + finalText
          : finalText;

        const textChild = createSyntheticTextChild(
          textWidth,
          textHeight,
          textColor,
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
          textAlign,
          fullTextWithBullet,
          textX,
          textY,
          browserLineCount,
          element.computedStyles
        );
        textChild.fontFamilyList = fontFamilyList;

        // Add styled segments to the text child
        if (textWithBulletSegments.length > 0) {
          textChild.styledSegments = textWithBulletSegments;
        }

        element.children.push(textChild);
      }
    }

    // Add synthetic text child for wrapped text elements (buttons, etc.)
    if (shouldBeFrameWithTextChild && finalText) {
      // Use textBounds if available for exact positioning
      const textWidth = textBounds ? textBounds.width : width - padding.left - padding.right;
      const textX = textBounds ? textBounds.x : padding.left;
      const textY = textBounds ? textBounds.y : padding.top;
      const textHeight = textBounds ? textBounds.height : height - padding.top - padding.bottom;

      const textChild = createSyntheticTextChild(
        textWidth,
        textHeight,
        textColor,
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight,
        letterSpacing,
        textAlign,
        finalText,
        textX,
        textY,
        browserLineCount,
        element.computedStyles
      );
      textChild.fontFamilyList = fontFamilyList;

      // Pass through styled segments if available
      if (styledSegments.length > 0) {
        textChild.styledSegments = styledSegments;
      }

      element.children.push(textChild);
    }

    // Add synthetic text child for links
    // Note: Don't require element.children.length === 0 because some links may have
    // pseudo-elements or other children, but we still need the text content
    if (isLinkWithText && finalText) {
      // Recursively check if any descendant already has the same text (avoid duplicates)
      // This handles cases like <a><div><span>Text</span></div></a> where text is nested
      const hasTextInDescendants = (children: ExtractedElement[]): boolean => {
        for (const c of children) {
          if (c.type === "text" && c.textContent?.trim() === finalText?.trim()) {
            return true;
          }
          if (c.children?.length > 0 && hasTextInDescendants(c.children)) {
            return true;
          }
        }
        return false;
      };
      if (!hasTextInDescendants(element.children)) {
        // Use textBounds if available for exact positioning
        const textWidth = textBounds ? textBounds.width : width - padding.left - padding.right;
        const textX = textBounds ? textBounds.x : padding.left;
        const textY = textBounds ? textBounds.y : padding.top;
        const textHeight = textBounds ? textBounds.height : height - padding.top - padding.bottom;

        const textChild = createSyntheticTextChild(
          textWidth,
          textHeight,
          textColor,
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
          textAlign,
          finalText,
          textX,
          textY,
          browserLineCount,
          element.computedStyles
        );

        textChild.fontFamilyList = fontFamilyList;

        // Pass through styled segments if available
        if (styledSegments.length > 0) {
          textChild.styledSegments = styledSegments;
        }

        element.children.push(textChild);
      }
    }

    return element;
  }

  const tree = buildNode(bodyNode, 0, 0, 0);
  if (!tree) {
    throw new Error("Failed to build element tree");
  }

  // Override body width to viewport
  tree.width = viewportWidth;

  return tree;
}
