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
    // Auto-scroll failed, scroll to top
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

    // =========================================================================
    // SET VIEWPORT EMULATION - Critical for accurate bounds!
    // This forces DevTools responsive mode with exact dimensions
    // =========================================================================
    const targetViewport = options.viewport || 1440;
    const targetHeight = 900;
    updateProgress(8, `Setting viewport to ${targetViewport}px...`);

    // Full device metrics override - simulates DevTools Device Mode
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: targetViewport,
      height: targetHeight,
      deviceScaleFactor: 1,
      mobile: targetViewport <= 768,
      // Screen dimensions - critical for accurate bounds!
      screenWidth: targetViewport,
      screenHeight: targetHeight,
      positionX: 0,
      positionY: 0,
      screenOrientation: { angle: 0, type: "landscapePrimary" },
    });

    // Force page reload to apply viewport changes properly
    updateProgress(9, "Reloading page with new viewport...");
    await client.send("Page.reload", { ignoreCache: false });

    // Wait for page load
    await new Promise(resolve => setTimeout(resolve, 1500));

    updateProgress(10, "Scrolling for lazy content...");
    await autoScrollPage(client);

    updateProgress(15, "Getting dimensions...");
    const dimensions = await getScrollDimensions(client);

    // =========================================================================
    // STEP 1: DOMSnapshot.captureSnapshot - ONE call for entire page!
    // =========================================================================
    updateProgress(20, "Capturing page snapshot...");

    const snapshot = await captureSnapshot(client);

    updateProgress(35, "Parsing snapshot data...");
    const { nodes, nodesByBackendId } = parseSnapshot(snapshot);

    // =========================================================================
    // STEP 2: Find nodes that NEED CSS.getMatchedStylesForNode
    // (only gradients, CSS variables, hover states - not all nodes!)
    // =========================================================================
    updateProgress(40, "Finding nodes with gradients/variables...");
    const nodesNeedingMatched = findNodesNeedingMatchedStyles(nodes);

    // =========================================================================
    // STEP 3: Get matched styles ONLY for those specific nodes
    // =========================================================================
    updateProgress(45, `Getting matched styles for ${nodesNeedingMatched.length} nodes...`);

    // Resolve backendNodeIds to nodeIds
    const backendIds = nodesNeedingMatched.map((n) => n.backendNodeId);

    // First, we need to get the DOM document to have nodeIds available
    await getDocument(client, -1, true);

    const nodeIdMap = await resolveNodeIds(client, backendIds);

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

    // =========================================================================
    // STEP 4: Extract CSS variables BEFORE building tree (needed for parsing)
    // =========================================================================
    updateProgress(60, "Extracting CSS variables...");
    const rawCSSVariables = await extractCSSVariables(client);

    // Build a Map for variable resolution during tree building
    const cssVariablesMap = new Map<string, string>();
    for (const v of rawCSSVariables) {
      cssVariablesMap.set(v.name, v.value);
    }

    // Convert to ExtractedCSSVariable format and categorize
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    // =========================================================================
    // STEP 4.5: Extract ORIGINAL CSS for body element via CSSOM
    // CDP returns partially computed values, CSSOM gives us the original CSS
    // This is critical for correct gradient parsing (circle, transparent, etc.)
    // =========================================================================
    updateProgress(65, "Extracting original CSS from CSSOM...");
    const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

    updateProgress(70, "Building element tree...");

    // Use selected viewport width for tree building (not scrollWidth which may differ)
    const targetWidth = options.viewport || 1440;

    // =========================================================================
    // STEP 5: Build element tree from snapshot + matched styles + CSS variables
    // =========================================================================
    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      matchedStylesMap,
      targetWidth,  // Use target viewport, not dimensions.width (scrollWidth)
      options,
      cssVariablesMap,
      bodyOriginalCSS  // Pass CSSOM-extracted body background
    );

    updateProgress(85, "Extracting fonts...");
    const fonts =
      options.fontMode === "website" ? await extractFonts(client) : [];

    updateProgress(90, "Finalizing...");

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
    return result;
  } finally {
    if (client) {
      // Clear viewport emulation before destroying
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
  childrenMap: Map<number, number[]>
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
  childrenMap: Map<number, number[]>
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
  result = result.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return result;
}

/**
 * Check if element is a "leaf" text element (has no element children)
 */
function isLeafElement(
  nodeIndex: number,
  nodes: ParsedSnapshotNode[],
  childrenMap: Map<number, number[]>
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
 */
function buildElementTree(
  nodes: ParsedSnapshotNode[],
  _nodesByBackendId: Map<number, ParsedSnapshotNode>,
  matchedStylesMap: Map<number, CDPMatchedStyles>,
  viewportWidth: number,
  options: CaptureOptions,
  cssVariablesMap: Map<string, string> = new Map(),
  bodyOriginalCSS: { background: string | null; backgroundImage: string | null; backgroundColor: string | null; selector: string } | null = null
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

    // Position from BOUNDS (absolute document coordinates)
    const { x, y } = node.bounds;
    const computedStyles = node.computedStyles;

    // =========================================================================
    // USE CSS COMPUTED STYLES FOR DIMENSIONS (not BOUNDS!)
    // BOUNDS can be ~90% of actual CSS dimensions (visual vs layout bounds)
    // CSS computed styles give us the real CSS pixel values
    // =========================================================================
    const cssWidth = parseFloat(computedStyles["width"]) || node.bounds.width;
    const cssHeight = parseFloat(computedStyles["height"]) || node.bounds.height;
    const width = cssWidth;
    const height = cssHeight;
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

    // Use CSS variables map for resolving var(--name) references
    const resolvedVariables = cssVariablesMap;

    // Get background values from matched styles (preserves original CSS)
    let backgroundImage: string | null = null;
    let backgroundShorthand: string | null = null;

    // SPECIAL CASE: For body element, prefer CSSOM-extracted original CSS
    // CDP returns partially computed values (circle→50% 50%), CSSOM gives original
    if (tag === 'body' && bodyOriginalCSS) {
      backgroundShorthand = bodyOriginalCSS.background;
      backgroundImage = bodyOriginalCSS.backgroundImage;
    } else if (matchedStyles) {
      backgroundImage = extractPropertyFromMatchedRules(matchedStyles, "background-image");
      backgroundShorthand = extractPropertyFromMatchedRules(matchedStyles, "background");
    }

    // Get background-color from computed styles
    const computedBgColor = computedStyles["background-color"];
    const bgColorForFills = (computedBgColor && computedBgColor !== "transparent" && computedBgColor !== "rgba(0, 0, 0, 0)")
      ? computedBgColor
      : null;

    // =========================================================================
    // NEW: Parse to Figma-ready fills[] (supports multiple backgrounds)
    // =========================================================================
    const fills = parseBackgroundToFills(
      backgroundShorthand || backgroundImage,
      bgColorForFills,
      resolvedVariables,
      { width, height }  // Pass element dimensions for gradient transform calculation
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
      resolvedVariables
    );

    // Legacy border fields
    const borderColor = parseColor(computedStyles["border-color"]);
    const borderWidth = parseInt(computedStyles["border-width"] || "0") || 0;
    const borderRadius = parseBorderRadius(
      computedStyles["border-radius"] || "0"
    );

    // =========================================================================
    // NEW: Parse box-shadow + backdrop-filter to Figma-ready effects[]
    // =========================================================================
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

    // Backdrop filter (glassmorphism)
    let backdropFilter: string | null = null;
    if (matchedStyles) {
      backdropFilter = extractPropertyFromMatchedRules(matchedStyles, "backdrop-filter");
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
    const layoutSizing = getLayoutSizing(computedStyles, flexGrowValue, alignSelf);

    const opacity = parseFloat(computedStyles.opacity || "1") || 1;

    // CSS Positioning (for sticky headers, fixed elements, etc.)
    const cssPosition = computedStyles["position"] as ExtractedElement["position"];
    const position = (cssPosition && cssPosition !== "static") ? cssPosition : undefined;
    const zIndexStr = computedStyles["z-index"];
    const zIndex = zIndexStr && zIndexStr !== "auto" ? parseInt(zIndexStr) : undefined;

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

    // DEBUG: Log <li> element processing
    if (tag === "li") {
      const childIndices = childrenMap.get(node.index) || [];
      console.log(`[DEBUG LI] Processing <li>`, {
        nodeIndex: node.index,
        textContent: node.textContent,
        aggregatedText,
        childCount: childIndices.length,
        children: childIndices.map(idx => {
          const child = nodes[idx];
          return {
            index: idx,
            nodeType: child?.nodeType,
            nodeName: child?.nodeName,
            textContent: child?.textContent?.substring(0, 50)
          };
        })
      });
    }

    // Determine if this element should be treated as a text element
    // Either: in TEXT_TAGS OR is a leaf element (no element children) with text
    const isLeaf = isLeafElement(node.index, nodes, childrenMap);
    const shouldBeText = isText || (isLeaf && aggregatedText);

    // DEBUG: Log text determination for <li> children
    if (tag === "li" || (node.parentIndex >= 0 && nodes[node.parentIndex]?.nodeName === "li")) {
      console.log(`[DEBUG LI-TEXT] Element: <${tag}>`, {
        isText,
        isLeaf,
        aggregatedText: aggregatedText?.substring(0, 50),
        shouldBeText,
        TEXT_TAGS_includes: TEXT_TAGS.includes(tag as typeof TEXT_TAGS[number])
      });
    }

    // =========================================================================
    // APPLY TEXT MODE TRANSFORMATION
    // =========================================================================
    // Li elements need text processing but remain frames (they have bullet children)
    // So we use shouldProcessText for transformation, but shouldBeText for type determination
    const shouldProcessText = shouldBeText || (tag === "li" && !!aggregatedText);

    let finalText = aggregatedText;

    if (aggregatedText && shouldProcessText) {
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
    } else if (shouldBeText && finalText) {
      elementType = "text";
    }

    // DEBUG: Log final element type for <li> and its children
    if (tag === "li" || (node.parentIndex >= 0 && nodes[node.parentIndex]?.nodeName === "li")) {
      console.log(`[DEBUG LI-RESULT] <${tag}> → type="${elementType}"`, {
        shouldBeText,
        finalText: finalText?.substring(0, 50),
        isMedia,
        parentTag: node.parentIndex >= 0 ? nodes[node.parentIndex]?.nodeName : null
      });
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

    // DEBUG: Log element dimensions for testing
    const className = node.attributes["class"] || "";
    if (
      className.includes("brandText") ||
      className.includes("columns") ||
      tag === "h4" ||
      (tag === "a" && finalText) ||
      (tag === "strong" && finalText)
    ) {
      console.log(`[DEBUG] ${tag}.${className}: "${finalText?.substring(0, 20) || ""}" | w: ${width} h: ${height} | x: ${x - parentX} y: ${y - parentY}`);
    }

    // Process children
    const childIndices = childrenMap.get(node.index) || [];
    for (const childIdx of childIndices) {
      const childNode = nodes[childIdx];
      if (childNode) {
        // Skip children that are completely outside viewport (horizontal overflow)
        if (childNode.bounds && childNode.bounds.x >= viewportWidth) {
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

      console.log(`[DEBUG LI-SYNTHETIC] Created synthetic text child for <li>`, {
        parentId: element.id,
        textContent: finalText,
        childCount: element.children.length
      });
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
  tag?: string
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
      if (gridColumns.includes("auto-fit") || gridColumns.includes("auto-fill")) {
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
  alignSelf: string | undefined
): { horizontal: "FIXED" | "HUG" | "FILL" | undefined; vertical: "FIXED" | "HUG" | "FILL" | undefined } {
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
    if (width === "auto" || width === "fit-content" || width === "max-content" || width === "min-content") {
      // Auto width with auto-layout parent would be HUG
      // But only if this element itself has auto-layout (to have children to hug)
      if (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid") {
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
    if (height === "auto" || height === "fit-content" || height === "max-content" || height === "min-content") {
      // Auto height typically means HUG content
      if (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid") {
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

// Extension loaded
