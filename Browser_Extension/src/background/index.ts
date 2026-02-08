/**
 * Background Service Worker
 * Main entry point for the extension's background processes
 *
 * NEW EFFICIENT APPROACH:
 * 1. DOMSnapshot.captureSnapshot - ONE call for entire page (layout + computed styles)
 * 2. CSS.getMatchedStylesForNode - ONLY for nodes with gradients/variables (10-20 calls, not 500+)
 */

import { createCDPClient, CDPClient } from "./cdp/client";
import { getDocument, getScrollDimensions } from "./cdp/dom";
import {
  getMatchedStylesForNode,
  extractPropertyFromMatchedRules,
  extractPseudoStyles,
  extractCSSVariables,
  extractBackgroundFromCSS,
  type CSSOMBackground,
} from "./cdp/css";
import {
  captureSnapshot,
  parseSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  type ParsedSnapshotNode,
} from "./cdp/snapshot";
import { extractFonts } from "./cdp/fonts";
import type {
  ExtractedElement,
  CaptureResult,
  CapturedFrame,
  CaptureOptions,
  ExtensionMessage,
  CDPMatchedStyles,
  SelectionBounds,
} from "@/shared/types";
import { DEFAULT_CAPTURE_OPTIONS } from "@/shared/types";
import {
  SKIP_TAGS,
  TEXT_TAGS,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
} from "@/shared/constants";
import {
  parseColor,
  isGradient,
  parseBorderRadius,
  generateId,
  getSemanticName,
} from "@/shared/utils";
import {
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
} from "@/shared/style-parsers";

// Media tags that become placeholders
const MEDIA_TAGS = ["img", "video", "iframe", "picture", "canvas"] as const;

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
      handleCapturePage(message.tabId, message.options)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
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
      console.log("[W2W] ELEMENT_PICKED received:", message.selector, message.bounds);
      handleCaptureElement(
        message.tabId,
        message.selector,
        message.bounds,
        message.options,
      )
        .then(async (result) => {
          console.log("[W2W] Element capture complete, auto-downloading...");
          // Auto-download since popup is closed
          await autoDownloadResult(result, message.tabId, "element");
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error("[W2W] Element capture error:", error);
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

  console.log("[W2W] Starting CDP Inspect Mode for tab:", tabId);

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
      console.log("[W2W] Element selected via Inspect Mode, backendNodeId:", backendNodeId);

      // Disable inspect mode first
      await client.send("Overlay.setInspectMode", {
        mode: "none",
        highlightConfig: {},
      });

      // Capture the selected element
      try {
        const result = await handleCaptureElementByBackendId(
          tabId,
          backendNodeId,
          inspectModeOptions,
          client,
        );
        console.log("[W2W] Element capture complete, auto-downloading...");
        await autoDownloadResult(result, tabId, "element");
      } catch (error) {
        console.error("[W2W] Element capture error:", error);
      } finally {
        // Cleanup inspect mode
        await cancelInspectMode();
      }
    });

    // Listen for inspect mode cancelled (user pressed ESC or clicked outside)
    client.on("Overlay.inspectModeCanceled", async () => {
      console.log("[W2W] Inspect mode cancelled by user");
      await cancelInspectMode();
    });

    // Start inspect mode
    await client.send("Overlay.setInspectMode", {
      mode: "searchForNode",
      highlightConfig,
    });

    console.log("[W2W] Inspect Mode active - hover over elements to highlight");

    // Inject a small UI for cancel button (in content script)
    await injectSelectionUI(tabId);

  } catch (error) {
    console.error("[W2W] Failed to start inspect mode:", error);
    await cancelInspectMode();
    throw error;
  }
}

/**
 * Cancel CDP Inspect Mode
 */
