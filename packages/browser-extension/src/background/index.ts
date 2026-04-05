/**
 * Background Service Worker
 * Main entry point for the extension's background processes
 *
 * NEW EFFICIENT APPROACH:
 * 1. DOMSnapshot.captureSnapshot - ONE call for entire page (layout + computed styles)
 * 2. CSS.getMatchedStylesForNode - ONLY for nodes with gradients/variables (10-20 calls, not 500+)
 *
 * Uses shared-extraction package for unified extraction logic.
 */

// Browser-specific CDP client (local - uses chrome.debugger)
import { createCDPClient, CDPClient } from "./cdp/client";
import { getDocument, getScrollDimensions } from "./cdp/dom";
import { extractFonts, collectPlatformFonts } from "./cdp/fonts";
import { buildResourceMap, extractAssetsForTree, getResourceBase64 } from "./cdp/assets";

// Shared extraction logic (unified with Plugin_Backend)
import {
  // Snapshot
  captureSnapshot,
  parseSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  type ParsedSnapshotNode,
  // CSS
  getMatchedStylesForNode,
  extractPropertyFromMatchedRules,
  extractCSSVariables,
  extractBackgroundFromCSS,
  getPlatformFontForPseudoElement,
  extractPseudoContentRuntime,
  type CSSOMBackground,
  type RuntimePseudoContent,
  // Style parsers
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
  extractCSSVariableName,
  // Utils
  parseColor,
  isGradient,
  parseBorderRadius,
  generateId,
  getSemanticName,
  getLayoutMode,
  getLayoutSizing,
  // Constants
  SKIP_TAGS,
  TEXT_TAGS,
  MEDIA_TAGS,
  // Types
  type ExtractedElement,
  type CaptureResult,
  type CapturedFrame,
  type CaptureOptions,
  type CDPMatchedStyles,
  DEFAULT_CAPTURE_OPTIONS,
  // Tree builder
  buildElementTree,
  buildTreeFromSnapshot,
  findIconFontNodes,
  findIconClassElements,
} from "@w2w/shared";

// Browser extension-specific types (local)
import type { ExtensionMessage, SelectionBounds } from "@/shared/types";
import { DEFAULT_SETTINGS, STORAGE_KEYS } from "@/shared/constants";
import { analyzeColorsFromTree } from "@/shared/utils";

// Current capture state
let isCapturing = false;
let _captureProgress = 0;

// CDP Inspect Mode state
let inspectModeClient: CDPClient | null = null;
let inspectModeTabId: number | null = null;
let inspectModeOptions: CaptureOptions = DEFAULT_CAPTURE_OPTIONS;

/**
 * Listen for messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "CAPTURE_PAGE") {
      console.log("[W2W] CAPTURE_PAGE received, tabId:", message.tabId);
      handleCapturePage(message.tabId, message.options)
        .then(async (result) => {
          console.log("[W2W] Capture complete, frames:", result.frames.length);
          // Always auto-download from background as fallback
          // (popup may have closed during the lengthy capture)
          await autoDownloadResult(result, message.tabId, "page").catch((e) =>
            console.error("[W2W] Auto-download fallback failed:", e),
          );
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error("[W2W] Capture failed:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
    }

    if (message.type === "SEND_TO_BACKEND") {
      sendToBackend(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    if (message.type === "GET_SETTINGS") {
      getSettings().then((settings) => sendResponse(settings));
      return true;
    }

    if (message.type === "UPDATE_SETTINGS") {
      updateSettings(message.settings).then(() =>
        sendResponse({ success: true }),
      );
      return true;
    }

    if (message.type === "GET_CAPTURE_STATUS") {
      sendResponse({ isCapturing, progress: _captureProgress });
      return false;
    }

    // === CDP Inspect Mode Selection Handler ===

    if (message.type === "START_SELECTION") {
      const { tabId, options } = message as { tabId: number; options: CaptureOptions };
      startInspectMode(tabId, options)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message.type === "CANCEL_SELECTION") {
      cancelInspectMode()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    // Legacy handler - kept for compatibility
    if (message.type === "ELEMENT_PICKED") {
      handleCaptureElement(
        message.tabId,
        message.selector,
        message.bounds,
        message.options,
      )
        .then(async (result) => {
          // Auto-download since popup is closed
          await autoDownloadResult(result, message.tabId, "element");
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    return false;
  },
);

/**
 * Start CDP Inspect Mode for element selection
 * Uses Chrome's built-in element inspector (like DevTools)
 */
