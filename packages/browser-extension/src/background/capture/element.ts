/**
 * Element capture pipeline.
 *
 * Two entry points:
 *  - handleCaptureElement(tabId, selector, bounds, options) — invoked
 *    via the legacy ELEMENT_PICKED message path. Locates the element by
 *    geometric bounds (selectors are unreliable across re-renders).
 *  - handleCaptureElementByBackendId(tabId, backendNodeId, options,
 *    client) — invoked by inspect mode, which already holds the CDP
 *    backendNodeId of the picked node.
 *
 * Both flows reuse the same bounds-based subtree extraction —
 * buildElementTreeFromBounds traverses the DOMSnapshot from the picked
 * root and rebuilds an ExtractedElement tree with correct geometry,
 * fills, strokes, effects, etc.
 *
 * This file is large (~1200 lines) because element capture needs the
 * full CSS-matched-rule + asset + font extraction pipeline replicated
 * from the page-capture flow, just scoped to one subtree. Splitting
 * the helpers further would just add import noise without simplifying
 * any single function.
 */

import { CDPClient, createCDPClient } from "../cdp/client";
import { getDocument } from "../cdp/dom";
import { extractFonts, collectPlatformFonts } from "../cdp/fonts";
import { buildResourceMap, extractAssetsForTree, mergeAssetStats } from "../cdp/assets";

import {
  captureSnapshot,
  parseSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  type ParsedSnapshotNode,
  getMatchedStylesForNode,
  extractPropertyFromMatchedRules,
  extractCSSVariables,
  extractBackgroundFromCSS,
  type CSSOMBackground,
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
  extractCSSVariableName,
  parseColor,
  isGradient,
  parseBorderRadius,
  generateId,
  getSemanticName,
  getLayoutMode,
  getLayoutSizing,
  SKIP_TAGS,
  TEXT_TAGS,
  MEDIA_TAGS,
  type ExtractedElement,
  type CaptureResult,
  type CaptureOptions,
  type CDPMatchedStyles,
  DEFAULT_CAPTURE_OPTIONS,
} from "@w2w/shared";

import type { SelectionBounds } from "@/shared/types";
import { analyzeColorsFromTree } from "@/shared/utils";

import { state, updateProgress } from "../state";
import { getSettings } from "../utils/settings";
import { createEmptyElement, categorizeCSSVariable } from "../utils/misc";



/**
 * Handle capture of a selected element
 * Finds element by selector and captures its subtree
 */
