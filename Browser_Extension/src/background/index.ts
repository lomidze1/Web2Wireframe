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
  CaptureOptions,
  ExtensionMessage,
  CDPMatchedStyles,
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

// Media tags that become placeholders
const MEDIA_TAGS = ["img", "video", "iframe", "picture", "canvas"] as const;

// Current capture state
let isCapturing = false;
let _captureProgress = 0;

/**
 * Listen for messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "CAPTURE_PAGE") {
      handleCapturePage(message.tabId, message.options)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true; // Keep channel open for async response
    }

    if (message.type === "SEND_TO_BACKEND") {
      sendToBackend(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;
    }

    if (message.type === "GET_SETTINGS") {
      getSettings().then((settings) => sendResponse(settings));
      return true;
    }

    if (message.type === "UPDATE_SETTINGS") {
      updateSettings(message.settings).then(() =>
        sendResponse({ success: true })
      );
      return true;
    }

    if (message.type === "GET_CAPTURE_STATUS") {
      sendResponse({ isCapturing, progress: _captureProgress });
      return false;
    }

    return false;
  }
);

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
    console.warn("Auto-scroll failed:", e);
    await client
      .send("Runtime.evaluate", { expression: "window.scrollTo(0, 0)" })
      .catch(() => {});
  }
}

/**
 * Handle page capture request
 *
 * NEW APPROACH:
 * 1. DOMSnapshot.captureSnapshot - bulk extraction (ONE call)
 * 2. CSS.getMatchedStylesForNode - only for gradient/variable nodes
 */
async function handleCapturePage(
  tabId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS
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

    updateProgress(10, "Scrolling for lazy content...");
    await autoScrollPage(client);

    updateProgress(15, "Getting dimensions...");
    const dimensions = await getScrollDimensions(client);

    // =========================================================================
    // STEP 1: DOMSnapshot.captureSnapshot - ONE call for entire page!
    // =========================================================================
    updateProgress(20, "Capturing page snapshot...");
    console.log("[Capture] Using DOMSnapshot.captureSnapshot (efficient bulk extraction)");

    const snapshot = await captureSnapshot(client);
    console.log("[Capture] Snapshot captured:", {
      documents: snapshot.documents.length,
      strings: snapshot.strings.length,
    });

    updateProgress(35, "Parsing snapshot data...");
    const { nodes, nodesByBackendId } = parseSnapshot(snapshot);
    console.log("[Capture] Parsed nodes:", nodes.length);

    // =========================================================================
    // STEP 2: Find nodes that NEED CSS.getMatchedStylesForNode
    // (only gradients, CSS variables, hover states - not all nodes!)
    // =========================================================================
    updateProgress(40, "Finding nodes with gradients/variables...");
    const nodesNeedingMatched = findNodesNeedingMatchedStyles(nodes);
    console.log(
      "[Capture] Nodes needing matched styles:",
      nodesNeedingMatched.length,
      "(out of",
      nodes.length,
      ")"
    );

    // =========================================================================
    // STEP 3: Get matched styles ONLY for those specific nodes
    // =========================================================================
    updateProgress(45, `Getting matched styles for ${nodesNeedingMatched.length} nodes...`);

    // Resolve backendNodeIds to nodeIds
    const backendIds = nodesNeedingMatched.map((n) => n.backendNodeId);

    // First, we need to get the DOM document to have nodeIds available
    await getDocument(client, -1, true);

    const nodeIdMap = await resolveNodeIds(client, backendIds);
    console.log("[Capture] Resolved nodeIds:", nodeIdMap.size);

    // Get matched styles for nodes that need them
    const matchedStylesMap = new Map<number, CDPMatchedStyles>();
    let matchedCount = 0;

    for (const node of nodesNeedingMatched) {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (nodeId) {
        const matched = await getMatchedStylesForNode(client, nodeId);
        if (matched) {
          matchedStylesMap.set(node.backendNodeId, matched);
          matchedCount++;
        }
      }
    }
    console.log("[Capture] Got matched styles for:", matchedCount, "nodes");

    updateProgress(60, "Building element tree...");

    // =========================================================================
    // STEP 4: Build element tree from snapshot + matched styles
    // =========================================================================
    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      matchedStylesMap,
      dimensions.width,
      options
    );
    console.log("[Capture] Tree built:", {
      tag: tree.tag,
      children: tree.children.length,
    });

    updateProgress(75, "Extracting fonts...");
    const fonts =
      options.fontMode === "website" ? await extractFonts(client) : [];

    updateProgress(80, "Extracting CSS variables...");
    const rawCSSVariables = await extractCSSVariables(client);
    console.log("[Capture] Extracted CSS variables:", rawCSSVariables.length);

    // Convert to ExtractedCSSVariable format and categorize
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(90, "Finalizing...");

    // Use selected viewport width, not actual page width (which may have scrollbar offset)
    const targetWidth = options.viewport || 1440;

    // Scale tree root to match selected viewport
    tree.width = targetWidth;

    const result: CaptureResult = {
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
      viewport: {
        width: targetWidth,
        height: dimensions.height,
      },
      options,
      tree,
      fonts,
      assets: [],
      stylesheets: [],
      cssVariables,
    };

    updateProgress(100, "Complete!");
    console.log("[Capture] Done! Used efficient snapshot approach.");
    return result;
  } finally {
    if (client) {
      await client.destroy();
    }
    isCapturing = false;
  }
}