async function startInspectMode(
  tabId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<void> {
  // Cancel any existing inspect mode
  await cancelInspectMode();

  try {
    // Create CDP client with Overlay domain
    const client = new CDPClient(tabId);
    await client.attach();
    await client.enableDomains("DOM", "Overlay", "CSS", "DOMSnapshot");

    inspectModeClient = client;
    inspectModeTabId = tabId;
    inspectModeOptions = options;

    // Highlight configuration (similar to DevTools)
    const highlightConfig = {
      showInfo: true,
      showStyles: false,
      showAccessibilityInfo: false,
      showExtensionLines: false,
      contentColor: { r: 111, g: 168, b: 220, a: 0.66 },  // Blue fill
      paddingColor: { r: 147, g: 196, b: 125, a: 0.55 }, // Green padding
      borderColor: { r: 255, g: 229, b: 153, a: 0.66 },  // Yellow border
      marginColor: { r: 246, g: 178, b: 107, a: 0.66 },  // Orange margin
    };

    // Listen for element selection
    client.on("Overlay.inspectNodeRequested", async (params: unknown) => {
      const { backendNodeId } = params as { backendNodeId: number };

      // Disable inspect mode first
      await client.send("Overlay.setInspectMode", {
        mode: "none",
        highlightConfig: {},
      });

      // Capture the selected element
      try {
        console.log("[W2W] Element selected, backendNodeId:", backendNodeId);
        const result = await handleCaptureElementByBackendId(
          tabId,
          backendNodeId,
          inspectModeOptions,
          client,
        );
        console.log("[W2W] Element capture complete, downloading...");
        await autoDownloadResult(result, tabId, "element");
      } catch (err) {
        console.error("[W2W] Element capture/download failed:", err);
      } finally {
        // Cleanup inspect mode
        await cancelInspectMode();
      }
    });

    // Listen for inspect mode cancelled (user pressed ESC or clicked outside)
    client.on("Overlay.inspectModeCanceled", async () => {
      await cancelInspectMode();
    });

    // Start inspect mode
    await client.send("Overlay.setInspectMode", {
      mode: "searchForNode",
      highlightConfig,
    });

    // Inject a small UI for cancel button (in content script)
    await injectSelectionUI(tabId);

  } catch (error) {
    await cancelInspectMode();
    throw error;
  }
}

/**
 * Cancel CDP Inspect Mode
 */
async function cancelInspectMode(): Promise<void> {
  if (inspectModeClient) {
    try {
      // Disable inspect mode
      await inspectModeClient.send("Overlay.setInspectMode", {
        mode: "none",
        highlightConfig: {},
      }).catch(() => {});

      // Destroy client
      await inspectModeClient.destroy();
    } catch (e) {
      // Ignore cleanup errors
    }
    inspectModeClient = null;
  }

  // Remove UI from page
  if (inspectModeTabId) {
    try {
      await chrome.tabs.sendMessage(inspectModeTabId, { type: "HIDE_SELECTION_UI" });
    } catch (e) {
      // Content script might not be ready
    }
  }

  inspectModeTabId = null;
  inspectModeOptions = DEFAULT_CAPTURE_OPTIONS;
}

/**
 * Inject selection UI into the page (just a cancel button)
 */
async function injectSelectionUI(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SHOW_SELECTION_UI" });
  } catch (e) {
    // Content script might not be ready, inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showSelectionOverlay,
    });
  }
}

/**
 * Show selection overlay (injected into page)
 */
function showSelectionOverlay() {
  // Remove existing overlay
  const existing = document.getElementById("w2w-selection-overlay");
  if (existing) existing.remove();

  // Create overlay container
  const overlay = document.createElement("div");
  overlay.id = "w2w-selection-overlay";
  overlay.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      color: white;
      font-size: 14px;
    ">
      <span>Click an element to capture</span>
      <button id="w2w-cancel-btn" style="
        background: #444;
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s;
      ">Cancel (ESC)</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cancel button handler
  const cancelBtn = document.getElementById("w2w-cancel-btn");
  cancelBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CANCEL_SELECTION" });
    overlay.remove();
  });

  // ESC key handler
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      chrome.runtime.sendMessage({ type: "CANCEL_SELECTION" });
      overlay.remove();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