export async function handleCaptureElement(
  tabId: number,
  _selector: string, // Selector is passed but we use bounds matching instead
  bounds: SelectionBounds,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<CaptureResult> {
  if (state.isCapturing) {
    throw new Error("Capture already in progress");
  }

  state.isCapturing = true;
  state.captureProgress = 0;
  let client: CDPClient | null = null;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) throw new Error("Cannot capture this page");

    updateProgress(10, "Connecting to page...");
    client = await createCDPClient(tabId);

    // Get browser DPR
    const dprResult = await client.send<{ result: { value: number } }>(
      "Runtime.evaluate",
      {
        expression: "window.devicePixelRatio",
        returnByValue: true,
      },
    );
    const browserDpr = dprResult.result.value || 1;

    // Use first viewport or default
    const targetViewport =
      options.viewports.length > 0 ? options.viewports[0] : 1440;

    updateProgress(20, "Capturing snapshot...");
    const snapshot = await captureSnapshot(client);
    const { nodes, nodesByBackendId } = parseSnapshot(snapshot);

    // Find the element by matching its bounds
    updateProgress(40, "Finding selected element...");
    const targetNode = findNodeByBounds(nodes, bounds, browserDpr);

    if (!targetNode) {
      throw new Error("Could not find selected element");
    }

    // Get all descendants of this element
    const subtreeNodes = getSubtreeNodes(targetNode, nodes);

    // Find nodes needing matched styles
    const nodesNeedingMatched = findNodesNeedingMatchedStyles(subtreeNodes);
    const backendIds = nodesNeedingMatched.map((n) => n.backendNodeId);

    // Get DOM document for node resolution
    await getDocument(client, -1, true);
    const nodeIdMap = await resolveNodeIds(client, backendIds);

    // Get matched styles
    updateProgress(60, "Extracting styles...");
    const matchedStylesMap = new Map<number, CDPMatchedStyles>();
    for (const node of nodesNeedingMatched) {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (nodeId) {
        const matched = await getMatchedStylesForNode(client, nodeId);
        if (matched) {
          matchedStylesMap.set(node.backendNodeId, matched);
        }
      }
    }

    // Extract CSS variables
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariablesMap = new Map<string, string>();
    for (const v of rawCSSVariables) {
      cssVariablesMap.set(v.name, v.value);
    }

    // Extract body background CSS
    const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

    // Collect platform fonts for text nodes
    const textNodes = subtreeNodes.filter(
      (n) => n.nodeType === 1 && n.textContent && n.textContent.trim()
    );
    const unresolvedTextBackendIds = textNodes
      .filter((n) => !nodeIdMap.has(n.backendNodeId))
      .map((n) => n.backendNodeId);
    if (unresolvedTextBackendIds.length > 0) {
      const textNodeIdMap = await resolveNodeIds(client, unresolvedTextBackendIds);
      for (const [bid, nid] of textNodeIdMap) {
        nodeIdMap.set(bid, nid);
      }
    }
    const textNodePairs = textNodes
      .map((n) => ({ backendNodeId: n.backendNodeId, nodeId: nodeIdMap.get(n.backendNodeId)! }))
      .filter((p) => p.nodeId);
    const platformFontMap = await collectPlatformFonts(client, textNodePairs);

    // Build element tree for the subtree
    updateProgress(75, "Building element tree...");
    const elementBounds: SelectionBounds = {
      x: targetNode.bounds!.x / browserDpr,
      y: targetNode.bounds!.y / browserDpr,
      width: targetNode.bounds!.width / browserDpr,
      height: targetNode.bounds!.height / browserDpr,
    };

    const tree = buildElementTreeFromBounds(
      subtreeNodes,
      nodes,
      nodesByBackendId,
      matchedStylesMap,
      elementBounds,
      targetViewport,
      cssVariablesMap,
      bodyOriginalCSS,
      browserDpr,
      platformFontMap,
    );

    // Extract fonts
    // Honor user setting: when `captureFonts` is false, skip extraction entirely.
    const elSettings = await getSettings();
    let fonts: Awaited<ReturnType<typeof extractFonts>> = [];
    if (elSettings.captureFonts) {
      updateProgress(85, "Extracting fonts...");
      fonts = await extractFonts(client, tab.url);
    }

    // Format CSS variables
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(92, "Analyzing colors...");

    // Analyze colors from the tree
    const detectedColors = analyzeColorsFromTree(tree as Parameters<typeof analyzeColorsFromTree>[0]);

    // Extract real image assets from browser cache
    let frameAssets: Record<string, string> | undefined;
    let captureStats: CaptureResult["captureStats"];
    if (elSettings.captureAssets) {
      updateProgress(94, "Extracting images from cache...");
      const resourceMap = await buildResourceMap(client);
      const { assets: assetsMap, stats } = await extractAssetsForTree(
        client,
        tree,
        resourceMap,
      );
      if (Object.keys(assetsMap).length > 0) {
        frameAssets = assetsMap;
      }
      captureStats = mergeAssetStats([stats]);
    }

    updateProgress(97, "Finalizing...");

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      frames: [
        {
          viewport: {
            width: elementBounds.width,
            height: elementBounds.height,
          },
          tree,
          assets: frameAssets,
        },
      ],
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
      detectedColors,
      captureStats,
    };

    updateProgress(100, "Complete!");
    return result;
  } finally {
    if (client) {
      await client.destroy();
    }
    state.isCapturing = false;
  }
}

/**
 * Handle capture of a selected element by backendNodeId
 * Used by CDP Inspect Mode - more reliable than bounds matching
 */
