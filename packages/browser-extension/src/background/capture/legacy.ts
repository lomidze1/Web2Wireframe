/* eslint-disable no-console -- `[W2W]` capture-flow tracing; silenced in
 * prod by gateConsoleInProduction(). */

/**
 * Legacy CDP-only capture pipeline.
 *
 * Unreachable from the current popup UI (the active flow is
 * `capture/w2w.ts`'s hybrid content-script + CDP path). Preserved here
 * for the `/api/import-cdp` endpoint and the rare debugging session
 * where DOMSnapshot-based extraction is the only way to reproduce a
 * regression.
 *
 * Flow:
 *  1. setDeviceMetricsOverride per viewport
 *  2. Page.reload + autoScrollPage to materialize lazy content
 *  3. DOMSnapshot.captureSnapshot — one CDP call for layout + styles
 *  4. CSS.getMatchedStylesForNode only on nodes that need it
 *     (gradients, CSS variables, pseudo content)
 *  5. Build wireframe tree + collect fonts/assets/css vars
 */

import { CDPClient, createCDPClient } from "../cdp/client";
import { getDocument, getScrollDimensions } from "../cdp/dom";
import { extractFonts, collectPlatformFonts } from "../cdp/fonts";
import {
  buildResourceMap,
  extractAssetsForTree,
  getResourceBase64,
} from "../cdp/assets";
import {
  captureSnapshot,
  parseSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  getMatchedStylesForNode,
  extractCSSVariables,
  extractBackgroundFromCSS,
  getPlatformFontForPseudoElement,
  extractPseudoContentRuntime,
  type RuntimePseudoContent,
  buildElementTree,
  buildTreeFromSnapshot,
  findIconFontNodes,
  findIconClassElements,
  type CaptureResult,
  type CapturedFrame,
  type CaptureOptions,
  type CDPMatchedStyles,
  DEFAULT_CAPTURE_OPTIONS,
} from "@w2w/shared";

import { analyzeColorsFromTree } from "@/shared/utils";

import { state, updateProgress } from "../state";
import { categorizeCSSVariable } from "../utils/misc";
import { getSettings } from "../utils/settings";

/**
 * Auto-scroll the page to trigger lazy-loaded content
 */
export async function autoScrollPage(client: CDPClient): Promise<void> {
  const scrollStep = 400;
  const scrollDelay = 100;
  const maxScrollTime = 30000;

  try {
    await client.send("Runtime.evaluate", {
      expression: `
        (async () => {
          const scrollStep = ${scrollStep};
          const scrollDelay = ${scrollDelay};
          const maxTime = ${maxScrollTime};
          const startTime = Date.now();

          let totalHeight = 0;
          let lastHeight = document.documentElement.scrollHeight;

          while (Date.now() - startTime < maxTime) {
            const currentHeight = document.documentElement.scrollHeight;
            window.scrollBy(0, scrollStep);
            totalHeight += scrollStep;
            await new Promise(r => setTimeout(r, scrollDelay));

            if (totalHeight >= currentHeight + 1000) {
              if (document.documentElement.scrollHeight > lastHeight) {
                lastHeight = document.documentElement.scrollHeight;
                continue;
              }
              break;
            }
          }

          window.scrollTo(0, 0);
          await new Promise(r => setTimeout(r, 500));
        })()
      `,
      awaitPromise: true,
      timeout: maxScrollTime + 5000,
    });
  } catch {
    // Auto-scroll failed, scroll to top
    await client
      .send("Runtime.evaluate", { expression: "window.scrollTo(0, 0)" })
      .catch(() => {});
  }
}

/**
 * Handle page capture request
 *
 * MULTI-VIEWPORT APPROACH:
 * 1. Loop through each viewport in options.viewports
 * 2. For each: set viewport → reload → scroll → capture
 * 3. Return frames array with all captures
 */