async function cancelInspectMode(): Promise<void> {
  if (inspectModeClient) {
    console.log("[W2W] Cancelling Inspect Mode");
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

    updateProgress(5, "Connecting to page...");
    client = await createCDPClient(tabId);

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

      // Scroll for lazy content
      await autoScrollPage(client);

      // Get dimensions
      const dimensions = await getScrollDimensions(client);

      // Capture snapshot
      updateProgress(baseProgress + progressPerViewport * 0.3, "Capturing snapshot...");
      const snapshot = await captureSnapshot(client);
      const { nodes, nodesByBackendId } = parseSnapshot(snapshot);

      // Find nodes needing matched styles
      const nodesNeedingMatched = findNodesNeedingMatchedStyles(nodes);
      const backendIds = nodesNeedingMatched.map((n) => n.backendNodeId);

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

      // Build element tree
      updateProgress(baseProgress + progressPerViewport * 0.7, "Building tree...");
      const tree = buildElementTree(
        nodes,
        nodesByBackendId,
        matchedStylesMap,
        targetViewport,
        cssVariablesMap,
        bodyOriginalCSS,
        browserDpr,
      );

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
    const fonts = await extractFonts(client);

    // Extract CSS variables for result
    updateProgress(90, "Extracting CSS variables...");
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(95, "Finalizing...");

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      frames,
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
    };

    updateProgress(100, "Complete!");
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
    );

    // Extract fonts
    updateProgress(85, "Extracting fonts...");
    const fonts = await extractFonts(client);

    // Format CSS variables
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(95, "Finalizing...");

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      frames: [
        {
          viewport: {
            width: Math.ceil(elementBounds.width),
            height: Math.ceil(elementBounds.height),
          },
          tree,
        },
      ],
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
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
    );

    // Extract fonts
    updateProgress(85, "Extracting fonts...");
    const fonts = await extractFonts(client);

    // Format CSS variables
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(95, "Finalizing...");

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      frames: [
        {
          viewport: {
            width: Math.ceil(elementBounds.width),
            height: Math.ceil(elementBounds.height),
          },
          tree,
        },
      ],
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
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

  // Recursive tree builder starting from selected element
  function buildNode(
    node: ParsedSnapshotNode,
    parentX: number,
    parentY: number,
    depth: number,
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

    const fills = parseBackgroundToFills(
      backgroundShorthand || backgroundImage,
      bgColorForFills,
      resolvedVariables,
      { width, height },
    );

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

    const borderColor = parseColor(computedStyles["border-color"]);
    const borderWidth = parseInt(computedStyles["border-width"] || "0") || 0;
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

    // Typography
    const fontFamily = (computedStyles["font-family"] || "Inter").split(",")[0]?.replace(/['"]/g, "").trim();
    const fontSize = parseInt(computedStyles["font-size"] || "14") || 14;
    const fontWeight = parseInt(computedStyles["font-weight"] || "400") || 400;
    const lineHeight = computedStyles["line-height"] || "normal";
    const letterSpacing = parseFloat(computedStyles["letter-spacing"] || "0") || 0;
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
    const layoutAlign: "STRETCH" | "INHERIT" | undefined = alignSelf === "stretch" ? "STRETCH" : undefined;

    const layoutSizing = getLayoutSizing(computedStyles, flexGrowValue, alignSelf);
    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    const cssPosition = computedStyles["position"] as ExtractedElement["position"];
    const position = cssPosition && cssPosition !== "static" ? cssPosition : undefined;

    // Collect text
    let aggregatedText = node.textContent || "";
    if (!aggregatedText) {
      if (tag === "li") {
        aggregatedText = collectAllInlineTextFromSubtree(node.index, subtreeNodes, childrenMap);
      } else {
        aggregatedText = collectDirectTextFromSubtree(node.index, subtreeNodes, childrenMap);
      }
    }

    const isLeaf = isLeafElementFromSubtree(node.index, subtreeNodes, childrenMap);
    const shouldBeText = isText || (isLeaf && aggregatedText && tag !== "a");
    const finalText = aggregatedText;

    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMedia) {
      elementType = "placeholder";
    } else if (shouldBeText && finalText) {
      elementType = "text";
    }

    const isListItemWithText = tag === "li" && !!finalText;
    const frameTextContent = isListItemWithText ? "" : finalText;

    // Build element with offset coordinates (relative to selection root)
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
      children: [],
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
        const childElement = buildNode(childNode, x, y, depth + 1);
        if (childElement && childElement.width > 3 && childElement.height > 3) {
          if (childElement.x + childElement.width > viewportWidth) {
            childElement.width = Math.max(0, viewportWidth - childElement.x);
          }
          element.children.push(childElement);
        }
      }
    }

    // For <li> elements: add synthetic text child
    if (isListItemWithText && finalText) {
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
        opacity: 1,
        isPlaceholder: false,
        children: [],
      };
      element.children.push(syntheticTextChild);
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
 * Collect DIRECT text content from immediate TEXT_NODE children only
 * This avoids duplication: h2 gets "$0 ", span gets "/forever" separately
 *
 * For <h2>$0 <span>/forever</span></h2>:
 * - h2 collects "$0 " (direct TEXT_NODE only, preserving trailing space)
 * - span collects "/forever" (its own TEXT_NODE)
 */