export async function handleCaptureElementByBackendId(
  tabId: number,
  backendNodeId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
  existingClient?: CDPClient,
): Promise<CaptureResult> {
  if (state.isCapturing) {
    throw new Error("Capture already in progress");
  }

  state.isCapturing = true;
  state.captureProgress = 0;
  let client: CDPClient | null = existingClient || null;
  const shouldDestroyClient = !existingClient;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) throw new Error("Cannot capture this page");

    updateProgress(10, "Connecting to page...");
    if (!client) {
      client = await createCDPClient(tabId);
    }

    // Get browser DPR
    const dprResult = await client.send<{ result: { value: number } }>(
      "Runtime.evaluate",
      {
        expression: "window.devicePixelRatio",
        returnByValue: true,
      },
    );
    const browserDpr = dprResult.result.value || 1;

    // Use first viewport or default
    const targetViewport =
      options.viewports.length > 0 ? options.viewports[0] : 1440;

    updateProgress(20, "Capturing snapshot...");
    const snapshot = await captureSnapshot(client);
    const { nodes, nodesByBackendId } = parseSnapshot(snapshot);

    // Find the element by backendNodeId directly
    updateProgress(40, "Finding selected element...");
    const targetNode = nodesByBackendId.get(backendNodeId);

    if (!targetNode) {
      throw new Error("Could not find selected element by backendNodeId");
    }

    // Get all descendants of this element
    const subtreeNodes = getSubtreeNodes(targetNode, nodes);

    // Find nodes needing matched styles
    const nodesNeedingMatched = findNodesNeedingMatchedStyles(subtreeNodes);
    const backendIds = nodesNeedingMatched.map((n) => n.backendNodeId);

    // Get DOM document for node resolution
    await getDocument(client, -1, true);
    const nodeIdMap = await resolveNodeIds(client, backendIds);

    // Get matched styles
    updateProgress(60, "Extracting styles...");
    const matchedStylesMap = new Map<number, CDPMatchedStyles>();
    for (const node of nodesNeedingMatched) {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (nodeId) {
        const matched = await getMatchedStylesForNode(client, nodeId);
        if (matched) {
          matchedStylesMap.set(node.backendNodeId, matched);
        }
      }
    }

    // Extract CSS variables
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariablesMap = new Map<string, string>();
    for (const v of rawCSSVariables) {
      cssVariablesMap.set(v.name, v.value);
    }

    // Extract body background CSS
    const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

    // Collect platform fonts for text nodes
    const textNodes = subtreeNodes.filter(
      (n) => n.nodeType === 1 && n.textContent && n.textContent.trim()
    );
    const unresolvedTextBackendIds = textNodes
      .filter((n) => !nodeIdMap.has(n.backendNodeId))
      .map((n) => n.backendNodeId);
    if (unresolvedTextBackendIds.length > 0) {
      const textNodeIdMap = await resolveNodeIds(client, unresolvedTextBackendIds);
      for (const [bid, nid] of textNodeIdMap) {
        nodeIdMap.set(bid, nid);
      }
    }
    const textNodePairs = textNodes
      .map((n) => ({ backendNodeId: n.backendNodeId, nodeId: nodeIdMap.get(n.backendNodeId)! }))
      .filter((p) => p.nodeId);
    const platformFontMap = await collectPlatformFonts(client, textNodePairs);

    // Build element tree for the subtree
    updateProgress(75, "Building element tree...");
    const elementBounds: SelectionBounds = {
      x: targetNode.bounds!.x / browserDpr,
      y: targetNode.bounds!.y / browserDpr,
      width: targetNode.bounds!.width / browserDpr,
      height: targetNode.bounds!.height / browserDpr,
    };

    const tree = buildElementTreeFromBounds(
      subtreeNodes,
      nodes,
      nodesByBackendId,
      matchedStylesMap,
      elementBounds,
      targetViewport,
      cssVariablesMap,
      bodyOriginalCSS,
      browserDpr,
      platformFontMap,
    );

    // Extract fonts
    // Honor user setting: when `captureFonts` is false, skip extraction entirely.
    const biSettings = await getSettings();
    let fonts: Awaited<ReturnType<typeof extractFonts>> = [];
    if (biSettings.captureFonts) {
      updateProgress(85, "Extracting fonts...");
      fonts = await extractFonts(client, tab.url);
    }

    // Format CSS variables
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(92, "Analyzing colors...");

    // Analyze colors from the tree
    const detectedColors = analyzeColorsFromTree(tree as Parameters<typeof analyzeColorsFromTree>[0]);

    // Extract real image assets from browser cache
    let frameAssets2: Record<string, string> | undefined;
    let captureStats2: CaptureResult["captureStats"];
    if (biSettings.captureAssets) {
      updateProgress(94, "Extracting images from cache...");
      const resourceMap = await buildResourceMap(client);
      const { assets: assetsMap, stats } = await extractAssetsForTree(
        client,
        tree,
        resourceMap,
      );
      if (Object.keys(assetsMap).length > 0) {
        frameAssets2 = assetsMap;
      }
      captureStats2 = mergeAssetStats([stats]);
    }

    updateProgress(97, "Finalizing...");

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      frames: [
        {
          viewport: {
            width: elementBounds.width,
            height: elementBounds.height,
          },
          tree,
          assets: frameAssets2,
        },
      ],
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
      detectedColors,
      captureStats: captureStats2,
    };

    updateProgress(100, "Complete!");
    return result;
  } finally {
    if (shouldDestroyClient && client) {
      await client.destroy();
    }
    state.isCapturing = false;
  }
}

/**
 * Find a node by its bounds (used for element picker)
 */
