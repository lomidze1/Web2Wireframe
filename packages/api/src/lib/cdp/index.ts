/**
 * CDP Extraction Module for Puppeteer
 *
 * Uses shared-extraction package for unified extraction logic.
 * This produces IDENTICAL results to Browser Extension extraction.
 *
 * Key architecture:
 * - shared-extraction: Core CDP -> ExtractedElement conversion (unified)
 * - This file: Puppeteer-specific wrapper + legacy post-processing options
 */

import type { Page } from "puppeteer";
import { createCDPClient } from "./client.js";
import { convertToFigmaFormat } from "./convertImage.js";

// Import from shared-extraction package (unified with Browser Extension)
import {
  // Snapshot
  captureSnapshot,
  parseMultiDocSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  // CSS
  getMatchedStylesForNode,
  extractCSSVariables,
  extractBackgroundFromCSS,
  // Tree builder
  buildElementTree,
  // Resource graph (Layer #3)
  buildResourceGraph,
  getResourceText,
  buildResourceMapFromGraph,
  extractAssetsForTree,
  // Font CSS parser
  parseFontFaceRules,
  deduplicateFonts,
  // Pseudo-state capture (Layer #2)
  findInteractiveNodes,
  capturePseudoStatesForNodes,
  // Platform font collection (Layer #4)
  collectPlatformFonts,
  getPlatformFontForPseudoElement,
  extractPseudoContentRuntime,
  findIconFontNodes,
  findIconClassElements,
  buildTreeFromSnapshot,
} from "@w2w/shared";

import type {
  ExtractedElement,
  ExtractedFont,
  ExtractedStylesheet,
  ExtractedCSSVariable,
  CDPMatchedStyles,
  PlatformFontInfo,
  RuntimePseudoContent,
} from "@w2w/shared";

export { createCDPClient } from "./client.js";

interface ExtractDOMTreeOptions {
  viewportWidth?: number;
}

interface ExtractDOMTreeResult {
  tree: ExtractedElement;
  cssVariables: ExtractedCSSVariable[];
  fonts: ExtractedFont[];
  stylesheets: ExtractedStylesheet[];
  assets: Record<string, string>;
}

/**
 * Extract DOM tree using CDP with shared-extraction logic
 *
 * This is the main extraction function that produces IDENTICAL results
 * to Browser Extension extraction.
 */