function collectDirectText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
): string {
  const node = nodes[nodeIndex];
  if (!node) return "";

  const childIndices = childrenMap.get(nodeIndex) || [];
  const textParts: string[] = [];
  let hasElementChildren = false;

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    // Only collect TEXT_NODEs (nodeType === 3), not element children
    if (child && child.nodeType === 3 && child.textContent) {
      textParts.push(child.textContent);
    }
    // Track if there are element children (for whitespace preservation)
    if (child && child.nodeType === 1) {
      hasElementChildren = true;
    }
  }

  // Join text parts
  let result = textParts.join("");

  // Normalize: collapse multiple whitespace to single space, convert newlines
  result = result.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");

  // If there are element children (inline elements), preserve boundary whitespace
  // This keeps "$0 " as "$0 " when followed by <span>/forever</span>
  if (hasElementChildren) {
    // Only trim leading whitespace, keep trailing for inline element flow
    result = result.replace(/^\s+/, "");
  } else {
    // No element children - safe to trim both ends
    result = result.trim();
  }

  return result;
}

/**
 * Recursively collect ALL text from inline elements
 * Used for <li> elements that may have nested inline content (span, strong, em, etc.)
 */
function collectAllInlineText(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>,
): string {
  const node = nodes[nodeIndex];
  if (!node) return "";

  // TEXT_NODE - return its content
  if (node.nodeType === 3) {
    return node.textContent || "";
  }

  // ELEMENT_NODE - collect from children recursively
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
  childrenMap: Map<number, number[]>,
): boolean {
  const childIndices = childrenMap.get(nodeIndex) || [];

  for (const childIdx of childIndices) {
    const child = nodes[childIdx];
    // If has any ELEMENT_NODE child, it's not a leaf
    if (child && child.nodeType === 1) {
      return false;
    }
  }

  return true;
}

/**
 * Build element tree from snapshot nodes
 * NOTE: Text/color/font transformation moved to Plugin (import-time)
 */