function findNodeByBounds(
  nodes: ParsedSnapshotNode[],
  bounds: SelectionBounds,
  browserDpr: number,
): ParsedSnapshotNode | null {
  // Find the node with bounds closest to the selection bounds
  let bestMatch: ParsedSnapshotNode | null = null;
  let bestScore = Infinity;

  for (const node of nodes) {
    if (!node.bounds || node.nodeType !== 1) continue;

    const nodeBounds = {
      x: node.bounds.x / browserDpr,
      y: node.bounds.y / browserDpr,
      width: node.bounds.width / browserDpr,
      height: node.bounds.height / browserDpr,
    };

    // Calculate how close this node's bounds are to the selection
    const xDiff = Math.abs(nodeBounds.x - bounds.x);
    const yDiff = Math.abs(nodeBounds.y - bounds.y);
    const widthDiff = Math.abs(nodeBounds.width - bounds.width);
    const heightDiff = Math.abs(nodeBounds.height - bounds.height);

    const score = xDiff + yDiff + widthDiff + heightDiff;

    // Accept if score is very close (within 5 pixels total difference)
    if (score < bestScore && score < 20) {
      bestScore = score;
      bestMatch = node;
    }
  }

  return bestMatch;
}

/**
 * Get all descendant nodes of a given node
 */
function getSubtreeNodes(
  root: ParsedSnapshotNode,
  allNodes: ParsedSnapshotNode[],
): ParsedSnapshotNode[] {
  const result: ParsedSnapshotNode[] = [root];

  // Build parent -> children index map
  const childrenMap = new Map<number, number[]>();
  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    if (node.parentIndex >= 0) {
      if (!childrenMap.has(node.parentIndex)) {
        childrenMap.set(node.parentIndex, []);
      }
      childrenMap.get(node.parentIndex)!.push(i);
    }
  }

  // BFS to collect all descendants
  const queue = [root.index];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const children = childrenMap.get(idx) || [];
    for (const childIdx of children) {
      result.push(allNodes[childIdx]);
      queue.push(childIdx);
    }
  }

  return result;
}

/**
 * Build element tree from selected element's subtree only
 * Root element starts at (0, 0) with coordinates relative to selection
 */