/**
 * Auto-scroll the page to trigger lazy-loaded content
 */
async function autoScrollPage(client: CDPClient): Promise<void> {
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
  } catch (e) {
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
async function handleCapturePage(
  tabId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<CaptureResult> {
  if (isCapturing) {
    throw new Error("Capture already in progress");
  }

  isCapturing = true;
  _captureProgress = 0;
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
    let sharedCssVariablesMap = new Map<string, string>();

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
      console.log(`[W2W] Collecting platform fonts for ${textNodePairs.length} text nodes...`);
      const platformFontMap = await collectPlatformFonts(client, textNodePairs);
      console.log(`[W2W] Platform fonts collected: ${platformFontMap.size} nodes with font data`);

      // Collect platform fonts for icon pseudo-elements (Layer #4)
      const childrenMap = buildTreeFromSnapshot(nodes);
      const iconNodes = findIconFontNodes(nodes, childrenMap);
      const iconPlatformFontMap = new Map<number, Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>>();
      if (iconNodes.length > 0) {
        console.log(`[W2W] Probing platform fonts for ${iconNodes.length} icon pseudo-elements...`);
        for (const iconNode of iconNodes) {
          const fonts = await getPlatformFontForPseudoElement(
            client, iconNode.backendNodeId, iconNode.pseudoType
          );
          if (fonts) {
            iconPlatformFontMap.set(iconNode.backendNodeId, fonts);
          }
        }
        console.log(`[W2W] Icon platform fonts collected: ${iconPlatformFontMap.size} icons`);
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
    updateProgress(85, "Extracting fonts...");
    const fonts = await extractFonts(client, tab.url);

    // Extract font binary files from browser cache (h2d-style)
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
    const settings = await getSettings();
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
    isCapturing = false;
  }
}

/**
 * Handle capture of a selected element
 * Finds element by selector and captures its subtree
 */
async function handleCaptureElement(
  tabId: number,
  _selector: string, // Selector is passed but we use bounds matching instead
  bounds: SelectionBounds,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<CaptureResult> {
  if (isCapturing) {
    throw new Error("Capture already in progress");
  }

  isCapturing = true;
  _captureProgress = 0;
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
    updateProgress(85, "Extracting fonts...");
    const fonts = await extractFonts(client, tab.url);

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
    const elSettings = await getSettings();
    if (elSettings.captureAssets) {
      updateProgress(94, "Extracting images from cache...");
      const resourceMap = await buildResourceMap(client);
      const assetsMap = await extractAssetsForTree(client, tree, resourceMap);
      if (Object.keys(assetsMap).length > 0) {
        frameAssets = assetsMap;
      }
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
    };

    updateProgress(100, "Complete!");
    return result;
  } finally {
    if (client) {
      await client.destroy();
    }
    isCapturing = false;
  }
}

/**
 * Handle capture of a selected element by backendNodeId
 * Used by CDP Inspect Mode - more reliable than bounds matching
 */
async function handleCaptureElementByBackendId(
  tabId: number,
  backendNodeId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
  existingClient?: CDPClient,
): Promise<CaptureResult> {
  if (isCapturing) {
    throw new Error("Capture already in progress");
  }

  isCapturing = true;
  _captureProgress = 0;
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
    updateProgress(85, "Extracting fonts...");
    const fonts = await extractFonts(client, tab.url);

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
    const biSettings = await getSettings();
    if (biSettings.captureAssets) {
      updateProgress(94, "Extracting images from cache...");
      const resourceMap = await buildResourceMap(client);
      const assetsMap = await extractAssetsForTree(client, tree, resourceMap);
      if (Object.keys(assetsMap).length > 0) {
        frameAssets2 = assetsMap;
      }
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
    };

    updateProgress(100, "Complete!");
    return result;
  } finally {
    if (shouldDestroyClient && client) {
      await client.destroy();
    }
    isCapturing = false;
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

/**
 * Create an empty element for the selection area
 */
function createEmptyElement(width: number, height: number): ExtractedElement {
  return {
    id: generateId(),
    type: "frame",
    tag: "div",
    name: "Selected Area",
    x: 0,
    y: 0,
    width,
    height,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: null,
    borderColor: null,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    boxShadow: null,
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: "left",
    textContent: "",
    opacity: 1,
    isPlaceholder: false,
    children: [],
  };
}

/**
 * Categorize a CSS variable based on its name and value
 */
function categorizeCSSVariable(name: string, value: string): string {
  const nameLower = name.toLowerCase();

  // Check name patterns first
  if (
    nameLower.includes("color") ||
    nameLower.includes("bg") ||
    nameLower.includes("text")
  ) {
    return "color";
  }
  if (
    nameLower.includes("font") ||
    nameLower.includes("text-size") ||
    nameLower.includes("line-height")
  ) {
    return "typography";
  }
  if (
    nameLower.includes("spacing") ||
    nameLower.includes("gap") ||
    nameLower.includes("padding") ||
    nameLower.includes("margin")
  ) {
    return "spacing";
  }
  if (nameLower.includes("radius") || nameLower.includes("rounded")) {
    return "radius";
  }
  if (nameLower.includes("shadow")) {
    return "shadow";
  }
  if (nameLower.includes("border")) {
    return "border";
  }

  // Check value patterns
  const valueLower = value.toLowerCase();
  if (
    valueLower.startsWith("#") ||
    valueLower.startsWith("rgb") ||
    valueLower.startsWith("hsl")
  ) {
    return "color";
  }
  if (
    valueLower.includes("px") ||
    valueLower.includes("rem") ||
    valueLower.includes("em")
  ) {
    // Could be spacing or typography
    if (nameLower.includes("size")) {
      return "typography";
    }
    return "spacing";
  }

  return "other";
}

/**
 * Update capture progress
 */
function updateProgress(progress: number, status: string) {
  _captureProgress = progress;
  chrome.runtime
    .sendMessage({
      type: "CAPTURE_PROGRESS",
      progress,
      status,
    })
    .catch(() => {});
}

/**
 * Auto-download capture result from background service worker.
 * Uses chrome.offscreen API for large JSON (data URL has ~2MB limit),
 * falls back to data URL for smaller payloads.
 */
async function autoDownloadResult(
  result: CaptureResult,
  tabId: number,
  captureType: "page" | "area" | "element",
): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const domain = getDomainFromUrl(tab.url || "");
    const viewportLabel = result.frames.map((f) => f.viewport.width).join("_");
    const filename = `${domain}_${viewportLabel}_wireframe.json`;

    const jsonString = JSON.stringify(result, null, 2);
    console.log(`[W2W] Auto-download: ${filename} (${(jsonString.length / 1024).toFixed(0)}KB)`);

    // Use data URL approach (works in service worker since Chrome 116+)
    const blob = new Blob([jsonString], { type: "application/json" });
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
    });
    console.log("[W2W] Download triggered:", filename);
  } catch (err) {
    console.error("[W2W] Auto-download primary failed:", err);
    // Fallback: inject script into the tab to trigger download from page context
    // (page context has full DOM API support including URL.createObjectURL)
    try {
      const jsonString = JSON.stringify(result, null, 2);
      const domain = getDomainFromUrl(result.url || "");
      const fallbackName = `${domain}_${captureType}_wireframe.json`;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (json: string, name: string) => {
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          a.click();
          URL.revokeObjectURL(url);
        },
        args: [jsonString, fallbackName],
      });
      console.log("[W2W] Fallback download via page injection succeeded");
    } catch (fallbackErr) {
      console.error("[W2W] Fallback download also failed:", fallbackErr);
    }
  }
}

/**
 * Extract domain from URL for filename
 */
function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").replace(/\./g, "_");
  } catch {
    return "website";
  }
}

/**
 * Send captured data to backend
 */
async function sendToBackend(data: CaptureResult): Promise<unknown> {
  const settings = await getSettings();

  const response = await fetch(settings.backendUrl + "/api/import-cdp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      captureData: data,
      timestamp: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get extension settings
 */
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

/**
 * Update extension settings
 */
async function updateSettings(settings: object) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

// Extension loaded