export async function extractDOMTreeWithCDP(
  page: Page,
  options: ExtractDOMTreeOptions = {}
): Promise<ExtractDOMTreeResult> {
  const { viewportWidth = 1440 } = options;

  // Create CDP client (implements CDPClientInterface)
  // Page domain needed for buildResourceGraph (Page.getResourceTree)
  const client = await createCDPClient(page, {
    domains: ["DOM", "CSS", "DOMSnapshot", "Runtime", "Page"],
  });

  try {
    // 1. Capture page snapshot (ONE CDP call for entire page)
    const snapshot = await captureSnapshot(client);

    // 2. Parse snapshot into usable structures (multi-doc for iframe support)
    const { nodes, nodesByBackendId, documentURL, iframeDocuments } = parseMultiDocSnapshot(snapshot);

    // 3. Find nodes that need getMatchedStylesForNode (gradients, variables)
    const nodesNeedingStyles = findNodesNeedingMatchedStyles(nodes);

    // 4. Request DOM document (required for resolveNodeIds)
    await client.send("DOM.getDocument", { depth: 0 });

    // 5. Resolve nodeIds for matched style nodes
    const backendNodeIds = nodesNeedingStyles.map((n) => n.backendNodeId);
    const nodeIdMap = await resolveNodeIds(client, backendNodeIds);

    // 6. Get matched styles for nodes that need it
    const matchedStylesMap = new Map<number, CDPMatchedStyles>();

    for (const node of nodesNeedingStyles) {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (nodeId) {
        const matchedStyles = await getMatchedStylesForNode(client, nodeId);
        if (matchedStyles) {
          matchedStylesMap.set(node.backendNodeId, matchedStyles);
        }
      }
    }

    // 6.5. Capture pseudo-state styles for interactive elements
    const interactiveNodes = findInteractiveNodes(nodes);
    const unresolvedInteractiveIds = interactiveNodes
      .filter((n) => !nodeIdMap.has(n.backendNodeId))
      .map((n) => n.backendNodeId);
    if (unresolvedInteractiveIds.length > 0) {
      const extraMap = await resolveNodeIds(client, unresolvedInteractiveIds);
      for (const [bid, nid] of extraMap) {
        nodeIdMap.set(bid, nid);
      }
    }
    const pseudoStateNodes = interactiveNodes
      .map((n) => ({ backendNodeId: n.backendNodeId, nodeId: nodeIdMap.get(n.backendNodeId) }))
      .filter((n): n is { backendNodeId: number; nodeId: number } => n.nodeId !== undefined);
    const pseudoStateStylesMap = await capturePseudoStatesForNodes(
      client, pseudoStateNodes, matchedStylesMap, { concurrency: 5 }
    );

    // 6.6. Collect platform fonts for text nodes (actual rendered fonts via CDP)
    const textNodes = nodes.filter(
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
      .map((n) => ({ backendNodeId: n.backendNodeId, nodeId: nodeIdMap.get(n.backendNodeId) }))
      .filter((p): p is { backendNodeId: number; nodeId: number } => p.nodeId !== undefined);
    const platformFontMap = await collectPlatformFonts(client, textNodePairs);

    // 6.7. Collect platform fonts for icon pseudo-elements (Layer #4)
    const childrenMap = buildTreeFromSnapshot(nodes);
    const iconNodes = findIconFontNodes(nodes, childrenMap);
    const iconPlatformFontMap = new Map<number, PlatformFontInfo[]>();
    if (iconNodes.length > 0) {
      for (const iconNode of iconNodes) {
        const fonts = await getPlatformFontForPseudoElement(
          client, iconNode.backendNodeId, iconNode.pseudoType
        );
        if (fonts) {
          iconPlatformFontMap.set(iconNode.backendNodeId, fonts);
        }
      }
    }

    // 6.8. Runtime fallback for icon elements missed by snapshot
    const missedIconElements = findIconClassElements(nodes, childrenMap);
    const runtimePseudoContentMap = new Map<number, RuntimePseudoContent>();
    if (missedIconElements.length > 0) {
      for (const el of missedIconElements) {
        const content = await extractPseudoContentRuntime(client, el.backendNodeId, el.pseudoType);
        if (content) {
          runtimePseudoContentMap.set(el.backendNodeId, content);
        }
        // Also fetch CSS matched styles for icon elements (Tier 3 fallback)
        // CSS rules contain the `content` property directly (e.g., content: "\f5ae")
        if (!matchedStylesMap.has(el.backendNodeId)) {
          const nodeId = nodeIdMap.get(el.backendNodeId);
          if (nodeId) {
            const matched = await getMatchedStylesForNode(client, nodeId);
            if (matched) {
              matchedStylesMap.set(el.backendNodeId, matched);
            }
          }
        }
      }
    }

    // 7. Extract CSS variables
    const cssVariables = await extractCSSVariables(client);
    const cssVariablesMap = new Map(cssVariables.map((v) => [v.name, v.value]));

    // 8. Get body original CSS (preserves gradient syntax)
    const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

    // 9. Build element tree using shared-extraction (IDENTICAL to Browser Extension)
    const tree = buildElementTree(nodes, nodesByBackendId, matchedStylesMap, {
      viewportWidth,
      cssVariablesMap,
      bodyOriginalCSS,
      browserDpr: 1, // Puppeteer at deviceScaleFactor:1; sub-pixel from computedStyles
      documentURL,
      pseudoStateStylesMap,
      platformFontMap,
      iconPlatformFontMap,
      runtimePseudoContentMap: runtimePseudoContentMap.size > 0 ? runtimePseudoContentMap : undefined,
      iframeDocuments,
    });

    // 10. Build resource graph (single Page.getResourceTree call)
    const resourceGraph = await buildResourceGraph(client);

    // 11. Extract @font-face rules from stylesheets in resource graph
    const fonts: ExtractedFont[] = [];
    for (const entry of resourceGraph.stylesheets) {
      try {
        const cssText = await getResourceText(client, entry);
        if (cssText) {
          fonts.push(...parseFontFaceRules(cssText, entry.url));
        }
      } catch { /* skip unreadable stylesheets */ }
    }
    const dedupedFonts = deduplicateFonts(fonts);

    // 12. Build stylesheets list from resource graph
    const stylesheets: ExtractedStylesheet[] = resourceGraph.stylesheets.map((entry) => ({
      url: entry.url,
      isExternal: true,
    }));

    // 13. Extract image assets from resource graph (Layer #3)
    const resourceMap = buildResourceMapFromGraph(resourceGraph);
    console.log(`[W2W-DEBUG] Plugin_Backend: resourceGraph has ${resourceGraph.images.length} images, ${resourceGraph.svgs.length} SVGs`);
    console.log(`[W2W-DEBUG] Plugin_Backend: resourceMap has ${resourceMap.size} entries`);
    const assets = await extractAssetsForTree(client, tree, resourceMap, { convertImage: convertToFigmaFormat });
    console.log(`[W2W-DEBUG] Plugin_Backend: extractAssetsForTree returned ${Object.keys(assets).length} assets`);

    return { tree, cssVariables, fonts: dedupedFonts, stylesheets, assets };
  } finally {
    await client.detach();
  }
}