function buildElementTree(
  nodes: ParsedSnapshotNode[],
  _nodesByBackendId: Map<number, ParsedSnapshotNode>,
  matchedStylesMap: Map<number, CDPMatchedStyles>,
  viewportWidth: number,
  cssVariablesMap: Map<string, string> = new Map(),
  bodyOriginalCSS: {
    background: string | null;
    backgroundImage: string | null;
    backgroundColor: string | null;
    selector: string;
  } | null = null,
  browserDpr: number = 1, // Browser devicePixelRatio for scaling bounds to CSS pixels
): ExtractedElement {
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
    depth: number,
  ): ExtractedElement | null {
    const MAX_DEPTH = 15;
    if (depth > MAX_DEPTH) return null;

    const tag = node.nodeName;

    // Skip non-element nodes
    if (node.nodeType !== 1) return null;

    // Skip unwanted tags
    if (SKIP_TAGS.includes(tag as (typeof SKIP_TAGS)[number])) return null;

    // Skip invisible nodes
    if (!node.bounds || node.bounds.width < 1 || node.bounds.height < 1)
      return null;

    // =========================================================================
    // SCALE BOUNDS BY devicePixelRatio to convert to CSS pixels
    // Browser zoom affects bounds (e.g., 90% zoom = bounds * 0.9)
    // We divide by browserDpr to get actual CSS pixel values
    // =========================================================================
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

    // =========================================================================
    // EXTRACT STYLES - Use matched styles for gradients, computed for rest
    // =========================================================================

    // Use CSS variables map for resolving var(--name) references
    const resolvedVariables = cssVariablesMap;

    // Get background values from matched styles (preserves original CSS)
    let backgroundImage: string | null = null;
    let backgroundShorthand: string | null = null;

    // SPECIAL CASE: For body element, prefer CSSOM-extracted original CSS
    // CDP returns partially computed values (circle→50% 50%), CSSOM gives original
    if (tag === "body" && bodyOriginalCSS) {
      backgroundShorthand = bodyOriginalCSS.background;
      backgroundImage = bodyOriginalCSS.backgroundImage;
    } else if (matchedStyles) {
      backgroundImage = extractPropertyFromMatchedRules(
        matchedStyles,
        "background-image",
      );
      backgroundShorthand = extractPropertyFromMatchedRules(
        matchedStyles,
        "background",
      );
    }

    // Get background-color from computed styles
    const computedBgColor = computedStyles["background-color"];
    const bgColorForFills =
      computedBgColor &&
      computedBgColor !== "transparent" &&
      computedBgColor !== "rgba(0, 0, 0, 0)"
        ? computedBgColor
        : null;

    // =========================================================================
    // NEW: Parse to Figma-ready fills[] (supports multiple backgrounds)
    // =========================================================================
    const fills = parseBackgroundToFills(
      backgroundShorthand || backgroundImage,
      bgColorForFills,
      resolvedVariables,
      { width, height }, // Pass element dimensions for gradient transform calculation
    );

    // Legacy fields (backward compatibility)
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

    // =========================================================================
    // NEW: Parse borders to Figma-ready strokes[]
    // =========================================================================
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

    // Legacy border fields
    const borderColor = parseColor(computedStyles["border-color"]);
    const borderWidth = parseInt(computedStyles["border-width"] || "0") || 0;
    const borderRadius = parseBorderRadius(
      computedStyles["border-radius"] || "0",
    );

    // =========================================================================
    // NEW: Parse box-shadow + backdrop-filter to Figma-ready effects[]
    // =========================================================================
    let boxShadow: string | null = null;
    if (matchedStyles) {
      const matchedShadow = extractPropertyFromMatchedRules(
        matchedStyles,
        "box-shadow",
      );
      if (matchedShadow && matchedShadow !== "none") {
        boxShadow = matchedShadow;
      }
    }
    if (!boxShadow && computedStyles["box-shadow"] !== "none") {
      boxShadow = computedStyles["box-shadow"] || null;
    }

    const shadowEffects = parseBoxShadowToEffects(boxShadow);

    // Backdrop filter (glassmorphism)
    let backdropFilter: string | null = null;
    if (matchedStyles) {
      backdropFilter = extractPropertyFromMatchedRules(
        matchedStyles,
        "backdrop-filter",
      );
    }
    if (!backdropFilter) {
      backdropFilter = computedStyles["backdrop-filter"] || null;
    }

    const blurEffects = parseBackdropFilterToEffects(backdropFilter);

    // Combine all effects
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

    // Layout Alignment (for Auto Layout)
    const justifyContent = computedStyles["justify-content"] || undefined;
    const alignItems = computedStyles["align-items"] || undefined;
    const flexWrap = computedStyles["flex-wrap"] || undefined;

    // Child-level flex properties
    // Figma only supports 0 or 1 for layoutGrow
    const flexGrowValue = parseFloat(computedStyles["flex-grow"] || "0") || 0;
    const layoutGrow: 0 | 1 | undefined = flexGrowValue > 0 ? 1 : undefined;
    const alignSelf = computedStyles["align-self"];
    const layoutAlign: "STRETCH" | "INHERIT" | undefined =
      alignSelf === "stretch" ? "STRETCH" : undefined;

    // Sizing mode extraction (for Figma layoutSizingHorizontal/Vertical)
    const layoutSizing = getLayoutSizing(
      computedStyles,
      flexGrowValue,
      alignSelf,
    );

    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    // CSS Positioning (for sticky headers, fixed elements, etc.)
    const cssPosition = computedStyles[
      "position"
    ] as ExtractedElement["position"];
    const position =
      cssPosition && cssPosition !== "static" ? cssPosition : undefined;
    const zIndexStr = computedStyles["z-index"];
    const zIndex =
      zIndexStr && zIndexStr !== "auto" ? parseInt(zIndexStr) : undefined;

    // Extract hover styles for interactive elements
    let hoverStyles: Record<string, string> | null = null;
    if (
      matchedStyles &&
      (tag === "button" || tag === "a" || node.attributes.role === "button")
    ) {
      hoverStyles = extractPseudoStyles(matchedStyles, "hover");
    }

    // =========================================================================
    // AGGREGATE TEXT - collect direct TEXT_NODE children only (avoid duplication)
    // =========================================================================
    let aggregatedText = node.textContent || "";

    // If no direct text, collect from children
    if (!aggregatedText) {
      // For <li> elements, collect ALL text including nested inline elements
      // This fixes the issue where <li>Some <strong>bold</strong> text</li> loses text
      if (tag === "li") {
        aggregatedText = collectAllInlineText(node.index, nodes, childrenMap);
      } else {
        // For other elements, only collect immediate TEXT_NODE children (avoid duplication)
        aggregatedText = collectDirectText(node.index, nodes, childrenMap);
      }
    }

    // Determine if this element should be treated as a text element
    // Either: in TEXT_TAGS OR is a leaf element (no element children) with text
    // NOTE: <a> tags are excluded - they remain frames with centered text children
    const isLeaf = isLeafElement(node.index, nodes, childrenMap);
    const shouldBeText = isText || (isLeaf && aggregatedText && tag !== "a");

    // Text transformation moved to Plugin (import-time)
    // Here we always capture original text
    const finalText = aggregatedText;

    // Determine element type for Figma
    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMedia) {
      elementType = "placeholder";
    } else if (shouldBeText && finalText) {
      elementType = "text";
    }

    // For <li> elements with text content, we'll create a synthetic text child
    // instead of putting textContent on the frame itself
    const isListItemWithText = tag === "li" && !!finalText;
    const frameTextContent = isListItemWithText ? "" : finalText;

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
      // Layout Alignment (for Auto Layout)
      justifyContent,
      alignItems,
      flexWrap,
      // Child-level flex properties
      layoutGrow,
      layoutAlign,
      layoutSizingHorizontal: layoutSizing.horizontal,
      layoutSizingVertical: layoutSizing.vertical,
      // NEW: Figma-ready arrays (multiple layers)
      fills,
      strokes,
      effects,
      // Legacy fields (backward compatibility)
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
      children: [],
      hoverStyles: hoverStyles || undefined,
    };

    // Process children
    const childIndices = childrenMap.get(node.index) || [];
    for (const childIdx of childIndices) {
      const childNode = nodes[childIdx];
      if (childNode) {
        // Skip children that are completely outside viewport (horizontal overflow)
        // Scale bounds.x by browserDpr before comparing with viewportWidth (CSS pixels)
        if (
          childNode.bounds &&
          childNode.bounds.x / browserDpr >= viewportWidth
        ) {
          continue;
        }

        const childElement = buildNode(childNode, x, y, depth + 1);
        if (childElement && childElement.width > 3 && childElement.height > 3) {
          // Clip child width if it extends beyond viewport
          if (childElement.x + childElement.width > viewportWidth) {
            childElement.width = Math.max(0, viewportWidth - childElement.x);
          }
          element.children.push(childElement);
        }
      }
    }

    // For <li> elements: add synthetic text child for the text content
    // This creates the structure: <li>(frame) -> [::before(text "•"), #text(text "actual content")]
    if (isListItemWithText && finalText) {
      // Calculate text position - after the bullet (::before pseudo-element)
      // The bullet is typically positioned at the left with padding
      const bulletWidth = padding.left || 16; // Bullet area

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
        textContent: finalText,
        opacity: 1,
        isPlaceholder: false,
        children: [],
      };

      element.children.push(syntheticTextChild);
    }

    return element;
  }

  const tree = buildNode(bodyNode, 0, 0, 0);
  if (!tree) {
    throw new Error("Failed to build element tree");
  }

  // Override body width to viewport width (fixes scrollWidth being larger)
  tree.width = viewportWidth;

  return tree;
}

