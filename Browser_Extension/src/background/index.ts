/**
 * Background Service Worker
 * Main entry point for the extension's background processes
 */

import { createCDPClient, CDPClient } from "./cdp/client";
import { getDocument, getBoxModel, getScrollDimensions } from "./cdp/dom";
import { getMatchedStylesForNode, getComputedStyleForNode, extractPropertyFromMatchedRules } from "./cdp/css";
import { extractFonts } from "./cdp/fonts";
import { extractAssets } from "./cdp/assets";
import type { ExtractedElement, CaptureResult, ExtensionMessage } from "@/shared/types";
import { SKIP_TAGS, TEXT_TAGS, MEDIA_TAGS, DEFAULT_SETTINGS, STORAGE_KEYS } from "@/shared/constants";
import { parseColor, isGradient, parseBorderRadius, generateId, getSemanticName } from "@/shared/utils";

// Current capture state
let isCapturing = false;
let _captureProgress = 0;

/**
 * Listen for messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "CAPTURE_PAGE") {
    handleCapturePage(message.tabId)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === "SEND_TO_BACKEND") {
    sendToBackend(message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse(settings));
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    updateSettings(message.settings).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "GET_CAPTURE_STATUS") {
    sendResponse({ isCapturing, progress: _captureProgress });
    return false;
  }

  return false;
});

/**
 * Handle page capture request
 */
async function handleCapturePage(tabId: number): Promise<CaptureResult> {
  if (isCapturing) {
    throw new Error("Capture already in progress");
  }

  isCapturing = true;
  _captureProgress = 0;
  let client: CDPClient | null = null;

  try {
    // Get tab info
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) throw new Error("Cannot capture this page");

    updateProgress(5, "Connecting to page...");

    // Create CDP client
    client = await createCDPClient(tabId);
    updateProgress(10, "Getting document structure...");

    // Get document tree
    const document = await getDocument(client);
    const bodyNodeId = findBodyNode(document);
    if (!bodyNodeId) throw new Error("Could not find body element");

    // Get scroll dimensions
    const dimensions = await getScrollDimensions(client);
    updateProgress(20, "Extracting styles...");

    // Extract element tree with styles
    const tree = await extractElementTree(client, bodyNodeId, 0, dimensions.width);
    updateProgress(70, "Extracting fonts...");

    // Extract fonts
    const fonts = await extractFonts(client);
    updateProgress(80, "Extracting assets...");

    // Extract assets
    const assets = await extractAssets(client);
    updateProgress(90, "Finalizing...");

    // Build result
    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      viewport: {
        width: dimensions.width,
        height: dimensions.height,
      },
      tree,
      fonts,
      assets,
      stylesheets: [], // TODO: Extract stylesheets if needed
    };

    updateProgress(100, "Complete!");
    return result;
  } finally {
    if (client) {
      await client.detach();
    }
    isCapturing = false;
  }
}

/**
 * Find body node in document tree
 */