export async function handleCapturePage(
  tabId: number,
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
    console.log("[W2W] Starting capture for:", tab.url);

    updateProgress(5, "Connecting to page...");
    client = await createCDPClient(tabId);
    console.log("[W2W] CDP client connected");

    // Get current devicePixelRatio (browser zoom level)
    const dprResult = await client.send<{ result: { value: number } }>(
      "Runtime.evaluate",
      {
        expression: "window.devicePixelRatio",
        returnByValue: true,
      },
    );
    const browserDpr = dprResult.result.value || 1;

    const viewports = options.viewports.length > 0 ? options.viewports : [1440];
    const frames: CapturedFrame[] = [];

    // Calculate progress step per viewport
    const progressPerViewport = 70 / viewports.length;

    // CSS Variables map - extracted once on first viewport, reused across all viewports
    const sharedCssVariablesMap = new Map<string, string>();

    // =========================================================================
    // CAPTURE EACH VIEWPORT SEQUENTIALLY
    // =========================================================================
    for (let i = 0; i < viewports.length; i++) {
      const targetViewport = viewports[i];
      const baseProgress = 10 + i * progressPerViewport;

      updateProgress(
        baseProgress,
        `Capturing viewport ${targetViewport}px (${i + 1}/${viewports.length})...`,
      );

      // Set viewport emulation
      const targetHeight = 900;
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: targetViewport,
        height: targetHeight,
        deviceScaleFactor: 1 / browserDpr,
        mobile: targetViewport <= 768,
        screenWidth: targetViewport,
        screenHeight: targetHeight,
        positionX: 0,
        positionY: 0,
        screenOrientation: { angle: 0, type: "landscapePrimary" },
      });

      // Reload page to apply viewport changes
      await client.send("Page.reload", { ignoreCache: false });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Scroll for lazy content (must happen before scrollbar measurement)
      await autoScrollPage(client);

      // Scrollbar compensation (html.to.design approach):
      // After content is loaded, measure actual layout viewport and adjust
      const layoutMetrics = await client.send<{
        layoutViewport: { clientWidth: number; clientHeight: number };
      }>("Page.getLayoutMetrics", {});

      const actualLayoutWidth = layoutMetrics.layoutViewport.clientWidth;
      const scrollbarWidth = targetViewport - actualLayoutWidth;

      if (scrollbarWidth > 0) {
        // Method 1: Increase viewport by scrollbar width so layout = targetViewport
        await client.send("Emulation.setDeviceMetricsOverride", {
          width: targetViewport + scrollbarWidth,
          height: targetHeight,
          deviceScaleFactor: 1 / browserDpr,
          mobile: targetViewport <= 768,
          screenWidth: targetViewport + scrollbarWidth,
          screenHeight: targetHeight,
          positionX: 0,
          positionY: 0,
          screenOrientation: { angle: 0, type: "landscapePrimary" },
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Method 2: CSS injection to hide scrollbar (backup - ensures no scrollbar affects layout)
      await client.send("Runtime.evaluate", {
        expression: `
          const style = document.createElement('style');
          style.id = '__w2w_hide_scrollbar';
          style.textContent = 'html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }';
          document.head.appendChild(style);
        `,
        awaitPromise: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Get dimensions
      const dimensions = await getScrollDimensions(client);

      // Capture snapshot
      updateProgress(baseProgress + progressPerViewport * 0.3, "Capturing snapshot...");
      console.log(`[W2W] Capturing snapshot for viewport ${targetViewport}px...`);
      const snapshot = await captureSnapshot(client);
      const { nodes, nodesByBackendId, documentURL } = parseSnapshot(snapshot);
      console.log(`[W2W] Snapshot parsed: ${nodes.length} nodes`);

      // Find nodes needing matched styles
      const nodesNeedingMatched = findNodesNeedingMatchedStyles(nodes);
      const backendIds = nodesNeedingMatched.map((n) => n.backendNodeId);
      console.log(`[W2W] Nodes needing matched styles: ${nodesNeedingMatched.length}`);

      // Get DOM document
      await getDocument(client, -1, true);
      const nodeIdMap = await resolveNodeIds(client, backendIds);

      // Get matched styles
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

      // Extract CSS variables (only on first viewport - reused across all viewports)
      if (i === 0) {
        const rawCSSVariables = await extractCSSVariables(client);
        for (const v of rawCSSVariables) {
          sharedCssVariablesMap.set(v.name, v.value);
        }
      }
      // Use shared CSS variables map for all viewports
      const cssVariablesMap = sharedCssVariablesMap;

      // Extract body original CSS
      const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

      // Collect platform fonts for text nodes (actual rendered fonts via CDP)
      const textNodes = nodes.filter(
        (n) => n.nodeType === 1 && n.textContent && n.textContent.trim()
      );
      // Resolve text node backendNodeIds that aren't already in nodeIdMap
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

      // Collect platform fonts for icon pseudo-elements (Layer #4)
      const childrenMap = buildTreeFromSnapshot(nodes);
      const iconNodes = findIconFontNodes(nodes, childrenMap);
      const iconPlatformFontMap = new Map<number, Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>>();
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

      // Runtime fallback: extract pseudo-element content for icon elements
      // whose ::before/::after was NOT captured by DOMSnapshot
      const missedIconElements = findIconClassElements(nodes, childrenMap);
      const runtimePseudoContentMap = new Map<number, RuntimePseudoContent>();
      if (missedIconElements.length > 0) {
        console.log(`[W2W] Runtime-probing ${missedIconElements.length} icon elements missing from snapshot...`);
        for (const el of missedIconElements) {
          const content = await extractPseudoContentRuntime(client, el.backendNodeId, el.pseudoType);
          if (content) {
            runtimePseudoContentMap.set(el.backendNodeId, content);
          }
          // Also fetch CSS matched styles for icon elements (Tier 3 fallback)
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
        console.log(`[W2W] Runtime pseudo content extracted: ${runtimePseudoContentMap.size} icons`);
      }

      // Build element tree (uses shared-extraction unified logic)
      updateProgress(baseProgress + progressPerViewport * 0.7, "Building tree...");
      console.log(`[W2W] Building element tree...`);
      const tree = buildElementTree(
        nodes,
        nodesByBackendId,
        matchedStylesMap,
        {
          viewportWidth: targetViewport,
          cssVariablesMap,
          bodyOriginalCSS,
          browserDpr,
          platformFontMap,
          documentURL,
          iconPlatformFontMap,
          runtimePseudoContentMap: runtimePseudoContentMap.size > 0 ? runtimePseudoContentMap : undefined,
        }
      );
      console.log(`[W2W] Tree built: ${tree.children.length} top-level children`);

      frames.push({
        viewport: {
          width: targetViewport,
          height: dimensions.height,
        },
        tree,
      });
    }

    // Extract fonts (once, after all viewports)
    // Honor user setting: when `captureFonts` is false, skip extraction entirely.
    const settings = await getSettings();
    let fonts: Awaited<ReturnType<typeof extractFonts>> = [];
    if (settings.captureFonts) {
      updateProgress(85, "Extracting fonts...");
      fonts = await extractFonts(client, tab.url);

      // Extract font binary files from browser cache (Page.getResourceContent)
      updateProgress(87, "Extracting font files...");
      const fontResourceMap = await buildResourceMap(client);
      for (const font of fonts) {
        // Extract URLs from CSS src property
        const srcUrlRegex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;
        let match;
        while ((match = srcUrlRegex.exec(font.src)) !== null) {
          const fontUrl = match[1];
          const resource = fontResourceMap.get(fontUrl);
          if (resource) {
            const base64 = await getResourceBase64(client, resource.frameId, fontUrl);
            if (base64) {
              font.fontBase64 = base64;
              font.fontMimeType = resource.mimeType;
              break; // First successful extraction wins
            }
          }
        }
      }
    }

    // Extract CSS variables for result
    updateProgress(90, "Extracting CSS variables...");
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(92, "Analyzing colors...");

    // Analyze colors from the first frame's tree
    const detectedColors = frames.length > 0
      ? analyzeColorsFromTree(frames[0].tree as Parameters<typeof analyzeColorsFromTree>[0])
      : undefined;

    // Extract real image assets from browser cache (per frame)
    // (settings was loaded earlier for the captureFonts gate; reuse it here.)
    if (settings.captureAssets && frames.length > 0) {
      updateProgress(94, "Extracting images from cache...");
      const resourceMap = await buildResourceMap(client);

      for (const frame of frames) {
        const assetsMap = await extractAssetsForTree(client, frame.tree, resourceMap);
        const assetCount = Object.keys(assetsMap).length;
        if (assetCount > 0) {
          frame.assets = assetsMap;
        }
      }
    }

    updateProgress(97, "Finalizing...");

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      frames,
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
      detectedColors,
    };

    updateProgress(100, "Complete!");
    console.log(`[W2W] Capture complete: ${frames.length} frames, ${fonts.length} fonts, ${cssVariables.length} vars`);
    return result;
  } finally {
    if (client) {
      try {
        await client.send("Emulation.clearDeviceMetricsOverride", {});
      } catch {
        // Ignore errors during cleanup
      }
      await client.destroy();
    }
    state.isCapturing = false;
  }
}