/**
 * Build element tree from snapshot nodes
 */
function buildElementTree(
  nodes: ParsedSnapshotNode[],
  _nodesByBackendId: Map<number, ParsedSnapshotNode>,
  matchedStylesMap: Map<number, CDPMatchedStyles>,
  _viewportWidth: number,
  options: CaptureOptions
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
    depth: number
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

    const { x, y, width, height } = node.bounds;
    const computedStyles = node.computedStyles;
    const matchedStyles = matchedStylesMap.get(node.backendNodeId) || null;

    // Determine element type
    const isMedia =
      MEDIA_TAGS.includes(tag as (typeof MEDIA_TAGS)[number]) ||
      Boolean(
        computedStyles["background-image"]?.includes("url(")
      );
    const isText = TEXT_TAGS.includes(tag as (typeof TEXT_TAGS)[number]);

    // =========================================================================
    // EXTRACT STYLES - Use matched styles for gradients, computed for rest
    // =========================================================================

    // Background - check matched styles for gradients first
    let backgroundColor: string | null = null;
    let backgroundGradient: string | null = null;

    if (matchedStyles) {
      // Check background-image for gradients (from matched styles - preserves original!)
      const bgImage = extractPropertyFromMatchedRules(
        matchedStyles,
        "background-image"
      );
      if (bgImage && isGradient(bgImage)) {
        backgroundGradient = bgImage;
      }

      // Check shorthand 'background'
      const bgShorthand = extractPropertyFromMatchedRules(
        matchedStyles,
        "background"
      );
      if (bgShorthand && isGradient(bgShorthand)) {
        backgroundGradient = bgShorthand;
      }
    }

    // Fallback to computed styles for solid colors
    if (!backgroundColor && !backgroundGradient) {
      const computedBg = computedStyles["background-color"];
      if (computedBg && computedBg !== "transparent" && computedBg !== "rgba(0, 0, 0, 0)") {
        backgroundColor = parseColor(computedBg);
      }
    }

    // Text color
    const textColor = parseColor(computedStyles["color"]);

    // Border
    const borderColor = parseColor(computedStyles["border-color"]);
    const borderWidth = parseInt(computedStyles["border-width"] || "0") || 0;
    const borderRadius = parseBorderRadius(
      computedStyles["border-radius"] || "0"
    );

    // Box shadow - prefer matched styles
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

    // Typography
    const fontFamily = (computedStyles["font-family"] || "Inter")
      .split(",")[0]
      ?.replace(/['"]/g, "")
      .trim();
    const fontSize = parseInt(computedStyles["font-size"] || "14") || 14;
    const fontWeight =
      parseInt(computedStyles["font-weight"] || "400") || 400;
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

    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    // Extract hover styles for interactive elements
    let hoverStyles: Record<string, string> | null = null;
    if (
      matchedStyles &&
      (tag === "button" || tag === "a" || node.attributes.role === "button")
    ) {
      hoverStyles = extractPseudoStyles(matchedStyles, "hover");
    }

    // =========================================================================
    // AGGREGATE TEXT FROM CHILD TEXT_NODEs
    // =========================================================================
    let aggregatedText = node.textContent || "";

    // If this element doesn't have direct text, collect from child TEXT_NODEs
    if (!aggregatedText && isText) {
      const childIndices = childrenMap.get(node.index) || [];
      const textParts: string[] = [];

      for (const childIdx of childIndices) {
        const childNode = nodes[childIdx];
        // TEXT_NODE has nodeType === 3
        if (childNode && childNode.nodeType === 3 && childNode.textContent) {
          const trimmed = childNode.textContent.trim();
          if (trimmed) {
            textParts.push(trimmed);
          }
        }
      }

      if (textParts.length > 0) {
        aggregatedText = textParts.join(" ");
      }
    }

    // =========================================================================
    // APPLY TEXT MODE TRANSFORMATION
    // =========================================================================
    let finalText = aggregatedText;

    if (aggregatedText && isText) {
      switch (options.textMode) {
        case "website":
          // Keep original text as-is
          finalText = aggregatedText;
          break;

        case "lorem":
          // Generate lorem ipsum with same word count
          finalText = generateLoremIpsum(aggregatedText);
          break;

        case "semantic":
          // Generate semantic placeholder based on tag
          finalText = getSemanticPlaceholder(tag, aggregatedText.length);
          break;

        default:
          finalText = aggregatedText;
      }
    }

    // Determine element type for Figma
    let elementType: "frame" | "text" | "placeholder" = "frame";
    if (isMedia) {
      elementType = "placeholder";
    } else if (isText && finalText) {
      elementType = "text";
    }

    // Build element
    const element: ExtractedElement = {
      id: generateId(),
      type: elementType,
      tag,
      name: getSemanticName(tag, node.attributes),
      x: Math.round(x - parentX),
      y: Math.round(y - parentY),
      width: Math.round(width),
      height: Math.round(height),
      layoutMode: getLayoutMode(computedStyles),
      itemSpacing,
      padding,
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
      textContent: finalText,
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
        const childElement = buildNode(childNode, x, y, depth + 1);
        if (childElement && childElement.width > 3 && childElement.height > 3) {
          element.children.push(childElement);
        }
      }
    }

    return element;
  }

  const tree = buildNode(bodyNode, 0, 0, 0);
  if (!tree) {
    throw new Error("Failed to build element tree");
  }

  return tree;
}

