/**
 * @w2w/shared — Unified shared module for Web2Wireframe
 *
 * Combines:
 * - Figma-ready visual types (formerly @w2w/shared-types)
 * - CDP extraction logic (formerly shared-extraction)
 */

// ============================================================================
// TYPES - Re-export all types
// ============================================================================

// CDP types
export type {
  CDPClientInterface,
  CDPNode,
  CDPCSSRule,
  CDPCSSStyle,
  CDPCSSProperty,
  CDPMatchedStyles,
  CDPComputedStyle,
  CDPFontFace,
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
  PseudoStateStyles,
} from "./types";

// Figma-ready visual types (formerly @w2w/shared-types)
export type {
  FigmaColor,
  FigmaGradientStop,
  RadialGradientShape,
  RadialGradientSize,
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  TextSegment,
  ColorStop,
  ExtractedCSSVariable,
  WireframeNode,
  WireframeFrame,
  PluginColorPalette,
  RenderWireframeData,
  FontMapping,
  ColorRole,
  LicensePlan,
  LicenseStatus,
  License,
} from "./types";

export { DEFAULT_CAPTURE_OPTIONS } from "./types";

// W2W content script extraction types
export type {
  W2WFrameNode,
  W2WTextNode,
  W2WSVGNode,
  W2WNode,
  W2WBaseNode,
  W2WAttributes,
  W2WStyles,
  W2WPlatformFont,
  W2WFontEntry,
  W2WFontVariationAxis,
  W2WAssetEntry,
  W2WDocMeta,
  W2WCaptureResult,
  W2WCSSVariable,
  Quad,
} from "./w2w-types";

export {
  W2W_CSS_PROPERTIES,
  W2W_NUMERIC_PROPERTIES,
  W2W_SKIP_TAGS,
} from "./w2w-types";

// ============================================================================
// SNAPSHOT - DOM capture
// ============================================================================

export {
  captureSnapshot,
  parseSnapshot,
  parseMultiDocSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  buildTreeFromSnapshot,
  SNAPSHOT_COMPUTED_STYLES,
  type CaptureSnapshotResult,
  type SnapshotDocument,
  type SnapshotNodeTree,
  type SnapshotLayout,
  type ParsedSnapshotNode,
  type ParsedIframeDocument,
  type ParsedDocumentMap,
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
  collectPlatformFonts,
  extractPropertyFromMatchedRules,
  extractBorderWidthFromMatchedRules,
  extractBorderSidesFromMatchedRules,
  extractWidthFromMatchedRules,
  extractHeightFromMatchedRules,
  extractPseudoStyles,
  extractPseudoElementStyles,
  extractCSSVariables,
  resolveCSSValue,
  extractBackgroundFromCSS,
  getPlatformFontForPseudoElement,
  extractPseudoContentRuntime,
  extractPseudoContentFromMatchedStyles,
  type CSSVariable,
  type CSSOMBackground,
  type RuntimePseudoContent,
} from "./css";

// ============================================================================
// STYLE PARSERS - CSS to Figma conversion
// ============================================================================

export {
  parseColorToFigma,
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseFilterToEffects,
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
  isIconFont,
  isIconGlyph,
  extractPseudoIconContent,
  findIconFontNodes,
  findIconClassElements,
  type BuildTreeOptions,
  type BodyOriginalCSS,
} from "./tree-builder";

// ============================================================================
// FONT UTILITIES - Variable font parsing + obfuscated font detection
// ============================================================================

export {
  parseVariableFontAxes,
  isVariableFont,
  deriveWeightFromPlatformFont,
  weightFromFamilyName,
  isObfuscatedFont,
  type VariableFontAxes,
} from "./font-utils";

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
  resolveUrl,
  hashSelector,
  escapeCSSIdentifier,
  computeStructuralSelector,
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
// VIEWPORT ORCHESTRATION
// ============================================================================

export {
  createViewportConfig,
  calculateScrollbarWidth,
  getStabilizationConfig,
  prepareStabilization,
  captureViewportMetrics,
  cleanupViewportCapture,
  type ViewportConfig,
  type ViewportMetadata,
  type StabilizationConfig,
  type StabilizationClient,
  type CaptureViewportOptions,
} from "./viewport-orchestration";

// ============================================================================
// PSEUDO-STATE CAPTURE
// ============================================================================

export {
  findInteractiveNodes,
  flattenMatchedRules,
  captureForcedHoverStyles,
  captureForcedPseudoStyles,
  capturePseudoStatesForNodes,
} from "./pseudo-states";
export type { ForcedPseudoClass } from "./pseudo-states";

// ============================================================================
// PSEUDO-ELEMENT VISIBILITY - Decide if a ::before/::after should render
// ============================================================================

export { shouldRenderPseudo } from "./pseudo-visibility";
export type {
  PseudoVisibilityInput,
  PseudoVisibilityResult,
} from "./pseudo-visibility";