function findBodyNode(node: { nodeId: number; nodeName: string; children?: Array<{ nodeId: number; nodeName: string; children?: unknown[] }> }): number | null {
  if (node.nodeName.toLowerCase() === "body") {
    return node.nodeId;
  }

  if (node.children) {
    for (const child of node.children) {
      const found = findBodyNode(child as { nodeId: number; nodeName: string; children?: Array<{ nodeId: number; nodeName: string; children?: unknown[] }> });
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extract element tree with CDP styles
 */
async function extractElementTree(
  client: CDPClient,
  nodeId: number,
  depth: number,
  viewportWidth: number
): Promise<ExtractedElement> {
  const MAX_DEPTH = 15;

  // Get box model
  const boxModel = await getBoxModel(client, nodeId);
  if (!boxModel) {
    // Return minimal placeholder
    return createPlaceholderElement(nodeId);
  }

  // Get matched styles (THE KEY DIFFERENCE!)
  const matchedStyles = await getMatchedStylesForNode(client, nodeId);
  const computedStyles = await getComputedStyleForNode(client, nodeId);

  // Extract position from content quad
  const [x, y] = boxModel.content;
  const width = boxModel.width;
  const height = boxModel.height;

  // Get tag and attributes
  const nodeInfo = await client.send<{ node: { nodeName: string; attributes?: string[] } }>(
    "DOM.describeNode",
    { nodeId, depth: 0 }
  );
  const tag = nodeInfo.node.nodeName.toLowerCase();
  const attrs = parseAttributes(nodeInfo.node.attributes || []);

  // Skip unwanted tags
  if (SKIP_TAGS.includes(tag as typeof SKIP_TAGS[number])) {
    return createPlaceholderElement(nodeId);
  }

  // Determine element type
  const isMedia = MEDIA_TAGS.includes(tag as typeof MEDIA_TAGS[number]) ||
    Boolean(computedStyles["background-image"] && computedStyles["background-image"].includes("url("));
  const isText = TEXT_TAGS.includes(tag as typeof TEXT_TAGS[number]);

  // Extract colors - USE MATCHED STYLES for gradients!
  let backgroundColor: string | null = null;
  let backgroundGradient: string | null = null;

  if (matchedStyles) {
    // First check for gradient in matched rules
    const bgImage = extractPropertyFromMatchedRules(matchedStyles, "background-image");
    if (bgImage && isGradient(bgImage)) {
      backgroundGradient = bgImage;
    }

    // Then get background color
    const bgColor = extractPropertyFromMatchedRules(matchedStyles, "background-color");
    backgroundColor = parseColor(bgColor);
  }

  // Fallback to computed
  if (!backgroundColor && !backgroundGradient) {
    backgroundColor = parseColor(computedStyles["background-color"]);
  }

  const textColor = parseColor(computedStyles.color);
  const borderColor = parseColor(computedStyles["border-color"]);

  // Extract text content
  let textContent = "";
  if (isText) {
    const textResult = await client.send<{ result: { value: string } }>(
      "Runtime.evaluate",
      {
        expression: `document.querySelector('[data-cdp-node-id="${nodeId}"]')?.textContent?.trim()?.substring(0, 200) || ''`,
        returnByValue: true,
      }
    ).catch(() => ({ result: { value: "" } }));
    textContent = textResult.result.value;
  }

  // Build element
  const element: ExtractedElement = {
    id: generateId(),
    tag,
    name: getSemanticName(tag, attrs),
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    layoutMode: getLayoutMode(computedStyles),
    itemSpacing: parseInt(computedStyles.gap) || 0,
    padding: {
      top: parseInt(computedStyles["padding-top"]) || 0,
      right: parseInt(computedStyles["padding-right"]) || 0,
      bottom: parseInt(computedStyles["padding-bottom"]) || 0,
      left: parseInt(computedStyles["padding-left"]) || 0,
    },
    backgroundColor,
    backgroundGradient,
    textColor,
    borderColor,
    borderWidth: parseInt(computedStyles["border-width"]) || 0,
    borderRadius: parseBorderRadius(computedStyles["border-radius"]),
    boxShadow: computedStyles["box-shadow"] !== "none" ? computedStyles["box-shadow"] : null,
    fontFamily: computedStyles["font-family"]?.split(",")[0]?.replace(/['"]/g, "") || "Inter",
    fontSize: parseInt(computedStyles["font-size"]) || 14,
    fontWeight: parseInt(computedStyles["font-weight"]) || 400,
    lineHeight: computedStyles["line-height"] || "normal",
    letterSpacing: parseFloat(computedStyles["letter-spacing"]) || 0,
    textAlign: computedStyles["text-align"] || "left",
    textContent,
    opacity: parseFloat(computedStyles.opacity) || 1,
    isPlaceholder: isMedia,
    children: [],
  };

  // Process children if not at max depth
  if (depth < MAX_DEPTH) {
    const childrenResult = await client.send<{ nodeIds: number[] }>(
      "DOM.querySelectorAll",
      { nodeId, selector: ":scope > *" }
    ).catch(() => ({ nodeIds: [] }));

    for (const childId of childrenResult.nodeIds) {
      const childElement = await extractElementTree(client, childId, depth + 1, viewportWidth);
      if (childElement.width > 3 && childElement.height > 3) {
        // Convert to relative coordinates
        childElement.x -= element.x;
        childElement.y -= element.y;
        element.children.push(childElement);
      }
    }
  }

  return element;
}

/**
 * Parse attributes array to object
 */
function parseAttributes(attrs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < attrs.length; i += 2) {
    result[attrs[i]] = attrs[i + 1];
  }
  return result;
}

/**
 * Get layout mode from styles
 */
function getLayoutMode(styles: Record<string, string>): "NONE" | "HORIZONTAL" | "VERTICAL" {
  const display = styles.display;
  if (display === "flex" || display === "inline-flex") {
    return styles["flex-direction"] === "column" ? "VERTICAL" : "HORIZONTAL";
  }
  if (display === "grid") {
    return "VERTICAL";
  }
  return "NONE";
}

/**
 * Create placeholder element for skipped nodes
 */
function createPlaceholderElement(nodeId: number): ExtractedElement {
  return {
    id: `skip-${nodeId}`,
    tag: "div",
    name: "Skipped",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: null,
    borderColor: null,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    boxShadow: null,
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "normal",
    letterSpacing: 0,
    textAlign: "left",
    textContent: "",
    opacity: 1,
    isPlaceholder: false,
    children: [],
  };
}

/**
 * Update capture progress
 */
function updateProgress(progress: number, status: string) {
  _captureProgress = progress;
  chrome.runtime.sendMessage({
    type: "CAPTURE_PROGRESS",
    progress,
    status,
  }).catch(() => {
    // Popup might be closed
  });
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

// Log extension startup
console.log("Web2Wireframe Extension loaded");