/**
 * Get layout mode from computed styles
 */
function getLayoutMode(
  computedStyles: Record<string, string>
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
      // Check if multiple columns
      const normalizedColumns = gridColumns
        .replace(/repeat\s*\(\s*(\d+)\s*,/g, (_, count) => {
          return Array(parseInt(count)).fill("1fr").join(" ") + " ";
        })
        .trim();

      const columnCount = normalizedColumns
        .split(/\s+/)
        .filter((v) => v && v !== "none").length;

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

  return "NONE";
}

/**
 * Generate lorem ipsum text with the same number of words as original
 * Also tries to match word lengths for better visual fidelity
 */
function generateLoremIpsum(originalText: string): string {
  // Lorem ipsum words grouped by length
  const loremByLength: Record<number, string[]> = {
    1: ["a", "e", "i", "o", "u"],
    2: ["ut", "et", "ad", "ex", "ea", "id", "in", "do"],
    3: ["sed", "sit", "qui", "non", "est"],
    4: ["amet", "enim", "quis", "duis", "aute", "sunt", "esse", "anim", "nisi"],
    5: ["lorem", "ipsum", "dolor", "magna", "minim", "irure", "velit", "culpa", "nulla"],
    6: ["tempor", "labore", "dolore", "veniam", "fugiat", "mollit", "commodo"],
    7: ["aliqua", "nostrud", "laboris", "aliquip", "ullamco", "officia", "laborum", "cillum", "sint"],
    8: ["eiusmod", "proident", "pariatur", "deserunt", "occaecat"],
    9: ["adipiscing", "excepteur", "cupidatat", "consequat"],
    10: ["consectetur", "incididunt", "voluptate"],
    11: ["reprehenderit", "exercitation"],
  };

  // Fallback words for any length
  const fallbackWords = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore"
  ];

  // Split original text into words
  const originalWords = originalText.trim().split(/\s+/).filter(w => w.length > 0);

  if (originalWords.length === 0) {
    return "";
  }

  // Generate lorem ipsum with same word count, trying to match lengths
  const resultWords: string[] = [];
  let fallbackIndex = 0;

  for (let i = 0; i < originalWords.length; i++) {
    const targetLength = originalWords[i].length;

    // Find words of matching length, or closest available
    let candidates = loremByLength[targetLength];

    // If no exact match, try nearby lengths
    if (!candidates || candidates.length === 0) {
      for (let diff = 1; diff <= 3; diff++) {
        candidates = loremByLength[targetLength - diff] || loremByLength[targetLength + diff];
        if (candidates && candidates.length > 0) break;
      }
    }

    // If still no match, use fallback
    if (!candidates || candidates.length === 0) {
      candidates = fallbackWords;
    }

    // Pick a word (cycle through to add variety)
    const word = candidates[(i + fallbackIndex) % candidates.length];
    resultWords.push(word);
    fallbackIndex++;
  }

  // Capitalize first letter
  if (resultWords.length > 0) {
    resultWords[0] = resultWords[0].charAt(0).toUpperCase() + resultWords[0].slice(1);
  }

  return resultWords.join(" ");
}