// ============================================================================
// LIST MARKERS - Counter-style marker strings + content-script wrapper builder
// ============================================================================

export { computeListMarkers, formatListMarker } from "./list-markers";
export type {
  ListMarkerInput,
  ListItemSpec,
  ListContainerSpec,
} from "./list-markers";

export { buildMarkerWrapperNode } from "./content-marker";
export type { BuildMarkerWrapperInput } from "./content-marker";

// ============================================================================
// W2W HOVER CAPTURE - Shared interactive node detection
// ============================================================================

export {
  w2wFindInteractiveNodes,
  w2wFindHoverCandidates,
  escapeCssClass,
  parseHoverSelectorsFromCssText,
  splitHoverSelector,
  findNodeBySelector,
  attachHoverToDescendants,
} from "./w2w-hover";

// ============================================================================
// RESOURCE GRAPH - Unified resource enumeration
// ============================================================================

export {
  buildResourceGraph,
  getResourceText,
  getResourceBase64,
  classifyResource,
  buildResourceMapFromGraph,
  collectImageUrls,
  collectImageUrlsFromW2W,
  extractAssetsForTree,
  type ResourceType,
  type ResourceEntry,
  type ResourceGraph,
  type ResourceInfo,
  type ExtractAssetsOptions,
} from "./resource-graph";

// ============================================================================
// FONT CSS PARSER - @font-face extraction from raw CSS
// ============================================================================

export {
  parseFontFaceRules,
  deduplicateFonts,
  resolveRelativeUrl,
  type ParsedFontFace,
} from "./font-css-parser";

// ============================================================================
// FONT BINARY EXTRACTION - font binary extraction from browser cache
// ============================================================================

export {
  extractFontBinaries,
  extractUrlsFromSrc,
} from "./font-binary-extraction";

// ============================================================================
// GRID PARSER - CSS Grid template to Figma GridTrackSize conversion
// ============================================================================

export {
  parseGridTemplate,
  parseTrackValue,
  getGridSpan,
  parseGridLineIndex,
  type FigmaGridTrackSize,
} from "./grid-parser";

// ============================================================================
// CONTENT SCRIPT BUNDLE
// NOTE: getContentScriptBundle uses Node.js fs/path, so it's NOT exported from
// the main entry to avoid breaking browser-targeted builds (Figma plugin).
// API should import directly: import { getContentScriptBundle } from "@w2w/shared/content-script-bundle"
// ============================================================================

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

import type { CDPClientInterface, ExtractedElement } from "./types";
import { captureSnapshot, parseSnapshot, findNodesNeedingMatchedStyles, resolveNodeIds } from "./snapshot";
import { getMatchedStylesForNode, extractCSSVariables, extractBackgroundFromCSS } from "./css";
import { buildElementTree, type BuildTreeOptions } from "./tree-builder";
import type { CDPMatchedStyles } from "./types";
import { findInteractiveNodes, capturePseudoStatesForNodes } from "./pseudo-states";

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
 * @deprecated Both Browser_Extension and Plugin_Backend use their own orchestration
 * that includes resource graph, platform fonts, and asset extraction — features this
 * function does not provide. Use the individual exported utilities instead:
 * captureSnapshot, parseSnapshot, findNodesNeedingMatchedStyles, resolveNodeIds,
 * getMatchedStylesForNode, capturePseudoStatesForNodes, extractCSSVariables,
 * buildElementTree, buildResourceGraph, extractAssetsForTree, collectPlatformFonts.
 *
 * @param client - CDP client implementation (chrome.debugger or Puppeteer)
 * @param options - Extraction options
 * @returns ExtractedElement tree (without fonts, assets, or resource data)
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
  const { nodes, nodesByBackendId, documentURL } = parseSnapshot(snapshot);

  // 4. Find nodes that need matched styles + interactive nodes for pseudo-states
  const nodesNeedingStyles = findNodesNeedingMatchedStyles(nodes);
  const interactiveNodes = findInteractiveNodes(nodes);

  // 5. Resolve node IDs for CSS queries (merged unique set)
  const allBackendNodeIds = [
    ...new Set([
      ...nodesNeedingStyles.map((n) => n.backendNodeId),
      ...interactiveNodes.map((n) => n.backendNodeId),
    ]),
  ];
  const nodeIdMap = await resolveNodeIds(client, allBackendNodeIds);

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

  // 6.5. Capture pseudo-state styles (:hover) for interactive elements
  const pseudoStateStylesMap = await capturePseudoStatesForNodes(
    client,
    interactiveNodes
      .map((n) => ({
        backendNodeId: n.backendNodeId,
        nodeId: nodeIdMap.get(n.backendNodeId)!,
      }))
      .filter((n) => n.nodeId),
    matchedStylesMap,
    { concurrency: 5 }
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
    documentURL,
    pseudoStateStylesMap,
  };

  const tree = buildElementTree(
    nodes,
    nodesByBackendId,
    matchedStylesMap,
    buildOptions
  );

  return tree;
}