function buildElementTreeFromBounds(
  subtreeNodes: ParsedSnapshotNode[],
  _allNodes: ParsedSnapshotNode[],
  _nodesByBackendId: Map<number, ParsedSnapshotNode>,
  matchedStylesMap: Map<number, CDPMatchedStyles>,
  bounds: SelectionBounds,
  viewportWidth: number,
  cssVariablesMap: Map<string, string>,
  _bodyOriginalCSS: CSSOMBackground | null,
  browserDpr: number,
  platformFontMap?: Map<number, Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>>,
): ExtractedElement {
  // Find the root node (the selected element - first element type node)
  const rootNode = subtreeNodes.find((n) => n.nodeType === 1);

  if (!rootNode) {
    return createEmptyElement(bounds.width, bounds.height);
  }

  // Build children map from ONLY subtree nodes
  const subtreeSet = new Set(subtreeNodes.map((n) => n.index));
  const childrenMap = new Map<number, number[]>();
  for (const node of subtreeNodes) {
    if (node.parentIndex >= 0 && subtreeSet.has(node.parentIndex)) {
      if (!childrenMap.has(node.parentIndex)) {
        childrenMap.set(node.parentIndex, []);
      }
      childrenMap.get(node.parentIndex)!.push(node.index);
    }
  }

  // Create index -> node map for quick lookup
  const nodesByIndex = new Map<number, ParsedSnapshotNode>();
  for (const node of subtreeNodes) {
    nodesByIndex.set(node.index, node);
  }

  // Root coordinates for offset calculation
  const rootX = rootNode.bounds!.x / browserDpr;
  const rootY = rootNode.bounds!.y / browserDpr;

  // CSS default values for filtering (keep only non-default values)
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

  function filterDefaultStyles(styles: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const [prop, value] of Object.entries(styles)) {
      if (!value || value === "") continue;
      if (value === "0px" || value === "0" || value === "0px 0px" || value === "normal") {
        const isTypography = prop === "letter-spacing" || prop === "line-height";
        if (!isTypography) continue;
      }
      const defaults = CSS_DEFAULT_VALUES[prop];
      if (defaults && defaults.includes(value)) continue;
      if (value === "rgba(0, 0, 0, 0)" || value === "transparent") {
        if (prop.includes("background") || prop.includes("border-color")) continue;
      }
      filtered[prop] = value;
    }
    return filtered;
  }

  // Recursive tree builder starting from selected element
  function buildNode(
    node: ParsedSnapshotNode,
    parentX: number,
    parentY: number,
    depth: number,
    parentContext?: {
      direction: "HORIZONTAL" | "VERTICAL" | "NONE" | "GRID";
      alignItems?: string;
    },
  ): ExtractedElement | null {
    const MAX_DEPTH = 15;
    if (depth > MAX_DEPTH) return null;

    const tag = node.nodeName;
    if (node.nodeType !== 1) return null;
    if (SKIP_TAGS.includes(tag as (typeof SKIP_TAGS)[number])) return null;
    if (!node.bounds || node.bounds.width < 1 || node.bounds.height < 1) return null;

    // Scale bounds by DPR
    const scaledBounds = {
      x: node.bounds.x / browserDpr,
      y: node.bounds.y / browserDpr,
      width: node.bounds.width / browserDpr,
      height: node.bounds.height / browserDpr,
    };

    const { x, y } = scaledBounds;
    const width = scaledBounds.width;
    const height = scaledBounds.height;
    const computedStyles = node.computedStyles;
    const matchedStyles = matchedStylesMap.get(node.backendNodeId) || null;

    // Determine element type
    const isMedia = MEDIA_TAGS.includes(tag as (typeof MEDIA_TAGS)[number]) ||
      Boolean(computedStyles["background-image"]?.includes("url("));
    const isText = TEXT_TAGS.includes(tag as (typeof TEXT_TAGS)[number]);

    // Extract styles
    const resolvedVariables = cssVariablesMap;

    let backgroundImage: string | null = null;
    let backgroundShorthand: string | null = null;
    if (matchedStyles) {
      backgroundImage = extractPropertyFromMatchedRules(matchedStyles, "background-image");
      backgroundShorthand = extractPropertyFromMatchedRules(matchedStyles, "background");
    }

    const computedBgColor = computedStyles["background-color"];
    const bgColorForFills = computedBgColor && computedBgColor !== "transparent" &&
      computedBgColor !== "rgba(0, 0, 0, 0)" ? computedBgColor : null;

    // Extract CSS variable references from matched rules (before resolving)
    let bgVariableRef: string | null = null;
    let bgColorVariableRef: string | null = null;
    let textColorVariableRef: string | null = null;
    let borderColorVariableRef: string | null = null;

    if (matchedStyles) {
      bgVariableRef = extractCSSVariableName(backgroundShorthand || backgroundImage || "");
      const rawBgColor = extractPropertyFromMatchedRules(matchedStyles, "background-color");
      bgColorVariableRef = extractCSSVariableName(rawBgColor || "");
      const rawColor = extractPropertyFromMatchedRules(matchedStyles, "color");
      textColorVariableRef = extractCSSVariableName(rawColor || "");
      const rawBorderColor = extractPropertyFromMatchedRules(matchedStyles, "border-color");
      borderColorVariableRef = extractCSSVariableName(rawBorderColor || "");
    }

    const fills = parseBackgroundToFills(
      backgroundShorthand || backgroundImage,
      bgColorForFills,
      resolvedVariables,
      { width, height },
    );

    // Attach CSS variable reference to fills
    const fillVarRef = bgVariableRef || bgColorVariableRef;
    if (fillVarRef && fills.length > 0) {
      fills[0].cssVariable = fillVarRef;
    }

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

    const textColor = parseColor(computedStyles["color"]);

    const strokes = parseBordersToStrokes(
      computedStyles["border-width"],
      computedStyles["border-color"],
      computedStyles["border-style"],
      computedStyles["border-top"],
      computedStyles["border-right"],
      computedStyles["border-bottom"],
      computedStyles["border-left"],
      resolvedVariables,
    );

    // Attach CSS variable reference to strokes
    if (borderColorVariableRef && strokes.length > 0) {
      strokes[0].cssVariable = borderColorVariableRef;
    }

    const borderColor = parseColor(computedStyles["border-color"]);
    // const borderWidth = parseInt(computedStyles["border-width"] || "0") || 0;
    const borderWidth = parseFloat(computedStyles["border-width"] || "0") || 0;
    const borderRadius = parseBorderRadius(computedStyles["border-radius"] || "0");

    let boxShadow: string | null = null;
    if (matchedStyles) {
      const matchedShadow = extractPropertyFromMatchedRules(matchedStyles, "box-shadow");
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
      backdropFilter = extractPropertyFromMatchedRules(matchedStyles, "backdrop-filter");
    }
    if (!backdropFilter) {
      backdropFilter = computedStyles["backdrop-filter"] || null;
    }

    const blurEffects = parseBackdropFilterToEffects(backdropFilter);
    const effects = [...shadowEffects, ...blurEffects];

    // Typography — prefer platform font (actual rendered font) over computed styles
    let fontFamilyRaw = computedStyles["font-family"] || "Inter";
    const platformFonts = platformFontMap?.get(node.backendNodeId);
    if (platformFonts && platformFonts.length > 0) {
      // Use the font with the most glyphs rendered (primary font)
      const primary = platformFonts.reduce((a, b) => a.glyphCount >= b.glyphCount ? a : b);
      fontFamilyRaw = primary.familyName;
    }
    const fontFamilyList = fontFamilyRaw
      .split(",")
      .map((f: string) => f.replace(/['"]/g, "").trim())
      .filter((f: string) => f.length > 0);
    const fontFamily = fontFamilyList[0] || "Inter";
    // const fontSize = parseInt(computedStyles["font-size"] || "14") || 14;
    const fontSize = parseFloat(computedStyles["font-size"] || "14") || 14;
    const fontWeight = parseInt(computedStyles["font-weight"] || "400") || 400;
    const lineHeight = computedStyles["line-height"] || "normal";
    const letterSpacing = parseFloat(computedStyles["letter-spacing"] || "0") || 0;
    const textAlign = computedStyles["text-align"] || "left";

    // Layout
    // const padding = {
    //   top: parseInt(computedStyles["padding-top"]) || 0,
    //   right: parseInt(computedStyles["padding-right"]) || 0,
    //   bottom: parseInt(computedStyles["padding-bottom"]) || 0,
    //   left: parseInt(computedStyles["padding-left"]) || 0,
    // };
    const padding = {
      top: parseFloat(computedStyles["padding-top"] || "0") || 0,
      right: parseFloat(computedStyles["padding-right"] || "0") || 0,
      bottom: parseFloat(computedStyles["padding-bottom"] || "0") || 0,
      left: parseFloat(computedStyles["padding-left"] || "0") || 0,
    };

    const gapStr = computedStyles["gap"] || computedStyles["row-gap"] || "0";
    // const itemSpacing = parseInt(gapStr) || 0;
    const itemSpacing = parseFloat(gapStr) || 0;

    const justifyContent = computedStyles["justify-content"] || undefined;
    const alignItems = computedStyles["align-items"] || undefined;
    const flexWrap = computedStyles["flex-wrap"] || undefined;

    const flexGrowValue = parseFloat(computedStyles["flex-grow"] || "0") || 0;
    const layoutGrow: 0 | 1 | undefined = flexGrowValue > 0 ? 1 : undefined;
    const alignSelf = computedStyles["align-self"];
    const layoutAlign: "STRETCH" | "INHERIT" | undefined = alignSelf === "stretch" ? "STRETCH" : undefined;

    const layoutSizing = getLayoutSizing(computedStyles, flexGrowValue, alignSelf, parentContext);
    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    const cssPosition = computedStyles["position"] as ExtractedElement["position"];
    const position = cssPosition && cssPosition !== "static" ? cssPosition : undefined;

    // Detect horizontal centering (margin: 0 auto)
    // Check original CSS rules for "auto" margin values
    let horizontallyCentered = false;
    if (matchedStyles) {
      const marginLeft = extractPropertyFromMatchedRules(matchedStyles, "margin-left");
      const marginRight = extractPropertyFromMatchedRules(matchedStyles, "margin-right");
      const marginShorthand = extractPropertyFromMatchedRules(matchedStyles, "margin");

      // Check if margin shorthand contains "auto" (e.g., "0 auto", "0px auto", "auto")
      if (marginShorthand && /\bauto\b/i.test(marginShorthand)) {
        horizontallyCentered = true;
      }
      // Or check individual margin-left/right for "auto"
      else if (marginLeft === "auto" || marginRight === "auto") {
        horizontallyCentered = true;
      }
    }

    // Collect text
    let aggregatedText = node.textContent || "";
    if (!aggregatedText) {
      // For <li> and <a> tags, collect text recursively from all inline children
      if (tag === "li" || tag === "a") {
        aggregatedText = collectAllInlineTextFromSubtree(node.index, subtreeNodes, childrenMap);
      } else {
        aggregatedText = collectDirectTextFromSubtree(node.index, subtreeNodes, childrenMap);
      }
    }

    const isLeaf = isLeafElementFromSubtree(node.index, subtreeNodes, childrenMap);
    const finalText = aggregatedText;

    // Smart wrapping: Check if this would be text but has styles Figma Text can't support
    const wouldBeText = isText || (isLeaf && aggregatedText && tag !== "a");
    const requiresWrapper = wouldBeText && needsFrameWrapper(padding, fills, strokes, effects, borderRadius);

    // Final decision: only be Text if no wrapper needed
    const shouldBeText = wouldBeText && !requiresWrapper;
    const shouldBeFrameWithTextChild = wouldBeText && requiresWrapper;

    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMedia) {
      elementType = "placeholder";
    } else if (shouldBeText && finalText) {
      elementType = "text";
    }

    // For <li>, <a>, or elements needing wrapper: don't put text on frame, we'll add synthetic child
    const isListItemWithText = tag === "li" && !!finalText;
    // For <a> tags: don't require isLeaf - collect text recursively even if it has inline children like <span>
    const isLinkWithText = tag === "a" && !!finalText;
    const needsSyntheticTextChild = isListItemWithText || shouldBeFrameWithTextChild || isLinkWithText;
    const frameTextContent = needsSyntheticTextChild ? "" : finalText;

    // Build element with offset coordinates (relative to selection root)
    const element: ExtractedElement = {
      id: generateId(),
      type: elementType,
      tag,
      className: node.attributes["class"] || undefined,
      name: getSemanticName(tag, node.attributes),
      x: x - parentX,
      y: y - parentY,
      // width: Math.ceil(width),
      // height: Math.ceil(height),
      width: width,
      height: height,
      position,
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
      opacity,
      isPlaceholder: isMedia,
      horizontallyCentered: horizontallyCentered || undefined,
      children: [],
      computedStyles: filterDefaultStyles(computedStyles),
      textColorVariable: textColorVariableRef || undefined,
    };

    // Process children from subtree only
    const childIndices = childrenMap.get(node.index) || [];
    for (const childIdx of childIndices) {
      const childNode = nodesByIndex.get(childIdx);
      if (childNode) {
        // Skip children outside viewport
        if (childNode.bounds && childNode.bounds.x / browserDpr >= viewportWidth) {
          continue;
        }
        const childElement = buildNode(childNode, x, y, depth + 1, {
          direction: element.layoutMode || "VERTICAL",
          alignItems,
        });
        if (childElement && childElement.width > 3 && childElement.height > 3) {
          if (childElement.x + childElement.width > viewportWidth) {
            childElement.width = Math.max(0, viewportWidth - childElement.x);
          }
          element.children.push(childElement);
        }
      }
    }

    // Auto-upgrade parent alignment if any child is horizontally centered
    // This converts CSS "margin: 0 auto" centering to Figma Auto Layout
    if (element.children.length > 0) {
      const hasCenteredChild = element.children.some(
        (child) => child.horizontallyCentered
      );

      if (hasCenteredChild) {
        // If no layout, convert to VERTICAL
        if (element.layoutMode === "NONE") {
          element.layoutMode = "VERTICAL";
          element.justifyContent = "normal"; // Keep vertical positioning as-is
        }
        // For VERTICAL layout, center horizontally (cross-axis)
        if (element.layoutMode === "VERTICAL") {
          element.alignItems = "center";
        }
      }
    }

    // For <li> elements: add synthetic text child (with bullet offset)
    // Note: Don't require element.children.length === 0 because ::before pseudo-elements
    // are already added as children, but we still need the text content
    if (isListItemWithText && finalText) {
      // Check if we already have a text child (avoid duplicates)
      const hasTextChild = element.children.some(
        (c) => c.type === "text" && c.tag === "#text"
      );
      if (!hasTextChild) {
        const bulletWidth = padding.left || 16;
        const syntheticTextChild: ExtractedElement = {
          id: generateId(),
          type: "text",
          tag: "#text",
          name: "Text",
          x: bulletWidth,
          y: 0,
          width: Math.max(10, width - bulletWidth - padding.right),
          height: height,
          position: "relative",
          layoutMode: "NONE",
          itemSpacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          fills: [],
          strokes: [],
          effects: [],
          backgroundColor: null,
          backgroundGradient: null,
          textColor,
          borderColor: null,
          borderWidth: 0,
          borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          boxShadow: null,
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
          textAlign,
          textContent: finalText,
          computedStyles: element.computedStyles,
          opacity: 1,
          isPlaceholder: false,
          children: [],
        };
        element.children.push(syntheticTextChild);
      }
    }

    // Smart wrapping: For text elements that need Frame wrapper (padding, bg, border, etc.)
    // Create Frame with styles + Text child inside (text-only styles)
    if (shouldBeFrameWithTextChild && finalText) {
      const syntheticTextChild: ExtractedElement = {
        id: generateId(),
        type: "text",
        tag: "#text",
        name: "Text",
        x: 0,
        y: 0,
        width: Math.max(10, width - padding.left - padding.right),
        height: Math.max(10, height - padding.top - padding.bottom),
        position: "relative",
        layoutMode: "NONE",
        itemSpacing: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        fills: [],
        strokes: [],
        effects: [],
        backgroundColor: null,
        backgroundGradient: null,
        textColor,
        borderColor: null,
        borderWidth: 0,
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        boxShadow: null,
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight,
        letterSpacing,
        textAlign,
        textContent: finalText,
        computedStyles: element.computedStyles,
        opacity: 1,
        isPlaceholder: false,
        children: [],
      };
      element.children.push(syntheticTextChild);
    }

    // For <a> (link) elements with text: create synthetic text child
    // Links remain Frames so they can have styling, but need text child inside
    // Note: Don't require element.children.length === 0 because some links may have
    // pseudo-elements or other children, but we still need the text content
    if (isLinkWithText && finalText) {
      // Check if we already have a text child (avoid duplicates)
      const hasTextChild = element.children.some(
        (c) => c.type === "text" && c.tag === "#text"
      );
      if (!hasTextChild) {
        const syntheticTextChild: ExtractedElement = {
          id: generateId(),
          type: "text",
          tag: "#text",
          name: "Text",
          x: 0,
          y: 0,
          width: Math.max(10, width - padding.left - padding.right),
          height: Math.max(10, height - padding.top - padding.bottom),
          position: "relative",
          layoutMode: "NONE",
          itemSpacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          fills: [],
          strokes: [],
          effects: [],
          backgroundColor: null,
          backgroundGradient: null,
          textColor,
          borderColor: null,
          borderWidth: 0,
          borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          boxShadow: null,
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
          textAlign,
          textContent: finalText,
          computedStyles: element.computedStyles,
          opacity: 1,
          isPlaceholder: false,
          children: [],
        };
        element.children.push(syntheticTextChild);
      }
    }

    return element;
  }

  // Build tree starting from the selected element (not body)
  const tree = buildNode(rootNode, rootX, rootY, 0);
  if (!tree) {
    return createEmptyElement(bounds.width, bounds.height);
  }

  // Set root position to (0, 0)
  tree.x = 0;
  tree.y = 0;

  return tree;
}

/**
 * Collect direct text from subtree nodes only
 */
function collectDirectTextFromSubtree(
  nodeIndex: number,
  subtreeNodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
): string {
  const nodesByIndex = new Map(subtreeNodes.map((n) => [n.index, n]));
  const childIndices = childrenMap.get(nodeIndex) || [];
  const textParts: string[] = [];
  let hasElementChildren = false;

  for (const childIdx of childIndices) {
    const child = nodesByIndex.get(childIdx);
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
 * Collect all inline text from subtree nodes recursively
 */
function collectAllInlineTextFromSubtree(
  nodeIndex: number,
  subtreeNodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
): string {
  const nodesByIndex = new Map(subtreeNodes.map((n) => [n.index, n]));
  const node = nodesByIndex.get(nodeIndex);
  if (!node) return "";

  if (node.nodeType === 3) {
    return node.textContent || "";
  }

  const childIndices = childrenMap.get(nodeIndex) || [];
  const textParts: string[] = [];

  for (const childIdx of childIndices) {
    const childText = collectAllInlineTextFromSubtree(childIdx, subtreeNodes, childrenMap);
    if (childText) {
      textParts.push(childText);
    }
  }

  let result = textParts.join(" ");
  result = result.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return result;
}

/**
 * Check if element is a leaf (no element children) in subtree
 */
function isLeafElementFromSubtree(
  nodeIndex: number,
  subtreeNodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
): boolean {
  const nodesByIndex = new Map(subtreeNodes.map((n) => [n.index, n]));
  const childIndices = childrenMap.get(nodeIndex) || [];

  for (const childIdx of childIndices) {
    const child = nodesByIndex.get(childIdx);
    if (child && child.nodeType === 1) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a text element needs a Frame wrapper (smart wrapping).
 *
 * Figma Text nodes CANNOT have: padding, background, border, border-radius, box-shadow, backdrop-filter
 * If any of these styles are present, we need to wrap the text in a Frame.
 *
 * NOTE: margin does NOT trigger wrapper - it's handled by absolute positioning.
 */
function needsFrameWrapper(
  padding: { top: number; right: number; bottom: number; left: number },
  fills: unknown[],
  strokes: unknown[],
  effects: unknown[],
  borderRadius: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number },
): boolean {
  // Check padding
  if (padding.top > 0 || padding.right > 0 || padding.bottom > 0 || padding.left > 0) {
    return true;
  }

  // Check fills (background-color, gradient)
  if (fills.length > 0) {
    return true;
  }

  // Check strokes (border)
  if (strokes.length > 0) {
    return true;
  }

  // Check effects (box-shadow, backdrop-filter)
  if (effects.length > 0) {
    return true;
  }

  // Check border-radius
  if (borderRadius.topLeft > 0 || borderRadius.topRight > 0 ||
      borderRadius.bottomRight > 0 || borderRadius.bottomLeft > 0) {
    return true;
  }

  return false;
}