/**
 * Get semantic placeholder text based on HTML tag
 */
function getSemanticPlaceholder(tag: string, _charCount: number): string {
  const semanticNames: Record<string, string> = {
    // Headings
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
    h4: "Heading 4",
    h5: "Heading 5",
    h6: "Heading 6",
    // Text elements
    p: "Paragraph",
    span: "Text",
    // Links
    a: "Link",
    // Lists
    li: "List Item",
    // Labels & Buttons
    label: "Label",
    button: "Button",
    // Table
    td: "Table Cell",
    th: "Table Header",
    // Emphasis
    strong: "Bold Text",
    b: "Bold Text",
    em: "Italic Text",
    i: "Italic Text",
    small: "Small Text",
    mark: "Highlighted",
    sub: "Subscript",
    sup: "Superscript",
    // Form elements
    input: "Input",
    textarea: "Text Area",
    select: "Select",
    option: "Option",
  };

  return semanticNames[tag.toLowerCase()] || "Text";
}

/**
 * Categorize a CSS variable based on its name and value
 */
function categorizeCSSVariable(name: string, value: string): string {
  const nameLower = name.toLowerCase();

  // Check name patterns first
  if (nameLower.includes("color") || nameLower.includes("bg") || nameLower.includes("text")) {
    return "color";
  }
  if (nameLower.includes("font") || nameLower.includes("text-size") || nameLower.includes("line-height")) {
    return "typography";
  }
  if (nameLower.includes("spacing") || nameLower.includes("gap") || nameLower.includes("padding") || nameLower.includes("margin")) {
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
  if (valueLower.startsWith("#") || valueLower.startsWith("rgb") || valueLower.startsWith("hsl")) {
    return "color";
  }
  if (valueLower.includes("px") || valueLower.includes("rem") || valueLower.includes("em")) {
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
console.log("Web2Wireframe Extension loaded (using efficient DOMSnapshot approach)");
