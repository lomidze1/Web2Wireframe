/**
 * Tree Builder - Builds ExtractedElement tree from parsed snapshot
 *
 * This is the main extraction logic that converts DOM + CSS into Figma-ready elements.
 * Used by both Browser Extension and Plugin_Backend.
 */

import type { ExtractedElement, CDPMatchedStyles, StyledTextSegment, PlatformFontInfo, PseudoStateStyles } from "./types";
import type { ParsedSnapshotNode, ParsedIframeDocument } from "./snapshot";
import { extractPropertyFromMatchedRules, extractPseudoContentFromMatchedStyles, type RuntimePseudoContent } from "./css";
import {
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseFilterToEffects,
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
  resolveUrl,
  computeStructuralSelector,
} from "./utils";
import {
  SKIP_TAGS,
  TEXT_TAGS,
  MEDIA_TAGS,
  MAX_TREE_DEPTH,
} from "./constants";
import { isObfuscatedFont, deriveWeightFromPlatformFont } from "./font-utils";
import { computeListMarkers, formatListMarker, type ListItemSpec } from "./list-markers";

// ============================================================================
// VISIBILITY HELPERS
// ============================================================================

/**
 * Check if element is hidden by clip-path (sr-only accessibility pattern).
 * Common patterns: inset(50%), inset(100%), inset(0px 0px 99.9% 99.9%)
 */
export function isHiddenByClipPath(styles: Record<string, string>): boolean {
  const clipPath = styles["clip-path"];
  if (!clipPath || clipPath === "none") return false;
  return clipPath === "inset(50%)" || clipPath === "inset(100%)";
}

/**
 * Resolve text color considering -webkit-text-fill-color override.
 * -webkit-text-fill-color takes priority over CSS color when they differ.
 * Returns parsed color string (hex) or null.
 */
export function resolveTextColor(
  styles: Record<string, string>
): string | null {
  const textFillColor = styles["-webkit-text-fill-color"];
  const cssColor = styles["color"];

  // Use text-fill-color when it exists and differs from color
  if (textFillColor && textFillColor !== cssColor) {
    const parsed = parseColor(textFillColor);
    // If text-fill-color is transparent (e.g. rgba(0,0,0,0)), fall back to CSS color
    if (parsed) return parsed;
  }

  return cssColor ? parseColor(cssColor) : null;
}

/**
 * Determine text truncation mode from CSS text-overflow.
 */
export function getTextTruncation(
  styles: Record<string, string>
): "ENDING" | undefined {
  return styles["text-overflow"] === "ellipsis" ? "ENDING" : undefined;
}

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
  /** Map from backendNodeId to actual rendered platform fonts (from CSS.getPlatformFontsForNode) */
  platformFontMap?: Map<number, PlatformFontInfo[]>;
  /** Document URL for resolving relative imageUrl values (from parseSnapshot) */
  documentURL?: string;
  /** Map from backendNodeId to pseudo-state styles (from capturePseudoStatesForNodes) */
  pseudoStateStylesMap?: Map<number, PseudoStateStyles>;
  /** Map from backendNodeId to PlatformFontInfo[] for icon pseudo-elements (Layer #4) */
  iconPlatformFontMap?: Map<number, PlatformFontInfo[]>;
  /** Map from backendNodeId to runtime-extracted pseudo-element content (fallback when snapshot misses ::before) */
  runtimePseudoContentMap?: Map<number, RuntimePseudoContent>;
  /** Optional: build tree starting from this node index instead of <body> (for subtree/inspect-mode extraction) */
  rootNodeIndex?: number;
  /** Optional: restrict tree to only these node indices (for subtree extraction — prevents siblings leaking in) */
  subtreeNodeIndices?: Set<number>;
  /** Optional: iframe document content for traversal (Layer #6) — keyed by documents[] index */
  iframeDocuments?: Map<number, ParsedIframeDocument>;
}

// ============================================================================
// MEDIA FALLBACK DIMENSIONS
// ============================================================================

/** Minimum fallback size for media elements when no other sizing is available */
const MIN_MEDIA_FALLBACK = 150;

/** Default aspect ratio (height/width) for media fallback: 3:4 */
const DEFAULT_ASPECT_RATIO = 0.75;

/**
 * Get fallback dimension for media elements (img, video, etc.) with 0 bounds.
 *
 * When Puppeteer blocks external requests (SSRF protection), images don't load
 * and the browser reports 0×0 bounds. This function provides fallback sizing:
 *
 * Priority:
 * 1. HTML width/height attributes (most accurate)
 * 2. Derive from other dimension using aspect ratio (if one dimension is known)
 * 3. Parent container proportion (50% of parent)
 * 4. Minimum fallback (150px)
 *
 * @param dimension - Which dimension to resolve ("width" or "height")
 * @param attributes - HTML element attributes (may contain width/height)
 * @param currentValue - Current resolved value (0 means needs fallback)
 * @param otherDimension - The other dimension's resolved value (for aspect ratio)
 * @param parentSize - Parent container size for this dimension
 */
export function getMediaFallbackDimension(
  dimension: "width" | "height",
  attributes: Record<string, string>,
  currentValue: number,
  otherDimension: number,
  parentSize: number
): number {
  // No fallback needed
  if (currentValue > 0) return currentValue;

  // Priority 1: HTML attributes
  const attrValue = parseFloat(attributes[dimension]);
  if (!isNaN(attrValue) && attrValue > 0) return attrValue;

  // Priority 2: Derive from other dimension using aspect ratio
  if (otherDimension > 0) {
    return dimension === "height"
      ? otherDimension * DEFAULT_ASPECT_RATIO
      : otherDimension / DEFAULT_ASPECT_RATIO;
  }

  // Priority 3: Parent container proportion (50%)
  if (parentSize > 0) return parentSize * 0.5;

  // Priority 4: Minimum fallback
  return MIN_MEDIA_FALLBACK;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get sub-pixel dimension from computedStyles instead of integer layout.bounds.
 *
 * DOMSnapshot layout.bounds width/height are snapped to integer CSS pixels.
 * But computedStyles["width"]/["height"] preserve sub-pixel precision.
 *
 * For box-sizing: border-box → computedStyles.width = border-box width (use directly)
 * For box-sizing: content-box → computedStyles.width = content width (add padding + border)
 */
function getSubPixelDimension(
  computedStyles: Record<string, string>,
  dimension: "width" | "height",
  fallback: number
): number {
  const csValue = parseFloat(computedStyles[dimension]);
  if (isNaN(csValue) || csValue <= 0) return fallback;

  const boxSizing = computedStyles["box-sizing"];

  if (boxSizing === "border-box") {
    // computedStyles.width/height already includes padding + border
    return csValue;
  }

  // content-box (default): add padding + border to get visual/border-box size
  if (dimension === "width") {
    const pL = parseFloat(computedStyles["padding-left"]) || 0;
    const pR = parseFloat(computedStyles["padding-right"]) || 0;
    const bL = parseFloat(computedStyles["border-left-width"]) || 0;
    const bR = parseFloat(computedStyles["border-right-width"]) || 0;
    return csValue + pL + pR + bL + bR;
  } else {
    const pT = parseFloat(computedStyles["padding-top"]) || 0;
    const pB = parseFloat(computedStyles["padding-bottom"]) || 0;
    const bT = parseFloat(computedStyles["border-top-width"]) || 0;
    const bB = parseFloat(computedStyles["border-bottom-width"]) || 0;
    return csValue + pT + pB + bT + bB;
  }
}

/**
 * Extract rotation angle (degrees) from CSS transform.
 * Handles: rotate(Xdeg), matrix(a, b, c, d, tx, ty) → atan2(b, a)
 * Returns 0 if no rotation or transform is none/unset.
 */
function extractRotationFromTransform(transform: string | undefined): number {
  if (!transform || transform === "none") return 0;

  // Direct rotate() function
  const rotateMatch = transform.match(/rotate\s*\(\s*(-?[\d.]+)deg\s*\)/i);
  if (rotateMatch) {
    return parseFloat(rotateMatch[1]);
  }

  // 2D matrix(a, b, c, d, tx, ty) → rotation = atan2(b, a)
  const matrixMatch = transform.match(
    /matrix\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/
  );
  if (matrixMatch) {
    const a = parseFloat(matrixMatch[1]);
    const b = parseFloat(matrixMatch[2]);
    const angle = Math.atan2(b, a) * (180 / Math.PI);
    // Only return if non-trivial rotation
    if (Math.abs(angle) > 0.1) {
      return Math.round(angle * 100) / 100;
    }
  }

  return 0;
}

/**
 * Collect raw textBox data (y, height) from direct TEXT_NODE children.
 * Used for accurate per-line line-height computation.
 */
function collectRawTextBoxes(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
  browserDpr: number
): Array<{ y: number; height: number }> {
  const result: Array<{ y: number; height: number }> = [];
  const childIndices = childrenMap.get(nodeIndex) || [];

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (child && child.nodeName && child.nodeName.startsWith("::")) continue;
    if (child && child.textBoxes) {
      for (const box of child.textBoxes) {
        result.push({ y: box.y / browserDpr, height: box.height / browserDpr });
      }
    }
  }

  // Also check parent element's own textBoxes
  const parentNode = nodes[nodeIndex];
  if (parentNode && parentNode.textBoxes) {
    for (const box of parentNode.textBoxes) {
      result.push({ y: box.y / browserDpr, height: box.height / browserDpr });
    }
  }

  return result;
}

/**
 * Flatten display:contents elements out of a child list.
 * Elements with display:contents have no box — their children are promoted
 * to the parent's child list (recursively for nested display:contents).
 */
function flattenDisplayContents(
  childIndices: number[],
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): number[] {
  const result: number[] = [];
  for (const idx of childIndices) {
    const child = nodes[idx];
    if (child && child.nodeType === 1 && child.computedStyles["display"] === "contents") {
      // Promote this element's children in place (recursive)
      const grandChildren = childrenMap.get(idx) || [];
      result.push(...flattenDisplayContents(grandChildren, nodes, childrenMap));
    } else {
      result.push(idx);
    }
  }
  return result;
}

/**
 * Extract the effective overflow value from computed styles.
 * Considers overflow-x and overflow-y individually; returns the most
 * restrictive value, or undefined if visible (default).
 */