/**
 * Get layout mode from computed styles
 * @param tag - HTML tag name for special handling (ul, ol, li)
 */
function getLayoutMode(
  computedStyles: Record<string, string>,
  tag?: string,
): "NONE" | "HORIZONTAL" | "VERTICAL" {
  const display = computedStyles.display;

  // Flexbox
  if (display === "flex" || display === "inline-flex") {
    const flexDirection = computedStyles["flex-direction"];
    return flexDirection === "column" || flexDirection === "column-reverse"
      ? "VERTICAL"
      : "HORIZONTAL";
  }

  // Grid
  if (display === "grid" || display === "inline-grid") {
    const gridAutoFlow = computedStyles["grid-auto-flow"];
    if (gridAutoFlow?.includes("column")) {
      return "HORIZONTAL";
    }

    const gridColumns = computedStyles["grid-template-columns"];
    if (gridColumns && gridColumns !== "none") {
      // auto-fit/auto-fill grids are responsive - treat as HORIZONTAL (wrap)
      if (
        gridColumns.includes("auto-fit") ||
        gridColumns.includes("auto-fill")
      ) {
        return "HORIZONTAL";
      }

      // Check if multiple columns by counting column values
      // Handle repeat(N, ...) - expand to count
      const normalizedColumns = gridColumns
        .replace(/repeat\s*\(\s*(\d+)\s*,/g, (_, count) => {
          return Array(parseInt(count)).fill("1fr").join(" ") + " ";
        })
        .trim();

      // Count distinct column definitions (px, fr, %, auto values)
      const columnCount = normalizedColumns
        .split(/\s+/)
        .filter((v) => v && v !== "none" && !v.includes("(")).length;

      if (columnCount > 1) {
        return "HORIZONTAL";
      }
    }

    return "VERTICAL";
  }

  // Inline elements
  if (display === "inline" || display === "inline-block") {
    return "HORIZONTAL";
  }

  // List containers should use VERTICAL auto layout
  if (tag === "ul" || tag === "ol") {
    return "VERTICAL";
  }

  // List items with default display should use HORIZONTAL for inline content
  if (display === "list-item") {
    return "HORIZONTAL";
  }

  return "NONE";
}

/**
 * Determine Figma sizing mode from CSS properties
 * Returns { horizontal, vertical } with values: FIXED | HUG | FILL
 *
 * Rules:
 * - flex-grow > 0 on primary axis → FILL
 * - align-self: stretch on counter axis → FILL (stretch)
 * - width/height: auto with content → HUG
 * - width/height: 100% or fill-available → FILL
 * - explicit px value → FIXED
 */
function getLayoutSizing(
  computedStyles: Record<string, string>,
  flexGrow: number,
  alignSelf: string | undefined,
): {
  horizontal: "FIXED" | "HUG" | "FILL" | undefined;
  vertical: "FIXED" | "HUG" | "FILL" | undefined;
} {
  const display = computedStyles.display;
  const flexDirection = computedStyles["flex-direction"];
  const width = computedStyles.width;
  const height = computedStyles.height;

  let horizontal: "FIXED" | "HUG" | "FILL" | undefined = undefined;
  let vertical: "FIXED" | "HUG" | "FILL" | undefined = undefined;

  // Determine if this is a flex/grid child (would support FILL)
  // We can't directly know parent's display, but flex-grow > 0 implies flex child
  const isFlexChild = flexGrow > 0 || alignSelf;

  // Check flex-grow for primary axis FILL
  if (flexGrow > 0) {
    // Determine which axis flex-grow applies to based on parent's flex-direction
    // If we're a flex child with flex-grow, we fill the primary axis
    // Default flex-direction is row, so horizontal is primary axis
    if (flexDirection === "column" || flexDirection === "column-reverse") {
      vertical = "FILL";
    } else {
      horizontal = "FILL";
    }
  }

  // Check align-self: stretch for counter axis FILL
  if (alignSelf === "stretch") {
    // Stretch applies to counter axis
    if (flexDirection === "column" || flexDirection === "column-reverse") {
      if (!horizontal) horizontal = "FILL";
    } else {
      if (!vertical) vertical = "FILL";
    }
  }

  // Check explicit width
  if (!horizontal) {
    if (
      width === "auto" ||
      width === "fit-content" ||
      width === "max-content" ||
      width === "min-content"
    ) {
      // Auto width with auto-layout parent would be HUG
      // But only if this element itself has auto-layout (to have children to hug)
      if (
        display === "flex" ||
        display === "inline-flex" ||
        display === "grid" ||
        display === "inline-grid"
      ) {
        horizontal = "HUG";
      }
    } else if (width === "100%" || width?.includes("fill-available")) {
      if (isFlexChild) {
        horizontal = "FILL";
      }
    }
    // explicit px value = FIXED (default, no need to set)
  }

  // Check explicit height
  if (!vertical) {
    if (
      height === "auto" ||
      height === "fit-content" ||
      height === "max-content" ||
      height === "min-content"
    ) {
      // Auto height typically means HUG content
      if (
        display === "flex" ||
        display === "inline-flex" ||
        display === "grid" ||
        display === "inline-grid"
      ) {
        vertical = "HUG";
      }
    } else if (height === "100%" || height?.includes("fill-available")) {
      if (isFlexChild) {
        vertical = "FILL";
      }
    }
    // explicit px value = FIXED (default, no need to set)
  }

  return { horizontal, vertical };
}

// NOTE: generateLoremIpsum and getSemanticPlaceholder moved to Plugin_Frontend
// (Import-time transformation instead of capture-time)

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
 * Auto-download capture result (used when popup is closed)
 * Downloads JSON file via chrome.downloads API
 */
async function autoDownloadResult(
  result: CaptureResult,
  tabId: number,
  captureType: "area" | "element",
): Promise<void> {
  try {
    // Get tab info for filename
    const tab = await chrome.tabs.get(tabId);
    const domain = getDomainFromUrl(tab.url || "");
    const timestamp = Date.now();
    const filename = `${domain}_${captureType}_${timestamp}_wireframe.json`;

    // Convert result to JSON blob URL
    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });

    // Create a data URL from the blob
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Download using chrome.downloads API
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false, // Auto-save to downloads folder
    });

    console.log("[W2W] Download initiated:", filename);
  } catch (error) {
    console.error("[W2W] Auto-download failed:", error);
    // Fallback: try to open in new tab for manual save
    try {
      const jsonString = JSON.stringify(result, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      await chrome.tabs.create({ url, active: true });
    } catch (e) {
      console.error("[W2W] Fallback also failed:", e);
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
