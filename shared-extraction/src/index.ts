/**
 * Shared Extraction Module
 *
 * Unified DOM extraction logic for Web2Wireframe.
 * Used by both Browser Extension and Plugin_Backend.
 *
 * @example
 * ```typescript
 * import { extract, CDPClientInterface } from 'shared-extraction';
 *
 * // Browser Extension
 * class ChromeCDPClient implements CDPClientInterface {
 *   async send(method, params) {
 *     return chrome.debugger.sendCommand({ tabId }, method, params);
 *   }
 * }
 *
 * // Plugin_Backend (Puppeteer)
 * class PuppeteerCDPClient implements CDPClientInterface {
 *   async send(method, params) {
 *     return this.session.send(method, params);
 *   }
 * }
 *
 * // Same extraction logic for both!
 * const tree = await extract(client, { viewportWidth: 1440 });
 * ```
 */

// ============================================================================
// TYPES - Re-export all types
// ============================================================================

export type {
  CDPClientInterface,
  CDPNode,
  CDPCSSRule,
  CDPCSSStyle,
  CDPCSSProperty,
  CDPMatchedStyles,
  CDPComputedStyle,
  CDPFontFace,
  FigmaColor,
  FigmaGradientStop,
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  ExtractedElement,
  StyledTextSegment,
  CapturedFrame,
  CaptureResult,
  CaptureOptions,
  DetectedColors,
  ExtractedFont,
  PlatformFontInfo,
  ExtractedAsset,
  ExtractedStylesheet,
  ExtractedCSSVariable,
  RadialGradientShape,
  RadialGradientSize,
} from "./types";

export { DEFAULT_CAPTURE_OPTIONS } from "./types";

// ============================================================================
// SNAPSHOT - DOM capture
// ============================================================================

export {
  captureSnapshot,
  parseSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  buildTreeFromSnapshot,
  SNAPSHOT_COMPUTED_STYLES,
  type CaptureSnapshotResult,
  type SnapshotDocument,
  type SnapshotNodeTree,
  type SnapshotLayout,
  type ParsedSnapshotNode,
  type TextBoxInfo,
} from "./snapshot";

// ============================================================================
// CSS - Style extraction
// ============================================================================

export {
  getMatchedStylesForNode,
  getComputedStyleForNode,
  getInlineStylesForNode,
  getAllStyleSheets,
  getStyleSheetText,
  getPlatformFontsForNode,
  getFontFaceRules,
  extractPropertyFromMatchedRules,
  extractBorderWidthFromMatchedRules,
  extractBorderSidesFromMatchedRules,
  extractWidthFromMatchedRules,
  extractHeightFromMatchedRules,
  extractPseudoStyles,
  extractCSSVariables,
  resolveCSSValue,
  extractBackgroundFromCSS,
  type CSSVariable,
  type CSSOMBackground,
} from "./css";

// ============================================================================
// STYLE PARSERS - CSS to Figma conversion
// ============================================================================

export {
  parseColorToFigma,
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
  resolveCSSVariables,
  extractCSSVariableName,
  type ElementDimensions,
} from "./style-parsers";

// ============================================================================
// TREE BUILDER - DOM to ExtractedElement tree
// ============================================================================

export {
  buildElementTree,
  filterDefaultStyles,
  collectDirectText,
  collectAllInlineText,
  collectStyledText,
  isLeafElement,
  type BuildTreeOptions,
  type BodyOriginalCSS,
} from "./tree-builder";

// ============================================================================
// UTILITIES
// ============================================================================

export {
  parseColor,
  isGradient,
  parseBorderRadius,
  generateId,
  getSemanticName,
  getLayoutMode,
  getLayoutSizing,
} from "./utils";

// ============================================================================
// CONSTANTS
// ============================================================================

export {
  SKIP_TAGS,
  TEXT_TAGS,
  MEDIA_TAGS,
  LIST_ITEM_TAG,
  LIST_CONTAINER_TAGS,
  MAX_TREE_DEPTH,
  MIN_ELEMENT_SIZE,
  type SkipTag,
  type TextTag,
  type MediaTag,
} from "./constants";

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

import type { CDPClientInterface, ExtractedElement } from "./types";
import { captureSnapshot, parseSnapshot, findNodesNeedingMatchedStyles, resolveNodeIds } from "./snapshot";
import { getMatchedStylesForNode, extractCSSVariables, extractBackgroundFromCSS } from "./css";
import { buildElementTree, type BuildTreeOptions } from "./tree-builder";
import type { CDPMatchedStyles } from "./types";

/**
 * Extract options
 */
export interface ExtractOptions {
  viewportWidth?: number;
  browserDpr?: number;
}

/**
 * Extract DOM tree from page using CDP
 *
 * This is the main extraction function that both Browser Extension
 * and Plugin_Backend should use.
 *
 * @param client - CDP client implementation (chrome.debugger or Puppeteer)
 * @param options - Extraction options
 * @returns ExtractedElement tree
 */
export async function extract(
  client: CDPClientInterface,
  options: ExtractOptions = {}
): Promise<ExtractedElement> {
  const { viewportWidth = 1440, browserDpr = 1 } = options;

  // 1. Enable required domains
  await client.enableDomains("DOM", "CSS", "DOMSnapshot");

  // 2. Capture DOM snapshot (one CDP call for entire page)
  const snapshot = await captureSnapshot(client);

  // 3. Parse snapshot into usable nodes
  const { nodes, nodesByBackendId } = parseSnapshot(snapshot);

  // 4. Find nodes that need matched styles (gradients, variables, etc.)
  const nodesNeedingStyles = findNodesNeedingMatchedStyles(nodes);

  // 5. Resolve node IDs for CSS queries
  const backendNodeIds = nodesNeedingStyles.map((n) => n.backendNodeId);
  const nodeIdMap = await resolveNodeIds(client, backendNodeIds);

  // 6. Get matched styles for nodes that need them
  const matchedStylesMap = new Map<number, CDPMatchedStyles>();

  await Promise.all(
    nodesNeedingStyles.map(async (node) => {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (!nodeId) return;

      const styles = await getMatchedStylesForNode(client, nodeId);
      if (styles) {
        matchedStylesMap.set(node.backendNodeId, styles);
      }
    })
  );

  // 7. Extract CSS variables
  const cssVariables = await extractCSSVariables(client);
  const cssVariablesMap = new Map<string, string>();
  for (const v of cssVariables) {
    cssVariablesMap.set(v.name, v.value);
  }

  // 8. Get body's original CSS (preserves gradient syntax)
  const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

  // 9. Build element tree
  const buildOptions: BuildTreeOptions = {
    viewportWidth,
    cssVariablesMap,
    bodyOriginalCSS,
    browserDpr,
  };

  const tree = buildElementTree(
    nodes,
    nodesByBackendId,
    matchedStylesMap,
    buildOptions
  );

  return tree;
}