function getOverflowValue(
  computedStyles: Record<string, string>
): ExtractedElement["overflow"] | undefined {
  const ox = computedStyles["overflow-x"] || computedStyles["overflow"] || "visible";
  const oy = computedStyles["overflow-y"] || computedStyles["overflow"] || "visible";

  // Pick the most restrictive between the two axes
  const pick = (v: string): ExtractedElement["overflow"] | null => {
    if (v === "hidden" || v === "clip") return "hidden";
    if (v === "scroll") return "scroll";
    if (v === "auto") return "auto";
    return null;
  };

  const rx = pick(ox);
  const ry = pick(oy);

  // If either axis is hidden, the element clips
  if (rx === "hidden" || ry === "hidden") return "hidden";
  if (rx === "scroll" || ry === "scroll") return "scroll";
  if (rx === "auto" || ry === "auto") return "auto";

  return undefined; // visible = default, omit
}

/**
 * Check if an element's subtree contains only images/placeholders
 * and no meaningful text content. Used to detect background image containers
 * (e.g., apple.com's tile-image-wrapper with position:absolute).
 */
function isImageOnlySubtree(el: ExtractedElement): boolean {
  if (el.type === "placeholder") return true;
  if (el.type === "text") return false;
  if (el.textContent?.trim()) return false;
  if (!el.children || el.children.length === 0) {
    // Empty frame — only "image" if it has image fills
    return el.fills?.some(f => f.type === "IMAGE_PLACEHOLDER") ?? false;
  }
  return el.children.every(c => isImageOnlySubtree(c));
}

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
export function collectDirectText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): string {
  const childIndices = childrenMap.get(nodeIndex) || [];
  const processedParts: string[] = [];
  let hasElementChildren = false;

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (child && child.nodeType === 3 && child.textContent) {
      // Normalize source whitespace per-part (NOT on final result)
      processedParts.push(child.textContent.replace(/[\r\n\t]+/g, " "));
    }
    if (child && child.nodeType === 1) {
      if (child.nodeName === "br") {
        processedParts.push("\n");
      } else {
        hasElementChildren = true;
      }
    }
  }

  let result = processedParts.join("").replace(/ {2,}/g, " ");

  if (hasElementChildren) {
    result = result.replace(/^\s+/, "");
  } else {
    // Trim spaces but keep \n at boundaries
    result = result.replace(/^[^\S\n]+/, "").replace(/[^\S\n]+$/, "");
  }

  return result;
}

/**
 * Recursively collect ALL text from inline elements
 */
export function collectAllInlineText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): string {
  const node = nodes[nodeIndex];
  if (!node) return "";

  // TEXT_NODE — normalize source whitespace immediately
  if (node.nodeType === 3) {
    return (node.textContent || "").replace(/[\r\n\t]+/g, " ");
  }

  // BR element → explicit line break
  if (node.nodeType === 1 && node.nodeName === "br") {
    return "\n";
  }

  const childIndices = childrenMap.get(nodeIndex) || [];
  const textParts: string[] = [];

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    // Skip pseudo-elements (::before, ::after, ::marker) — their content
    // is extracted separately as child text nodes in buildNode
    if (child && child.nodeName && child.nodeName.startsWith("::")) continue;
    const childText = collectAllInlineText(childIdx, nodes, childrenMap);
    if (childText) {
      textParts.push(childText);
    }
  }

  // Join with space, but don't add space around \n from <br>
  let result = "";
  for (let i = 0; i < textParts.length; i++) {
    const part = textParts[i];
    if (i > 0 && part !== "\n" && !result.endsWith("\n")) {
      result += " ";
    }
    result += part;
  }

  result = result.replace(/ {2,}/g, " ").trim();
  return result;
}

/**
 * Check if element is a "leaf" text element (has no element children)
 */
export function isLeafElement(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): boolean {
  const childIndices = childrenMap.get(nodeIndex) || [];

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    if (!child) continue;
    // Element nodes (nodeType 1) except <br> make parent non-leaf
    if (child.nodeType === 1 && child.nodeName !== "br") {
      return false;
    }
    // Pseudo-elements (nodeType -1: ::before, ::after, ::marker) also make parent non-leaf
    if (child.nodeType === -1) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a string is a single icon font glyph (Unicode Private Use Area).
 * PUA ranges: U+E000–U+F8FF (BMP), U+F0000–U+FFFFD, U+100000–U+10FFFD.
 * These glyphs are NOT human-readable text and should not count as "text content"
 * when deciding whether a <li> already has text children.
 */
export function isIconGlyph(text: string): boolean {
  if (!text || text.length === 0) return false;
  const code = text.codePointAt(0) || 0;
  // Single character (1-2 code units for surrogate pairs)
  const charLen = code > 0xFFFF ? 2 : 1;
  if (text.length !== charLen) return false;
  // BMP Private Use Area
  if (code >= 0xE000 && code <= 0xF8FF) return true;
  // Supplementary PUA-A and PUA-B
  if (code >= 0xF0000 && code <= 0x10FFFD) return true;
  return false;
}

/**
 * Inline tags that should be collected as styled segments (not as separate elements)
 */
const INLINE_TAGS = [
  "a", "span", "strong", "em", "b", "i", "u", "s", "small", "mark",
  "sub", "sup", "code", "kbd", "var", "abbr", "cite", "q", "del", "ins",
];

// ============================================================================
// ICON FONT DETECTION & PSEUDO-ELEMENT EXTRACTION
// ============================================================================

/**
 * Known icon font family patterns (lowercase).
 * Checked via substring match against font-family values.
 */
const ICON_FONT_PATTERNS = [
  "font awesome", "fontawesome", "fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-thin",
  "material icons", "material symbols",
  "bootstrap-icons", "remixicon", "icomoon", "ionicons",
  "boxicons", "phosphor", "tabler-icons", "lucide",
  "typicons", "linearicons", "simple-line-icons", "feather",
];

/**
 * Check if a font family name is a known icon font.
 * Case-insensitive, handles quoted values.
 */
export function isIconFont(fontFamily: string): boolean {
  if (!fontFamily) return false;
  const lower = fontFamily.toLowerCase().replace(/['"]/g, "").trim();
  return ICON_FONT_PATTERNS.some(pattern => lower.includes(pattern));
}

function hasIconClassHint(className: string | undefined): boolean {
  if (!className) return false;
  const lower = className.toLowerCase();
  return (
    lower.includes("fa-") ||
    lower.includes(" fas ") ||
    lower.startsWith("fas ") ||
    lower.endsWith(" fas") ||
    lower === "fas" ||
    lower.includes(" far ") ||
    lower.startsWith("far ") ||
    lower.endsWith(" far") ||
    lower === "far" ||
    lower.includes(" fab ") ||
    lower.startsWith("fab ") ||
    lower.endsWith(" fab") ||
    lower === "fab" ||
    lower.includes("material-icons") ||
    lower.includes("material-symbols")
  );
}

function extractFontFamilyList(rawFontFamily: string): string[] {
  return rawFontFamily
    .split(",")
    .map((f: string) => f.replace(/['"]/g, "").trim())
    .filter((f: string) => f.length > 0);
}

/**
 * Extract icon content from ::before/::after pseudo-element children.
 * Only extracts when the pseudo-element uses an icon font family.
 *
 * @returns Icon data (text glyph, font info, color) or null if no icon pseudo-element found
 */
export function extractPseudoIconContent(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
  iconPlatformFontMap?: Map<number, PlatformFontInfo[]>,
  runtimePseudoContentMap?: Map<number, RuntimePseudoContent>,
  matchedStylesMap?: Map<number, CDPMatchedStyles>
): {
  text: string;
  fontFamily: string;
  fontFamilyList: string[];
  fontSize: number;
  fontWeight: number;
  color: string | null;
  tag: string;
} | null {
  const childIndices = childrenMap.get(nodeIndex) || [];
  const parentNode = nodes[nodeIndex];

  // Prefer ::before over ::after (most icon fonts use ::before)
  for (const pseudoName of ["::before", "::after"]) {
    for (const childIdx of childIndices) {
      const child = nodes[childIdx];
      if (!child) continue;
      if (child.nodeName !== pseudoName) continue;
      if (child.nodeType !== -1 && child.nodeType !== 1) continue;

      const text = (child.textContent || "").trim();
      if (!text) continue;

      const parentFontFamily = parentNode?.computedStyles["font-family"] || "";
      const rawFontFamily = child.computedStyles["font-family"] || parentFontFamily;
      const fontFamilyList = extractFontFamilyList(rawFontFamily);
      const primaryFont = fontFamilyList[0] || "";
      const iconFonts = iconPlatformFontMap?.get(parentNode?.backendNodeId);
      const classHint = hasIconClassHint(parentNode?.attributes.class);

      if (!isIconFont(primaryFont) && !classHint && !(iconFonts && iconFonts.length > 0)) {
        continue;
      }

      // Check if we have platform font data for this icon node (Layer #4)
      if (iconFonts && iconFonts.length > 0) {
        // Pick font with highest glyphCount (actual rendered font)
        const primary = iconFonts.reduce((a, b) => a.glyphCount >= b.glyphCount ? a : b);
        return {
          text,
          fontFamily: primary.familyName,
          fontFamilyList: [primary.familyName],
          fontSize: parseInt(child.computedStyles["font-size"] || "16") || 16,
          fontWeight: parseInt(child.computedStyles["font-weight"] || "400") || 400,
          color: parseColor(child.computedStyles["color"]) || null,
          tag: pseudoName,
        };
      }

      return {
        text,
        fontFamily: primaryFont,
        fontFamilyList,
        fontSize: parseInt(child.computedStyles["font-size"] || "16") || 16,
        fontWeight: parseInt(child.computedStyles["font-weight"] || "400") || 400,
        color: parseColor(child.computedStyles["color"]) || null,
        tag: pseudoName,
      };
    }
  }

  // Fallback 1: use runtime-extracted pseudo-element content when snapshot didn't capture it.
  // This handles the case where DOMSnapshot doesn't include ::before/::after with layout data.
  if (runtimePseudoContentMap && parentNode) {
    const runtimeData = runtimePseudoContentMap.get(parentNode.backendNodeId);
    if (runtimeData) {
      return {
        text: runtimeData.text,
        fontFamily: runtimeData.fontFamily,
        fontFamilyList: [runtimeData.fontFamily],
        fontSize: runtimeData.fontSize,
        fontWeight: runtimeData.fontWeight,
        color: runtimeData.color,
        tag: "::before",
      };
    }
  }

  // Fallback 2: extract content from CSS matched styles (most reliable for icon fonts).
  // CSS.getMatchedStylesForNode returns the `content` property directly from the stylesheet
  // (e.g., `.fa-pen-ruler::before { content: "\f5ae" }`), which doesn't depend on font loading
  // or DOM snapshot completeness.
  if (matchedStylesMap && parentNode) {
    const matchedStyles = matchedStylesMap.get(parentNode.backendNodeId);
    if (matchedStyles) {
      for (const pseudoType of ["before", "after"] as const) {
        const matchedContent = extractPseudoContentFromMatchedStyles(matchedStyles, pseudoType);
        if (matchedContent && matchedContent.text) {
          // Use parent's computed styles if matched styles don't have font info
          const parentFontFamily = parentNode.computedStyles["font-family"] || "";
          const fontFamilyList = extractFontFamilyList(
            matchedContent.fontFamily || parentFontFamily
          );
          const primaryFont = fontFamilyList[0] || matchedContent.fontFamily;

          return {
            text: matchedContent.text,
            fontFamily: primaryFont || "Font Awesome 6 Free",
            fontFamilyList: fontFamilyList.length > 0 ? fontFamilyList : [primaryFont],
            fontSize: matchedContent.fontSize || parseInt(parentNode.computedStyles["font-size"] || "16") || 16,
            fontWeight: matchedContent.fontWeight || parseInt(parentNode.computedStyles["font-weight"] || "400") || 400,
            color: matchedContent.color || parseColor(parentNode.computedStyles["color"]) || null,
            tag: `::${pseudoType}`,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Find nodes that have ::before/::after children using icon fonts.
 * These need getPlatformFontForPseudoElement for accurate font detection.
 */
export function findIconFontNodes(
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): Array<{ backendNodeId: number; index: number; pseudoType: "before" | "after" }> {
  const result: Array<{ backendNodeId: number; index: number; pseudoType: "before" | "after" }> = [];
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    const childIndices = childrenMap.get(node.index) || [];
    for (const childIdx of childIndices) {
      const child = nodes[childIdx];
      if (!child) continue;
      if (child.nodeName !== "::before" && child.nodeName !== "::after") continue;
      const text = (child.textContent || "").trim();
      if (!text) continue;
      const fontFamily = child.computedStyles["font-family"] || node.computedStyles["font-family"] || "";
      if (isIconFont(fontFamily) || hasIconClassHint(node.attributes.class)) {
        result.push({
          backendNodeId: node.backendNodeId,
          index: node.index,
          pseudoType: child.nodeName === "::before" ? "before" : "after",
        });
        break; // One entry per parent node
      }
    }
  }
  return result;
}

/**
 * Find elements with icon class hints (fa-*, material-icons, etc.) whose pseudo-element
 * content was NOT captured by DOMSnapshot. These need runtime extraction via
 * getComputedStyle(el, '::before') as a fallback.
 *
 * This complements findIconFontNodes(): that function finds nodes where the snapshot
 * DID include the pseudo child; this function finds nodes where it DIDN'T.
 */
export function findIconClassElements(
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
): Array<{ backendNodeId: number; index: number; pseudoType: "before" | "after" }> {
  const result: Array<{ backendNodeId: number; index: number; pseudoType: "before" | "after" }> = [];
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    if (!hasIconClassHint(node.attributes.class)) continue;

    // Check if snapshot already has a usable pseudo child with text content
    const childIndices = childrenMap.get(node.index) || [];
    let hasUsablePseudoChild = false;
    for (const childIdx of childIndices) {
      const child = nodes[childIdx];
      if (!child) continue;
      if (child.nodeName !== "::before" && child.nodeName !== "::after") continue;
      const text = (child.textContent || "").trim();
      if (text) {
        hasUsablePseudoChild = true;
        break;
      }
    }

    if (!hasUsablePseudoChild) {
      result.push({
        backendNodeId: node.backendNodeId,
        index: node.index,
        pseudoType: "before", // Default to ::before (most icon fonts use it)
      });
    }
  }
  return result;
}

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
export function collectStyledText(
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
  },
  platformFontMap?: Map<number, PlatformFontInfo[]>,
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

      // <br> → append \n to last segment (or create new one)
      if (tag === "br") {
        if (segments.length > 0) {
          segments[segments.length - 1].text += "\n";
        } else {
          segments.push({
            text: "\n",
            color: parentStyles.color,
            fontWeight: parentStyles.fontWeight,
            fontSize: parentStyles.fontSize,
            fontFamily: parentStyles.fontFamily,
            fontFamilyList: parentStyles.fontFamilyList,
            tag: node.nodeName,
            textDecoration: parentStyles.textDecoration,
          });
        }
        continue;
      }

      if (INLINE_TAGS.includes(tag)) {
        // Get this element's computed styles
        const childColor = parseColor(child.computedStyles["color"]) || parentStyles.color;
        let childFontWeight = parseInt(child.computedStyles["font-weight"] || "0") || parentStyles.fontWeight;
        const childFontSize = parseInt(child.computedStyles["font-size"] || "0") || parentStyles.fontSize;
        // Prefer platform font (actual rendered) > computed styles
        let childFontFamilyRaw = child.computedStyles["font-family"] || parentStyles.fontFamily;
        const childPlatformFonts = platformFontMap?.get(child.backendNodeId);
        if (childPlatformFonts && childPlatformFonts.length > 0) {
          const primary = childPlatformFonts.reduce((a, b) => a.glyphCount >= b.glyphCount ? a : b);
          // Skip obfuscated font names
          if (!isObfuscatedFont(primary)) {
            childFontFamilyRaw = primary.familyName;
          }
          // Derive weight from variable font postScriptName or familyName keyword
          const derivedChildWeight = deriveWeightFromPlatformFont(primary);
          if (derivedChildWeight !== null) {
            childFontWeight = derivedChildWeight;
          }
        }
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

        // Parse text-decoration sub-properties
        const childTextDecorationColor = child.computedStyles["text-decoration-color"] || undefined;
        const rawDecoStyle = child.computedStyles["text-decoration-style"];
        const childTextDecorationStyle = (rawDecoStyle && ["solid", "double", "dotted", "dashed", "wavy"].includes(rawDecoStyle))
          ? rawDecoStyle as "solid" | "double" | "dotted" | "dashed" | "wavy"
          : undefined;
        const rawDecoThickness = child.computedStyles["text-decoration-thickness"];
        const childTextDecorationThickness = rawDecoThickness ? parseFloat(rawDecoThickness) || undefined : undefined;

        // Recursively collect text from this inline element
        const childStyles = {
          color: childColor,
          fontWeight: childFontWeight,
          fontSize: childFontSize,
          fontFamily: childFontFamily,
          fontFamilyList: childFontFamilyList,
          textDecoration: childTextDecoration,
        };

        const childSegments = collectStyledText(childIdx, nodes, childrenMap, childStyles, platformFontMap);

        // Mark segments from inline elements with their tag
        for (const seg of childSegments) {
          segments.push({
            ...seg,
            tag: tag,
            isLink: tag === "a",
            textDecoration: seg.textDecoration || childTextDecoration,
            textDecorationColor: seg.textDecorationColor || childTextDecorationColor,
            textDecorationStyle: seg.textDecorationStyle || childTextDecorationStyle,
            textDecorationThickness: seg.textDecorationThickness || childTextDecorationThickness,
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
  "overflow-x": ["visible"],
  "overflow-y": ["visible"],
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
  "grid-column-start": ["auto"],
  "grid-column-end": ["auto"],
  "grid-row-start": ["auto"],
  "grid-row-end": ["auto"],
  "float": ["none"],
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
  computedStyles?: Record<string, string>,
  parentSelector?: string
): ExtractedElement {
  const textSelector = parentSelector ? `${parentSelector}::text` : undefined;
  return {
    id: generateId(textSelector),
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
    sourceSelector: textSelector,
    children: [],
  };
}

/**
 * Resolve "normal" line-height to a pixel value using browser text rendering data.
 * Browser's "normal" ≈ 1.2× fontSize, but Figma's AUTO ≈ 1.4× fontSize.
 * This mismatch causes text height inflation in auto layout mode.
 */
export function resolveNormalLineHeight(
  lineHeight: number | string,
  fontSize: number,
  textBoundsHeight: number | null,
  browserLineCount: number,
  textBoxes?: Array<{ y: number; height: number }>
): number | string {
  if (lineHeight !== "normal") return lineHeight;

  // Multi-line with raw textBoxes: use (lastLineTop - firstLineTop) / (lineCount - 1)
  // This is more accurate than totalHeight / lineCount because it's not affected
  // by trailing whitespace or descender heights.
  if (textBoxes && textBoxes.length >= 2) {
    const sorted = [...textBoxes].sort((a, b) => a.y - b.y);
    const lineSpacing = (sorted[sorted.length - 1].y - sorted[0].y) / (sorted.length - 1);
    const resolved = Math.round(lineSpacing * 100) / 100;
    if (resolved >= fontSize && resolved <= fontSize * 3) {
      return resolved;
    }
  }

  // Single-line with textBoxes: use the textBox height directly
  if (textBoxes && textBoxes.length === 1) {
    const resolved = Math.round(textBoxes[0].height * 100) / 100;
    if (resolved >= fontSize && resolved <= fontSize * 3) {
      return resolved;
    }
  }

  // Fallback: use aggregated text bounds height / line count
  if (textBoundsHeight !== null && browserLineCount > 0) {
    const resolved = Math.round((textBoundsHeight / browserLineCount) * 100) / 100;
    // Sanity: line-height >= fontSize and <= 3× fontSize
    if (resolved >= fontSize && resolved <= fontSize * 3) {
      return resolved;
    }
  }
  // Fallback: CSS spec "normal" ≈ 1.2× fontSize
  return Math.round(fontSize * 1.2 * 100) / 100;
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
    platformFontMap,
    documentURL,
    rootNodeIndex,
    subtreeNodeIndices,
    iframeDocuments,
  } = options;

  // Find root node: use rootNodeIndex for subtree extraction, or <body> for full-page
  let rootNode: ParsedSnapshotNode | undefined;
  if (rootNodeIndex !== undefined) {
    rootNode = nodes.find((n) => n.index === rootNodeIndex);
    if (!rootNode) {
      throw new Error(`Could not find root element at index ${rootNodeIndex}`);
    }
  } else {
    rootNode = nodes.find((n) => n.nodeName === "body");
    if (!rootNode) {
      throw new Error("Could not find body element");
    }
  }

  // Build children map (optionally filtered to subtree nodes only)
  const childrenMap = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentIndex >= 0) {
      // If subtreeNodeIndices is provided, only include nodes within the subtree
      if (subtreeNodeIndices && !subtreeNodeIndices.has(node.index)) continue;
      if (!childrenMap.has(node.parentIndex)) {
        childrenMap.set(node.parentIndex, []);
      }
      childrenMap.get(node.parentIndex)!.push(node.index);
    }
  }

  // Selector cache for deterministic identity (Layer #7)
  const selectorCache = new Map<number, string>();
  function getSelector(nodeIndex: number, prefix?: string): string {
    const cacheKey = prefix ? -(nodeIndex + 1) : nodeIndex;
    let sel = selectorCache.get(cacheKey);
    if (sel === undefined) {
      sel = computeStructuralSelector(nodeIndex, nodes, childrenMap, prefix);
      selectorCache.set(cacheKey, sel);
    }
    return sel;
  }

  // Recursive tree builder
  function buildNode(
    node: ParsedSnapshotNode,
    parentX: number,
    parentY: number,
    depth: number,
    parentContext?: {
      direction: "HORIZONTAL" | "VERTICAL" | "NONE" | "GRID";
      alignItems?: string;
      contentWidth?: number;
      contentHeight?: number;
      isGridChild?: boolean;
      parentTag?: string;
    }
  ): ExtractedElement | null {
    if (depth > MAX_TREE_DEPTH) return null;

    const tag = node.nodeName;

    // Handle text nodes (nodeType === 3) as leaf TEXT elements
    if (node.nodeType === 3) {
      const textContent = (node.textContent || "").replace(/[\r\n\t]+/g, " ").trim();
      if (!textContent) return null; // Skip whitespace-only text nodes

      // Skip text node children when parent will become type=text itself
      // (parent already carries textContent — creating a child would duplicate it)
      const parentNode = node.parentIndex >= 0 ? nodes[node.parentIndex] : null;
      if (parentNode) {
        const parentTag = parentNode.nodeName;
        const parentIsTextTag = TEXT_TAGS.includes(parentTag as (typeof TEXT_TAGS)[number]);
        const parentIsLeaf = isLeafElement(parentNode.index, nodes, childrenMap);
        // Parent becomes type=text when: (TEXT_TAG || leaf with text) && no frame wrapper needed
        // In those cases, parent.textContent already has the text — skip child
        // Exception: <li> may become FRAME (padding/border) so text child must survive
        if (parentIsTextTag || (parentIsLeaf && parentTag !== "a" && parentTag !== "li")) {
          return null;
        }
      }
      const parentStyles = parentNode?.computedStyles || {};
      const parentBounds = parentNode?.bounds || { x: 0, y: 0, width: 200, height: 20 };

      const tColor = parseColor(parentStyles["color"]) || null;
      const tFamily = extractFontFamilyList(parentStyles["font-family"] || "Inter")[0] || "Inter";
      const tSize = parseFloat(parentStyles["font-size"]) || 14;
      const tWeight = parseFloat(parentStyles["font-weight"]) || 400;
      const tLineHeight = parentStyles["line-height"] || "normal";
      const tLetterSpacing = parseFloat(parentStyles["letter-spacing"]) || 0;
      const tTextAlign = parentStyles["text-align"] || "left";
      const parentSelector = parentNode ? getSelector(parentNode.index) : undefined;

      return createSyntheticTextChild(
        parentBounds.width / browserDpr,
        parentBounds.height / browserDpr,
        tColor,
        tFamily,
        tSize,
        tWeight,
        tLineHeight,
        tLetterSpacing,
        tTextAlign,
        textContent,
        0, 0, // Relative to parent — text nodes don't have individual bounds
        undefined, // browserLineCount
        undefined, // computedStyles
        parentSelector
      );
    }

    // Skip other non-element nodes (comments, processing instructions, etc.)
    if (node.nodeType !== 1) return null;

    // Skip unwanted tags
    if (SKIP_TAGS.includes(tag as (typeof SKIP_TAGS)[number])) return null;

    // Skip invisible nodes — but keep media tags (img, video, etc.)
    // that may have 0 bounds due to unloaded resources (e.g., SSRF blocking)
    const isMediaForFilter = MEDIA_TAGS.includes(tag as (typeof MEDIA_TAGS)[number]);
    if (!node.bounds || ((node.bounds.width < 1 || node.bounds.height < 1) && !isMediaForFilter))
      return null;

    const computedStylesEarly = node.computedStyles;

    // Skip visibility: hidden elements
    if (computedStylesEarly["visibility"] === "hidden") return null;

    // Skip clip-hidden elements (accessibility sr-only patterns)
    if (isHiddenByClipPath(computedStylesEarly)) return null;

    // Scale bounds by devicePixelRatio
    const scaledBounds = node.bounds ? {
      x: node.bounds.x / browserDpr,
      y: node.bounds.y / browserDpr,
      width: node.bounds.width / browserDpr,
      height: node.bounds.height / browserDpr,
    } : { x: 0, y: 0, width: 0, height: 0 };

    const { x, y } = scaledBounds;
    const computedStyles = node.computedStyles;
    // Sub-pixel precision from computedStyles (layout.bounds snaps to integers)
    let width = getSubPixelDimension(computedStyles, "width", scaledBounds.width);
    let height = getSubPixelDimension(computedStyles, "height", scaledBounds.height);
    const matchedStyles = matchedStylesMap.get(node.backendNodeId) || null;

    // Determine element type
    const isMediaTag = MEDIA_TAGS.includes(tag as (typeof MEDIA_TAGS)[number]);

    // Fallback dimensions for media tags with 0 bounds
    // (e.g., images blocked by SSRF protection in HTML import)
    if (isMediaTag && (width <= 0 || height <= 0)) {
      const parentW = parentContext?.contentWidth || viewportWidth;
      const parentH = parentContext?.contentHeight || 0;

      // Resolve width first (more commonly derivable from parent)
      if (width <= 0) {
        width = getMediaFallbackDimension("width", node.attributes, width, height, parentW);
      }
      // Then height (can use resolved width for aspect ratio)
      if (height <= 0) {
        height = getMediaFallbackDimension("height", node.attributes, height, width, parentH);
      }
    }
    const hasBackgroundImageUrl = Boolean(computedStyles["background-image"]?.includes("url("));
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
    } else {
      // Fallback: use computed background-image for url() backgrounds
      // (matched styles might not be fetched for simple url() backgrounds)
      const computedBgImage = computedStyles["background-image"];
      if (computedBgImage && computedBgImage.includes("url(")) {
        backgroundImage = computedBgImage;
      }
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

    // Text color — webkitTextFillColor overrides CSS color
    let textColor = resolveTextColor(computedStyles);

    // Parse strokes — per-side props (primary) + shorthand fallback.
    // Captured via snapshot.ts SNAPSHOT_COMPUTED_STYLES which now includes
    // border-{top,right,bottom,left}-style alongside width/color.
    const strokes = parseBordersToStrokes(
      {
        top: {
          width: computedStyles["border-top-width"],
          color: computedStyles["border-top-color"],
          style: computedStyles["border-top-style"],
        },
        right: {
          width: computedStyles["border-right-width"],
          color: computedStyles["border-right-color"],
          style: computedStyles["border-right-style"],
        },
        bottom: {
          width: computedStyles["border-bottom-width"],
          color: computedStyles["border-bottom-color"],
          style: computedStyles["border-bottom-style"],
        },
        left: {
          width: computedStyles["border-left-width"],
          color: computedStyles["border-left-color"],
          style: computedStyles["border-left-style"],
        },
      },
      {
        width: computedStyles["border-width"],
        color: computedStyles["border-color"],
        style: computedStyles["border-style"],
      },
      resolvedVariables,
    );

    // Attach CSS variable reference to strokes
    if (borderColorVariableRef && strokes.length > 0) {
      strokes[0].cssVariable = borderColorVariableRef;
    }

    // Legacy border fields
    const borderColor = parseColor(computedStyles["border-color"]);
    const borderWidth = parseFloat(computedStyles["border-width"] || "0") || 0;
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

    const shadowEffects = parseBoxShadowToEffects(boxShadow, resolvedVariables);

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

    // Parse CSS filter property (blur → LAYER_BLUR, drop-shadow → DROP_SHADOW)
    const cssFilter = computedStyles["filter"] || null;
    const filterEffects = parseFilterToEffects(cssFilter, resolvedVariables);

    const effects = [...shadowEffects, ...blurEffects, ...filterEffects];

    // Typography — prefer platform font (actual rendered font) > matched rules > computed styles
    // Platform fonts from CSS.getPlatformFontsForNode give the real rendered font name
    // (e.g., "PP Fragment Glare Medium" instead of PostScript abbreviation "PSA")
    let fontFamilyRaw: string | null = null;
    let derivedFontWeight: number | null = null;
    let platformFontFamily: string | undefined;
    const platformFonts = platformFontMap?.get(node.backendNodeId);
    if (platformFonts && platformFonts.length > 0) {
      // Use the font with the most glyphs rendered (primary font)
      const primary = platformFonts.reduce((a, b) => a.glyphCount >= b.glyphCount ? a : b);

      // Skip obfuscated font names (fall through to matched rules / computed styles)
      if (!isObfuscatedFont(primary)) {
        fontFamilyRaw = primary.familyName;
        platformFontFamily = primary.familyName;
      }

      // Derive weight from variable font postScriptName or familyName keyword
      derivedFontWeight = deriveWeightFromPlatformFont(primary);
    }
    if (!fontFamilyRaw && matchedStyles) {
      fontFamilyRaw = extractPropertyFromMatchedRules(matchedStyles, "font-family");
    }
    if (!fontFamilyRaw) {
      fontFamilyRaw = computedStyles["font-family"] || "Inter";
    }
    let fontFamilyList = fontFamilyRaw
      .split(",")
      .map((f: string) => f.replace(/['"]/g, "").trim())
      .filter((f: string) => f.length > 0);
    let fontFamily = fontFamilyList[0] || "Inter";
    let fontSize = parseFloat(computedStyles["font-size"] || "14") || 14;
    let fontWeight = derivedFontWeight ?? (parseInt(computedStyles["font-weight"] || "400") || 400);
    let lineHeight: number | string = computedStyles["line-height"] || "normal";
    const letterSpacing =
      parseFloat(computedStyles["letter-spacing"] || "0") || 0;
    const textAlign = computedStyles["text-align"] || "left";

    // Layout
    const padding = {
      top: parseFloat(computedStyles["padding-top"] || "0") || 0,
      right: parseFloat(computedStyles["padding-right"] || "0") || 0,
      bottom: parseFloat(computedStyles["padding-bottom"] || "0") || 0,
      left: parseFloat(computedStyles["padding-left"] || "0") || 0,
    };

    const gapStr = computedStyles["gap"] || computedStyles["row-gap"] || "0";
    const itemSpacing = parseFloat(gapStr) || 0;

    const justifyContent = computedStyles["justify-content"] || undefined;
    const alignItems = computedStyles["align-items"] || undefined;
    const flexWrap = computedStyles["flex-wrap"] || undefined;

    const flexGrowValue = parseFloat(computedStyles["flex-grow"] || "0") || 0;
    const isGridChild = parentContext?.isGridChild === true;
    const layoutGrow: 0 | 1 | undefined = (flexGrowValue > 0 || isGridChild) ? 1 : undefined;
    const alignSelf = computedStyles["align-self"];
    const layoutAlign: "STRETCH" | "INHERIT" | undefined =
      alignSelf === "stretch" ? "STRETCH" : undefined;

    const layoutSizing = getLayoutSizing(computedStyles, flexGrowValue, alignSelf, parentContext);

    // Override FILL → FIXED: if child is significantly smaller than parent content area,
    // it's not actually stretching (explicit width or inline content sizing).
    // Skip for grid children: they fill their cell, not the full grid container.
    if (parentContext && !parentContext.isGridChild) {
      const marginL = parseFloat(computedStyles["margin-left"]) || 0;
      const marginR = parseFloat(computedStyles["margin-right"]) || 0;
      const marginT = parseFloat(computedStyles["margin-top"]) || 0;
      const marginB = parseFloat(computedStyles["margin-bottom"]) || 0;
      const parentIsColumn = parentContext.direction === "VERTICAL";

      if (parentIsColumn && layoutSizing.horizontal === "FILL" && parentContext.contentWidth !== undefined) {
        if (parentContext.contentWidth - width - marginL - marginR > 2) {
          layoutSizing.horizontal = "FIXED";
        }
      }
      if (!parentIsColumn && layoutSizing.vertical === "FILL" && parentContext.contentHeight !== undefined) {
        if (parentContext.contentHeight - height - marginT - marginB > 2) {
          layoutSizing.vertical = "FIXED";
        }
      }
    }

    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    // Blend mode (mix-blend-mode)
    const cssBlendMode = computedStyles["mix-blend-mode"];
    const blendMode = cssBlendMode && cssBlendMode !== "normal" ? cssBlendMode : undefined;

    // Extract rotation from CSS transform
    const rotation = extractRotationFromTransform(computedStyles["transform"]);

    // CSS Positioning
    const cssPosition = computedStyles["position"] as ExtractedElement["position"];
    const position =
      cssPosition && cssPosition !== "static" ? cssPosition : undefined;
    const zIndexStr = computedStyles["z-index"];
    const zIndex =
      zIndexStr && zIndexStr !== "auto" ? parseInt(zIndexStr) : undefined;

    // CSS order (flex child visual reordering)
    const cssOrderStr = computedStyles["order"];
    const cssOrder =
      cssOrderStr && cssOrderStr !== "0" ? parseInt(cssOrderStr) : undefined;

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

    // Fallback: detect centering from computed margins when matchedStyles unavailable
    if (!horizontallyCentered && !matchedStyles) {
      const compML = parseFloat(computedStyles["margin-left"]) || 0;
      const compMR = parseFloat(computedStyles["margin-right"]) || 0;
      if (compML > 0 && compMR > 0 && Math.abs(compML - compMR) < 2) {
        horizontallyCentered = true;
      }
    }

    // Extract margin pixel values
    const marginTopVal = parseFloat(computedStyles["margin-top"]) || 0;
    const marginRightVal = parseFloat(computedStyles["margin-right"]) || 0;
    const marginBottomVal = parseFloat(computedStyles["margin-bottom"]) || 0;
    const marginLeftVal = parseFloat(computedStyles["margin-left"]) || 0;

    // Centered elements (margin: 0 auto): left/right margins are centering artifacts,
    // not spacing. Exclude them so margin wrappers aren't created for centering.
    const effectiveMarginRight = horizontallyCentered ? 0 : marginRightVal;
    const effectiveMarginLeft = horizontallyCentered ? 0 : marginLeftVal;

    const margin =
      marginTopVal > 0 || effectiveMarginRight > 0 || marginBottomVal > 0 || effectiveMarginLeft > 0
        ? { top: marginTopVal, right: effectiveMarginRight, bottom: marginBottomVal, left: effectiveMarginLeft }
        : undefined;

    // Pseudo-state styles (from CSS.forcePseudoState capture)
    const pseudoStateStyles = options.pseudoStateStylesMap?.get(node.backendNodeId);

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

    // Extract icon content from ::before/::after pseudo-elements (e.g., Font Awesome)
    // Always check — DOMSnapshot layout.text may leak the pseudo glyph into parent's textContent,
    // so aggregatedText can be non-empty even when the only content is from a pseudo-element.
    {
      const pseudoIcon = extractPseudoIconContent(node.index, nodes, childrenMap, options.iconPlatformFontMap, options.runtimePseudoContentMap, matchedStylesMap);
      if (pseudoIcon) {
        aggregatedText = pseudoIcon.text;
        fontFamily = pseudoIcon.fontFamily;
        fontFamilyList = pseudoIcon.fontFamilyList;
        platformFontFamily = pseudoIcon.fontFamily; // Icon font was platform-resolved
        fontSize = pseudoIcon.fontSize;
        fontWeight = pseudoIcon.fontWeight;
        textColor = pseudoIcon.color || textColor;
        styledSegments = [{
          text: pseudoIcon.text,
          color: pseudoIcon.color,
          fontWeight: pseudoIcon.fontWeight,
          fontSize: pseudoIcon.fontSize,
          fontFamily: pseudoIcon.fontFamily,
          fontFamilyList: pseudoIcon.fontFamilyList,
          tag: pseudoIcon.tag,
        }];
      } else {
        // For non-icon pseudo-elements: strip their text content from aggregatedText
        // DOMSnapshot layout.text includes pseudo-element content (e.g., "•Some text"),
        // but we extract pseudo-element content separately as a child text node.
        // Without stripping, the parent text would duplicate the pseudo content.
        const pseudoChildIndices = (childrenMap.get(node.index) || []);
        for (const pIdx of pseudoChildIndices) {
          const pseudoChild = nodes[pIdx];
          if (!pseudoChild || !pseudoChild.nodeName || !pseudoChild.nodeName.startsWith("::")) continue;
          const pseudoText = (pseudoChild.textContent || "").trim();
          if (!pseudoText || pseudoText === "none" || pseudoText === "\"\"" || pseudoText === "''") continue;
          // Strip the pseudo-element text from the beginning (::before) or end (::after) of aggregatedText
          if (pseudoChild.nodeName === "::before" && aggregatedText.startsWith(pseudoText)) {
            aggregatedText = aggregatedText.slice(pseudoText.length).trimStart();
          } else if (pseudoChild.nodeName === "::after" && aggregatedText.endsWith(pseudoText)) {
            aggregatedText = aggregatedText.slice(0, -pseudoText.length).trimEnd();
          } else if (aggregatedText.includes(pseudoText)) {
            // Fallback: strip anywhere (e.g., ::marker content mixed into text)
            aggregatedText = aggregatedText.replace(pseudoText, "").trim();
          }
        }
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
      styledSegments = collectStyledText(node.index, nodes, childrenMap, parentStyles, platformFontMap);

      // Also update aggregatedText from styled segments (full text)
      if (styledSegments.length > 0) {
        aggregatedText = styledSegments.map(seg => seg.text).join("");
      }
    }

    // Get list-style-type for <li> elements — no fallback to "disc";
    // if CSS doesn't set it, we leave it undefined so marker synthesis
    // only fires when the browser explicitly declared a marker style.
    const listStyleType = tag === "li"
      ? (computedStyles["list-style-type"] || undefined)
      : undefined;
    const listItemValue = tag === "li" ? node.attributes["value"] : undefined;

    const isLeaf = isLeafElement(node.index, nodes, childrenMap);
    const finalText = aggregatedText;

    // Determine if this element should be a TEXT node directly
    const wouldBeText = isText || (isLeaf && aggregatedText && tag !== "a");
    const requiresWrapper =
      wouldBeText &&
      needsFrameWrapper(padding, fills, strokes, effects, borderRadius);

    const shouldBeText = wouldBeText && !requiresWrapper;

    // Extract imageUrl for real asset extraction
    let imageUrl: string | undefined;
    let additionalImageUrls: string[] | undefined;
    if (isMediaTag) {
      if (tag === "img") {
        // Priority: currentSrc (responsive/srcset) > src > data-src (lazy-load)
        imageUrl = (node.attributes["currentsrc"] || node.attributes["src"] || node.attributes["data-src"] || undefined) as string | undefined;
      } else if (tag === "video") {
        imageUrl = (node.attributes["poster"] || undefined) as string | undefined;
      }
    } else if (hasBackgroundImageUrl) {
      const bgImg = computedStyles["background-image"] || "";
      // Extract all url() values (supports multiple background images)
      const urlMatches = [...bgImg.matchAll(/url\(\s*['"]?(.*?)['"]?\s*\)/g)];
      imageUrl = urlMatches[0]?.[1] || undefined;
      // Store additional background image URLs (2nd, 3rd, etc.)
      if (urlMatches.length > 1) {
        additionalImageUrls = urlMatches.slice(1)
          .map(m => resolveUrl(m[1], documentURL))
          .filter((u): u is string => !!u && u !== "");
      }
    }
    // Filter out empty strings
    if (imageUrl === "") imageUrl = undefined;
    // Resolve relative URLs against document URL
    imageUrl = resolveUrl(imageUrl, documentURL);

    // Empty icon-like element — no debug logging in production

    // Check if this iframe has traversable content (Layer #6)
    const hasIframeContent = tag === "iframe" &&
      node.contentDocumentIndex !== undefined &&
      iframeDocuments?.has(node.contentDocumentIndex);

    // Determine element type
    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMediaTag && !hasIframeContent) {
      // True media tags (<img>, <video>, <svg>, etc.) are always placeholders
      // Exception: iframes with traversable content become frames
      elementType = "placeholder";
    } else if (hasBackgroundImageUrl) {
      // Elements with background-image: url() — only placeholder if no element children
      const bgChildIndices = childrenMap.get(node.index) || [];
      const hasElementChildren = bgChildIndices.some((idx) => {
        const child = nodes[idx];
        return child && child.nodeType === 1 && child.nodeName.toLowerCase() !== "br";
      });
      elementType = hasElementChildren ? "frame" : "placeholder";
    } else if (shouldBeText && finalText) {
      elementType = "text";
    }

    // Text content goes directly on the element (no synthetic child pipeline)
    const frameTextContent = finalText;

    // Build element
    const selector = getSelector(node.index);
    const layoutMode = getLayoutMode(computedStyles, tag);

    // Extract CSS Grid container properties
    const gridTemplateColumns = layoutMode === "GRID"
      ? (computedStyles["grid-template-columns"] || undefined) : undefined;
    const gridTemplateRows = layoutMode === "GRID"
      ? (computedStyles["grid-template-rows"] || undefined) : undefined;
    const gridColumnGap = layoutMode === "GRID"
      ? (parseFloat(computedStyles["column-gap"] || computedStyles["gap"] || "0") || 0) : undefined;
    const gridRowGap = layoutMode === "GRID"
      ? (parseFloat(computedStyles["row-gap"] || computedStyles["gap"] || "0") || 0) : undefined;
    const gridAutoFlow = layoutMode === "GRID"
      ? (computedStyles["grid-auto-flow"] || undefined) : undefined;

    const element: ExtractedElement = {
      id: generateId(selector),
      type: elementType,
      tag,
      className: node.attributes["class"] || undefined,
      name: getSemanticName(tag, node.attributes),
      x: x - parentX,
      y: y - parentY,
      width,
      height,
      position,
      zIndex,
      cssOrder,
      layoutMode,
      itemSpacing,
      padding,
      justifyContent,
      alignItems,
      flexWrap,
      layoutGrow,
      layoutAlign,
      layoutSizingHorizontal: layoutSizing.horizontal,
      layoutSizingVertical: layoutSizing.vertical,
      gridTemplateColumns,
      gridTemplateRows,
      gridColumnGap,
      gridRowGap,
      gridAutoFlow,
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
      platformFontFamily,
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      textAlign,
      textContent: frameTextContent,
      styledSegments: styledSegments.length > 0 ? styledSegments : undefined,
      listStyleType,
      listItemValue,
      opacity,
      blendMode,
      rotation: rotation || undefined,
      isPlaceholder: elementType === "placeholder",
      imageUrl,
      additionalImageUrls: additionalImageUrls && additionalImageUrls.length > 0 ? additionalImageUrls : undefined,
      overflow: getOverflowValue(computedStyles),
      horizontallyCentered: horizontallyCentered || undefined,
      margin,
      backendNodeId: node.backendNodeId,
      sourceSelector: selector,
      children: [],
      pseudoStateStyles: pseudoStateStyles || undefined,
      computedStyles: filterDefaultStyles(computedStyles),
      textColorVariable: textColorVariableRef || undefined,
    };

    // Process children
    const childIndices = childrenMap.get(node.index) || [];
    const parentBorderL = parseFloat(computedStyles["border-left-width"]) || 0;
    const parentBorderR = parseFloat(computedStyles["border-right-width"]) || 0;
    const parentBorderT = parseFloat(computedStyles["border-top-width"]) || 0;
    const parentBorderB = parseFloat(computedStyles["border-bottom-width"]) || 0;
    const parentContentWidth = width - padding.left - padding.right - parentBorderL - parentBorderR;
    const parentContentHeight = height - padding.top - padding.bottom - parentBorderT - parentBorderB;

    // Iframe content traversal (Layer #6): build children from iframe document
    if (hasIframeContent && node.contentDocumentIndex !== undefined) {
      const iframeDoc = iframeDocuments!.get(node.contentDocumentIndex)!;
      const iframeNodes = iframeDoc.nodes;

      // Build iframe childrenMap
      const iframeChildrenMap = new Map<number, number[]>();
      for (const iNode of iframeNodes) {
        if (iNode.parentIndex >= 0) {
          if (!iframeChildrenMap.has(iNode.parentIndex)) {
            iframeChildrenMap.set(iNode.parentIndex, []);
          }
          iframeChildrenMap.get(iNode.parentIndex)!.push(iNode.index);
        }
      }

      // Find <body> in iframe document (or first root element)
      const iframeBody = iframeNodes.find(n => n.nodeName === "body") || iframeNodes.find(n => n.parentIndex === -1);

      if (iframeBody) {
        // Traverse iframe body's children using iframe's own childrenMap
        const iframeBodyChildIndices = iframeChildrenMap.get(iframeBody.index) || [];
        for (const childIdx of iframeBodyChildIndices) {
          const childNode = iframeNodes[childIdx];
          if (childNode && childNode.nodeType === 1) {
            // Build iframe child using the main buildNode but with offset from iframe position
            // Iframe internal coords are relative to iframe viewport, offset by iframe position
            const iframeChildElement = buildIframeChildNode(
              childNode, iframeNodes, iframeChildrenMap, x, y, depth + 1, selector
            );
            if (iframeChildElement && iframeChildElement.width > 3 && iframeChildElement.height > 3) {
              element.children.push(iframeChildElement);
            }
          }
        }
      }
    } else {
      // Normal child processing
      // Flatten display:contents children into parent (they have no box of their own)
      const effectiveChildIndices = flattenDisplayContents(childIndices, nodes, childrenMap);

      // For <li> elements, stash the ::marker pseudo's computed styles on the
      // element BEFORE children are processed. CSS commonly styles ::marker
      // differently from its owning <li> (e.g. Apple.com footer footnotes:
      // ::marker { font-size:12px; color:rgba(0,0,0,0.56) } while the <li>
      // has inherited defaults). attachMarkerToLi() later prefers these
      // styles over the <li>'s own typography.
      if (tag === "li") {
        for (const childIdx of effectiveChildIndices) {
          const cn = nodes[childIdx];
          if (cn && cn.nodeName === "::marker" && cn.computedStyles) {
            element.markerComputedStyles = cn.computedStyles;
            break;
          }
        }
      }

      for (const childIdx of effectiveChildIndices) {
        const childNode = nodes[childIdx];
        if (childNode) {
          // Handle pseudo-elements (::before, ::after, ::marker)
          // Icon-font pseudo-elements are handled by extractPseudoIconContent (line ~1689).
          // Non-icon pseudo-elements with text content (e.g., content: "•") need to be
          // extracted as text children here — otherwise their content is completely lost.
          if (childNode.nodeName && childNode.nodeName.startsWith("::")) {
            // Check if this pseudo-element has non-icon text content to extract.
            // ::marker text preserves its trailing space verbatim ("1. " is the
            // browser's real marker output); other pseudos are trimmed because
            // their whitespace is incidental.
            const rawPseudoText = childNode.textContent || "";
            const pseudoText = childNode.nodeName === "::marker"
              ? rawPseudoText
              : rawPseudoText.trim();
            if (pseudoText.trim() && pseudoText !== "none" && pseudoText !== "\"\"" && pseudoText !== "''") {
              // Check if this is an icon font pseudo-element (handled separately)
              const pseudoFontFamily = childNode.computedStyles["font-family"] || "";
              const parentFontFamily = node.computedStyles["font-family"] || "";
              const rawFamily = pseudoFontFamily || parentFontFamily;
              const primaryFont = extractFontFamilyList(rawFamily)[0] || "";
              const parentClassHint = hasIconClassHint(node.attributes["class"]);
              const iconFonts = options.iconPlatformFontMap?.get(node.backendNodeId);

              // Only create a text child for NON-icon-font pseudo-elements
              // Icon font ones are already handled by extractPseudoIconContent
              if (!isIconFont(primaryFont) && !parentClassHint && !(iconFonts && iconFonts.length > 0)) {
                const pseudoBounds = childNode.bounds;
                const hasValidBounds = pseudoBounds != null && pseudoBounds.width > 0 && pseudoBounds.height > 0;
                // ::marker with list-style-position:outside frequently has
                // zero/null bounds in CDP snapshot — fall back to derived
                // bounds so the marker text still survives as a child.
                const isMarkerPseudo = childNode.nodeName === "::marker";
                if (hasValidBounds || isMarkerPseudo) {
                  const pseudoColor = parseColor(childNode.computedStyles["color"]) || textColor;
                  const pseudoFontSize = parseInt(childNode.computedStyles["font-size"] || String(fontSize)) || fontSize;
                  const pseudoFontWeight = parseInt(childNode.computedStyles["font-weight"] || String(fontWeight)) || fontWeight;
                  const pseudoLineHeight = childNode.computedStyles["line-height"] || lineHeight;
                  const pseudoLetterSpacing = parseFloat(childNode.computedStyles["letter-spacing"] || "0") || 0;
                  const pseudoFontFamilyResolved = extractFontFamilyList(rawFamily)[0] || fontFamily;

                  let pseudoX: number;
                  let pseudoY: number;
                  let pseudoWidth: number;
                  let pseudoHeight: number;
                  if (hasValidBounds) {
                    pseudoX = pseudoBounds!.x / browserDpr - parentX;
                    pseudoY = pseudoBounds!.y / browserDpr - parentY;
                    pseudoWidth = pseudoBounds!.width / browserDpr;
                    pseudoHeight = pseudoBounds!.height / browserDpr;
                  } else {
                    pseudoX = 0;
                    pseudoY = 0;
                    pseudoWidth = Math.max(pseudoFontSize * 0.6 * pseudoText.length, 8);
                    pseudoHeight = typeof pseudoLineHeight === "number"
                      ? pseudoLineHeight
                      : pseudoFontSize * 1.2;
                  }

                  const pseudoCssPosition = childNode.computedStyles["position"];
                  const pseudoSelector = getSelector(node.index) + childNode.nodeName;
                  const pseudoTextChild = createSyntheticTextChild(
                    pseudoWidth,
                    pseudoHeight,
                    pseudoColor,
                    pseudoFontFamilyResolved,
                    pseudoFontSize,
                    pseudoFontWeight,
                    pseudoLineHeight,
                    pseudoLetterSpacing,
                    textAlign,
                    pseudoText,
                    pseudoX,
                    pseudoY,
                    1, // single line for pseudo-element content
                    undefined,
                    pseudoSelector
                  );
                  pseudoTextChild.tag = childNode.nodeName; // "::before", "::after", "::marker"
                  if (pseudoCssPosition === "absolute" || pseudoCssPosition === "fixed") {
                    pseudoTextChild.position = pseudoCssPosition;
                  }
                  element.children.push(pseudoTextChild);
                }
              }
            }
            continue;
          }

          // Skip children outside viewport
          if (childNode.bounds && childNode.bounds.x / browserDpr >= viewportWidth) {
            continue;
          }

          const display = computedStyles["display"];
          const isGrid = display === "grid" || display === "inline-grid";

          const childElement = buildNode(childNode, x, y, depth + 1, {
            direction: (element.layoutMode && element.layoutMode !== "NONE") ? element.layoutMode : "VERTICAL",
            alignItems,
            contentWidth: parentContentWidth,
            contentHeight: parentContentHeight,
            isGridChild: isGrid || undefined,
            parentTag: tag,
          });
          if (childElement && childElement.width > 3 && childElement.height > 3) {
            // Clip child width if extends beyond viewport
            if (childElement.x + childElement.width > viewportWidth) {
              childElement.width = Math.max(0, viewportWidth - childElement.x);
            }
            // Extract grid child placement from computed styles
            if (isGrid) {
              const childCS = childNode.computedStyles;
              const gcs = parseInt(childCS["grid-column-start"]) || undefined;
              const gce = parseInt(childCS["grid-column-end"]) || undefined;
              const grs = parseInt(childCS["grid-row-start"]) || undefined;
              const gre = parseInt(childCS["grid-row-end"]) || undefined;
              if (gcs) childElement.gridColumnStart = gcs;
              if (gce) childElement.gridColumnEnd = gce;
              if (grs) childElement.gridRowStart = grs;
              if (gre) childElement.gridRowEnd = gre;
            }
            element.children.push(childElement);
          }
        }
      }
    }

    // Sort children by z-index ONLY in absolute positioning mode (layoutMode=NONE).
    // In auto-layout (VERTICAL/HORIZONTAL/GRID), z-index affects visual stacking
    // but NOT layout flow. Reordering would break DOM order (e.g., buttons above text).
    if (element.layoutMode === "NONE" && element.children.length >= 2) {
      const hasZIndex = element.children.some(c => c.zIndex != null);
      if (hasZIndex) {
        const stable = element.children.map((c, i) => ({ c, i }));
        stable.sort((a, b) => {
          const za = a.c.zIndex ?? 0;
          const zb = b.c.zIndex ?? 0;
          return za !== zb ? za - zb : a.i - b.i;
        });
        element.children = stable.map(s => s.c);
      }
    }

    // Sort flex children by CSS order property.
    // In flex containers, `order` controls visual order — lower values first,
    // DOM order preserved for equal values (stable sort).
    if ((element.layoutMode === "HORIZONTAL" || element.layoutMode === "VERTICAL") && element.children.length >= 2) {
      const hasOrder = element.children.some(c => c.cssOrder != null);
      if (hasOrder) {
        const stable = element.children.map((c, i) => ({ c, i }));
        stable.sort((a, b) => {
          const oa = a.c.cssOrder ?? 0;
          const ob = b.c.cssOrder ?? 0;
          return oa !== ob ? oa - ob : a.i - b.i;
        });
        element.children = stable.map(s => s.c);
      }
    }

    // Move absolutely-positioned image-only containers to front (background layer).
    // In Figma, first children render behind later ones. This matches CSS behavior
    // where abs-positioned images serve as backgrounds behind content with higher z-index.
    // Pattern: apple.com has tile-image-wrapper[position:absolute] + tile-content[position:relative]
    // where nested z-index:2 on copy-wrapper puts text above the image in browser.
    if (element.children.length >= 2) {
      const bgImages: ExtractedElement[] = [];
      const rest: ExtractedElement[] = [];
      for (const child of element.children) {
        if (child.position === "absolute" && isImageOnlySubtree(child)) {
          bgImages.push(child);
        } else {
          rest.push(child);
        }
      }
      if (bgImages.length > 0 && rest.length > 0) {
        element.children = [...bgImages, ...rest];
      }
    }

    // CSS margin collapsing: in vertical (block) layout, adjacent siblings'
    // margin-bottom and margin-top collapse to max(). Without this, margin
    // wrappers would double-count because Figma padding doesn't collapse.
    if (element.layoutMode !== "HORIZONTAL" && element.children.length >= 2) {
      for (let i = 1; i < element.children.length; i++) {
        const prev = element.children[i - 1];
        const curr = element.children[i];
        const prevBottom = prev.margin?.bottom ?? 0;
        const currTop = curr.margin?.top ?? 0;

        if (prevBottom > 0 && currTop > 0) {
          const collapsed = Math.max(prevBottom, currTop);
          if (prev.margin) prev.margin.bottom = collapsed;
          if (curr.margin) curr.margin.top = 0;
        }
      }
    }

    // Calculate itemSpacing from child positions when CSS gap is 0
    if (element.itemSpacing === 0 && element.children.length >= 2) {
      const isVertical = element.layoutMode !== "HORIZONTAL";
      const gaps: number[] = [];

      for (let i = 1; i < element.children.length; i++) {
        const prev = element.children[i - 1];
        const curr = element.children[i];

        // Raw position gap includes margins from both adjacent children
        let gap = isVertical
          ? curr.y - (prev.y + prev.height)
          : curr.x - (prev.x + prev.width);

        // Subtract adjacent margins to get the "true" gap (spacing only).
        // Browser positions already account for margins, so the gap includes:
        //   prev's trailing margin + curr's leading margin.
        // Since margin wrappers will re-add these, we must subtract them here.
        if (prev.margin || curr.margin) {
          const prevTrailing = isVertical
            ? (prev.margin?.bottom ?? 0)
            : (prev.margin?.right ?? 0);
          const currLeading = isVertical
            ? (curr.margin?.top ?? 0)
            : (curr.margin?.left ?? 0);
          gap -= (prevTrailing + currLeading);
        }

        if (gap > 0.5) gaps.push(gap);
      }

      if (gaps.length > 0) {
        // Use median gap for robustness (ignores outliers)
        gaps.sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)];
        element.itemSpacing = Math.round(median);
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

    // Set text truncation from CSS text-overflow
    const truncation = getTextTruncation(computedStyles);
    if (truncation) {
      element.textTruncation = truncation;
    }

    // Resolve "normal" line-height to pixel value from browser text rendering
    if (lineHeight === "normal") {
      const tbHeight = textBounds ? textBounds.height : null;
      // Collect raw textBoxes for more accurate multi-line line-height computation
      const rawTextBoxes = collectRawTextBoxes(node.index, nodes, childrenMap, browserDpr);
      lineHeight = resolveNormalLineHeight(
        lineHeight,
        fontSize,
        tbHeight,
        browserLineCount,
        rawTextBoxes.length > 0 ? rawTextBoxes : undefined
      );
      element.lineHeight = lineHeight;
    }

    // Add synthetic text child for list items
    // Synthetic text child pipeline REMOVED — text nodes now flow through
    // buildNode directly as type:"text" leaf elements (Step 1 of text refactoring).
    // Previously: isListItemWithText, shouldBeFrameWithTextChild, isLinkWithText
    // blocks created synthetic children here (~190 lines).

    // ---- List marker synthesis -------------------------------------------
    // <ol> / <ul>: attach marker text children to direct <li> children that:
    //   1. Have display: list-item (the CSS signal that browsers render markers)
    //   2. Have list-style-type !== "none"
    //   3. Don't already have a CDP-provided ::marker child
    // Marker is positioned absolutely — li's layoutMode is NEVER overridden.
    if (tag === "ol" || tag === "ul") {
      const liChildren = element.children.filter((c) => c.tag === "li");
      const eligibleLis = liChildren.filter((li) => liEligibleForMarker(li));
      if (eligibleLis.length > 0) {
        const liListStyleType =
          eligibleLis[0].listStyleType ||
          (tag === "ol" ? "decimal" : undefined);
        if (liListStyleType && liListStyleType !== "none") {
          const itemSpecs: ListItemSpec[] = eligibleLis.map((li) => ({
            valueAttr: li.listItemValue,
          }));
          const markers = computeListMarkers({
            tag: tag as "ol" | "ul",
            listStyleType: liListStyleType,
            startAttr: node.attributes["start"],
            reversed: node.attributes["reversed"] !== undefined,
            items: itemSpecs,
          });
          for (let i = 0; i < eligibleLis.length; i++) {
            attachMarkerToLi(eligibleLis[i], markers[i], textColor, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing);
          }
        }
      }
    }

    // Orphan <li> (not a direct child of an ol/ul): synthesize a naive
    // index=0 marker so bare list items still show a bullet.
    if (
      tag === "li" &&
      parentContext?.parentTag !== "ol" &&
      parentContext?.parentTag !== "ul"
    ) {
      if (liEligibleForMarker(element)) {
        const liStyle = listStyleType;
        if (liStyle && liStyle !== "none") {
          const hasCdpMarker = element.children.some((c) => c.tag === "::marker");
          if (!hasCdpMarker) {
            const text = formatListMarker({ listStyleType: liStyle, index: 0 });
            if (text) {
              attachMarkerToLi(element, text, textColor, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing);
            }
          }
        }
      }
    }

    return element;
  }

  /**
   * Returns true if the <li> element is eligible for marker synthesis:
   * CSS display must be "list-item" (or absent for backward compat with
   * old JSON that doesn't include display). Other display values (block,
   * flex, grid, inline-block, contents) mean the browser never renders a
   * marker, so neither should we.
   */
  function liEligibleForMarker(li: ExtractedElement): boolean {
    const display = li.computedStyles?.display;
    if (!display || display === "" || display === "list-item") return true;
    return false;
  }

  /**
   * Attach a marker text child to a <li> element. The marker is positioned
   * absolutely so the li's own layoutMode (from CSS) is never disturbed.
   *
   * list-style-position: outside → marker at negative x (outside content box)
   * list-style-position: inside  → marker at x=0 (inline with content)
   */
  function attachMarkerToLi(
    li: ExtractedElement,
    markerText: string,
    inheritedColor: string | null,
    inheritedFontFamily: string,
    inheritedFontSize: number,
    inheritedFontWeight: number,
    inheritedLineHeight: number | string,
    inheritedLetterSpacing: number
  ): void {
    if (!markerText) return;
    const existing = li.children.find((c) => c.tag === "::marker");
    if (existing) {
      // CDP already provided a ::marker — keep it, ensure it's first child
      const idx = li.children.indexOf(existing);
      if (idx > 0) {
        li.children.splice(idx, 1);
        li.children.unshift(existing);
      }
      existing.position = "absolute";
      return;
    }

    // Source typography from the ::marker pseudo-element's computed styles
    // when available (populated upstream from the CDP snapshot). Fall back
    // to the <li>'s own typography, then to parent-inherited values.
    const mcs = li.markerComputedStyles;
    const mFontSize = mcs ? parseFloat(mcs["font-size"] ?? "") : NaN;
    const mFontWeight = mcs ? parseInt(mcs["font-weight"] ?? "", 10) : NaN;
    const mLineHeight = mcs ? parseFloat(mcs["line-height"] ?? "") : NaN;
    const mLetterSpacing = mcs ? parseFloat(mcs["letter-spacing"] ?? "") : NaN;
    const mFontFamilyRaw = mcs?.["font-family"];
    const mFontFamily = mFontFamilyRaw ? (extractFontFamilyList(mFontFamilyRaw)[0] || "") : "";
    const mColorHex = mcs?.["color"] ? parseColor(mcs["color"]) : null;

    const liFontSize = Number.isFinite(mFontSize) && mFontSize > 0
      ? mFontSize
      : (li.fontSize || inheritedFontSize);
    const liFontFamily = mFontFamily || li.fontFamily || inheritedFontFamily;
    const liFontWeight = Number.isFinite(mFontWeight) && mFontWeight > 0
      ? mFontWeight
      : (li.fontWeight || inheritedFontWeight);
    const liLineHeight = Number.isFinite(mLineHeight) && mLineHeight > 0
      ? mLineHeight
      : (li.lineHeight || inheritedLineHeight);
    const liLetterSpacing = Number.isFinite(mLetterSpacing)
      ? mLetterSpacing
      : (li.letterSpacing ?? inheritedLetterSpacing);
    const liColor = mColorHex || li.textColor || inheritedColor;

    // Pull the alpha channel out of the ::marker color (e.g. 0.56 from
    // rgba(0,0,0,0.56)) — parseColor collapses to hex and loses alpha, so
    // we carry it through as the text node's opacity.
    let markerOpacity = 1;
    const rgbaSource = mcs?.["color"];
    if (rgbaSource) {
      const m = rgbaSource.match(/rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
      if (m) {
        const a = parseFloat(m[1]);
        if (Number.isFinite(a) && a >= 0 && a <= 1) markerOpacity = a;
      }
    }

    const width = Math.max(liFontSize * 0.6 * markerText.length, 8);
    const height = typeof liLineHeight === "number"
      ? liLineHeight
      : liFontSize * 1.2;

    const listStylePosition = li.computedStyles?.["list-style-position"] || "outside";
    const gap = Math.max(4, Math.round(liFontSize * 0.3));
    const xOffset = listStylePosition === "inside" ? 0 : -(width + gap);

    const marker = createSyntheticTextChild(
      width,
      height,
      liColor,
      liFontFamily,
      liFontSize,
      liFontWeight,
      liLineHeight,
      liLetterSpacing,
      "left",
      markerText,
      xOffset,
      0,
      1,
      undefined,
      (li.sourceSelector || "") + "::marker"
    );
    marker.tag = "::marker";
    marker.position = "absolute";
    marker.opacity = markerOpacity;
    li.children.unshift(marker);
  }

  /**
   * Build a simplified element from an iframe document node (Layer #6).
   * Uses the iframe's own nodes and childrenMap for traversal.
   * Coordinates are offset by the iframe element's position in the parent.
   */
  function buildIframeChildNode(
    node: ParsedSnapshotNode,
    iframeNodes: ParsedSnapshotNode[],
    iframeChildrenMap: Map<number, number[]>,
    iframeX: number,
    iframeY: number,
    depth: number,
    iframeSelectorPrefix?: string
  ): ExtractedElement | null {
    if (depth > MAX_TREE_DEPTH) return null;
    if (node.nodeType !== 1) return null;
    if (SKIP_TAGS.includes(node.nodeName as (typeof SKIP_TAGS)[number])) return null;

    const isMediaForFilter = MEDIA_TAGS.includes(node.nodeName as (typeof MEDIA_TAGS)[number]);
    if (!node.bounds || ((node.bounds.width < 1 || node.bounds.height < 1) && !isMediaForFilter))
      return null;

    // Iframe internal coordinates + iframe position offset
    const scaledBounds = {
      x: node.bounds.x / browserDpr,
      y: node.bounds.y / browserDpr,
      width: node.bounds.width / browserDpr,
      height: node.bounds.height / browserDpr,
    };

    const cs = node.computedStyles;
    const elWidth = getSubPixelDimension(cs, "width", scaledBounds.width);
    const elHeight = getSubPixelDimension(cs, "height", scaledBounds.height);

    const isText = TEXT_TAGS.includes(node.nodeName as (typeof TEXT_TAGS)[number]);
    const isMedia = MEDIA_TAGS.includes(node.nodeName as (typeof MEDIA_TAGS)[number]);

    const bgColor = cs["background-color"];
    const bgColorForFills = bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" ? bgColor : null;
    const fills = parseBackgroundToFills(null, bgColorForFills, cssVariablesMap, { width: elWidth, height: elHeight });

    const borderRadius = parseBorderRadius(cs["border-radius"] || "0");

    let textContent = node.textContent || "";
    if (!textContent) {
      textContent = collectDirectText(node.index, iframeNodes, iframeChildrenMap);
    }

    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMedia) {
      elementType = "placeholder";
    } else if (isText && textContent) {
      elementType = "text";
    }

    const iframeSelector = computeStructuralSelector(node.index, iframeNodes, iframeChildrenMap, iframeSelectorPrefix);
    const el: ExtractedElement = {
      id: generateId(iframeSelector),
      type: elementType,
      tag: node.nodeName,
      name: getSemanticName(node.nodeName, node.attributes),
      x: scaledBounds.x,
      y: scaledBounds.y,
      width: elWidth,
      height: elHeight,
      layoutMode: getLayoutMode(cs, node.nodeName),
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      fills,
      strokes: [],
      effects: [],
      backgroundColor: null,
      backgroundGradient: null,
      textColor: parseColor(cs["color"]),
      borderColor: null,
      borderWidth: 0,
      borderRadius,
      boxShadow: null,
      fontFamily: (cs["font-family"] || "Inter").split(",")[0].replace(/['"]/g, "").trim(),
      fontSize: parseFloat(cs["font-size"] || "14") || 14,
      fontWeight: parseInt(cs["font-weight"] || "400") || 400,
      lineHeight: cs["line-height"] || "normal",
      letterSpacing: parseFloat(cs["letter-spacing"] || "0") || 0,
      textAlign: cs["text-align"] || "left",
      textContent: elementType === "text" ? textContent : "",
      opacity: parseFloat(cs["opacity"] || "1") || 1,
      isPlaceholder: elementType === "placeholder",
      backendNodeId: node.backendNodeId,
      sourceSelector: iframeSelector,
      children: [],
    };

    // Recursively build iframe children
    const childIdxs = iframeChildrenMap.get(node.index) || [];
    for (const childIdx of childIdxs) {
      const childNode = iframeNodes[childIdx];
      if (childNode) {
        const childEl = buildIframeChildNode(
          childNode, iframeNodes, iframeChildrenMap,
          iframeX, iframeY, depth + 1, iframeSelectorPrefix
        );
        if (childEl && childEl.width > 3 && childEl.height > 3) {
          el.children.push(childEl);
        }
      }
    }

    return el;
  }

  // For subtree extraction, use root's own coordinates as parent offset
  // so children are positioned relative to the subtree root
  const rootParentX = rootNodeIndex !== undefined
    ? (rootNode.bounds ? rootNode.bounds.x / browserDpr : 0)
    : 0;
  const rootParentY = rootNodeIndex !== undefined
    ? (rootNode.bounds ? rootNode.bounds.y / browserDpr : 0)
    : 0;

  const tree = buildNode(rootNode, rootParentX, rootParentY, 0);
  if (!tree) {
    throw new Error("Failed to build element tree");
  }

  // For full-page extraction, override body width to viewport
  // For subtree extraction, keep the element's natural width
  if (rootNodeIndex === undefined) {
    tree.width = viewportWidth;
  }

  return tree;
}
