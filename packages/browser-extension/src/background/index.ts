/**
 * Background Service Worker
 * Main entry point for the extension's background processes
 *
 * NEW EFFICIENT APPROACH:
 * 1. DOMSnapshot.captureSnapshot - ONE call for entire page (layout + computed styles)
 * 2. CSS.getMatchedStylesForNode - ONLY for nodes with gradients/variables (10-20 calls, not 500+)
 *
 * Uses shared-extraction package for unified extraction logic.
 *
 * Note on `eslint-disable no-console`: the `[W2W]`-tagged capture-flow
 * tracing in this file is the primary tool for diagnosing CDP timing /
 * resource-load issues against new sites. It's silenced in production
 * builds via `gateConsoleInProduction()` (see ../shared/consoleGating).
 * The lint rule would otherwise flag every line, drowning out new
 * accidental debug logs we DO want to catch elsewhere.
 */
/* eslint-disable no-console */

import { gateConsoleInProduction } from "../shared/consoleGating";

// Service worker is its own JS context — gate console here too.
gateConsoleInProduction();

// Browser-specific CDP client (local - uses chrome.debugger)
import { createCDPClient, CDPClient } from "./cdp/client";
import { getDocument } from "./cdp/dom";
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
  type CSSOMBackground,
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
  type CaptureOptions,
  type CDPMatchedStyles,
  DEFAULT_CAPTURE_OPTIONS,
  // W2W content script types
  type W2WCaptureResult,
  type W2WMultiCaptureResult,
  type W2WFrameCapture,
  type W2WFrameNode,
  type W2WNode,
  type W2WDocMeta,
  type W2WAssetEntry,
  w2wFindHoverCandidates,
  attachHoverToDescendants,
} from "@w2w/shared";

// Browser extension-specific types (local)
import type { ExtensionMessage, SelectionBounds } from "@/shared/types";
import { analyzeColorsFromTree } from "@/shared/utils";

// Module-level state (extracted from monolithic index.ts).
import { state, updateProgress } from "./state";
import { getSettings, updateSettings } from "./utils/settings";
import { autoDownloadResult, getDomainFromUrl, sendToBackend } from "./utils/download";
import { createEmptyElement, categorizeCSSVariable } from "./utils/misc";
import {
  startInspectMode,
  cancelInspectMode,
  registerCaptureByBackendId,
} from "./inspect";
import { handleCapturePage, autoScrollPage } from "./capture/legacy";

// Wire the element-capture callback for inspect mode. Registered eagerly
// so the first user click after install lands without races.
registerCaptureByBackendId((tabId, backendNodeId, options, client) =>
  handleCaptureElementByBackendId(tabId, backendNodeId, options, client),
);

// Current capture state — see ./state.ts for the canonical definitions.
// We read/write through `state.*` directly so the same module-scope
// values stay reachable from the handlers extracted in follow-up phases.

/**
 * Listen for messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    // Trust boundary: only handle messages from this extension's own
    // contexts (popup, options, content scripts). A message from any other
    // extension — or a web page — must never drive CDP attach or downloads.
    if (sender.id !== chrome.runtime.id) {
      return false;
    }

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

    // W2W content script capture
    if (message.type === "CAPTURE_PAGE_W2W") {
      console.log("[W2W] CAPTURE_PAGE_W2W received, tabId:", message.tabId);
      handleCapturePageW2W(message.tabId, message.options)
        .then(async (result) => {
          const totalNodes = result.frames.reduce(
            (sum, f) => sum + w2wCountNodes(f.frame),
            0,
          );
          console.log(
            `[W2W] W2W capture complete: ${result.frames.length} viewport(s), ${totalNodes} total nodes`,
          );
          // Auto-download combined JSON — one file with all viewports
          try {
            const jsonString = JSON.stringify(result, null, 2);
            const domain = getDomainFromUrl(result.url || "");
            const widthLabel = result.frames.map((f) => f.width).join("_");
            const filename = `${domain}_${widthLabel}_w2w.json`;
            console.log(`[W2W] JSON size: ${(jsonString.length / 1024 / 1024).toFixed(1)} MB`);

            const jsonBlob = new Blob([jsonString], { type: "application/json" });
            const jsonReader = new FileReader();
            const jsonDataUrl = await new Promise<string>((resolve, reject) => {
              jsonReader.onload = () => resolve(jsonReader.result as string);
              jsonReader.onerror = reject;
              jsonReader.readAsDataURL(jsonBlob);
            });
            await chrome.downloads.download({ url: jsonDataUrl, filename, saveAs: false });
          } catch (e) {
            console.error("[W2W] Auto-download failed:", e);
          }
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error("[W2W] Capture failed:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
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
      sendResponse({ isCapturing: state.isCapturing, progress: state.captureProgress });
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

// =============================================================================
// W2W CONTENT SCRIPT CAPTURE
// =============================================================================

/**
 * W2W page capture using content script DOM traversal.
 *
 * Flow:
 * 1. Viewport setup (emulation, scroll, scrollbar compensation)
 * 2. Content script extracts DOM → W2WFrameNode tree (raw CSS)
 * 3. CDP: platform fonts (CSS.getPlatformFontsForNode)
 * 4. CDP: assets from browser cache (Page.getResourceContent)
 * 5. CDP: CSS variables
 * 6. CDP: font @font-face extraction
 * 7. Assemble W2WCaptureResult
 */
async function handleCapturePageW2W(
  tabId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<W2WMultiCaptureResult> {
  if (state.isCapturing) {
    throw new Error("Capture already in progress");
  }

  state.isCapturing = true;
  state.captureProgress = 0;
  let client: CDPClient | null = null;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) throw new Error("Cannot capture this page");
    console.log("[W2W] Starting content script capture for:", tab.url);

    // [W2W-VERIFY] === instrumentation: track CDP usage during this capture ===
    console.group("%c[W2W-VERIFY] === CAPTURE SESSION START ===", "color: #4CAF50; font-weight: bold");
    const __verifyStartTime = Date.now();
    const __verifyCDPCalls = {
      setViewport: 0,
      pageReload: 0,
      getLayoutMetrics: 0,
      getPlatformFonts: 0,
      forcePseudoState: 0,
      hoverDomQuery: 0,
    };
    console.log("[W2W-VERIFY] URL:", tab.url);

    updateProgress(5, "Connecting to page...");
    client = await createCDPClient(tabId);

    // Get devicePixelRatio — shared across all viewports
    const dprResult = await client.send<{ result: { value: number } }>(
      "Runtime.evaluate",
      { expression: "window.devicePixelRatio", returnByValue: true },
    );
    const browserDpr = dprResult.result.value || 1;

    const viewports = options.viewports.length > 0 ? options.viewports : [1440];
    const targetHeight = 900;
    const captures: W2WFrameCapture[] = [];
    console.log("[W2W-VERIFY] Viewports:", viewports);

    // Aggregated across all viewports for shared-font filtering
    const aggregatedUsedFamilies = new Set<string>();

    // Per-viewport progress budget: [10 .. 70] = 60 points across N viewports
    const perViewportBudget = 60 / viewports.length;

    // =========================================================================
    // CAPTURE EACH VIEWPORT SEQUENTIALLY (single CDP attach)
    // =========================================================================
    for (let vi = 0; vi < viewports.length; vi++) {
      const targetViewport = viewports[vi];
      const baseProgress = 10 + vi * perViewportBudget;
      const label = `${targetViewport}px (${vi + 1}/${viewports.length})`;

      console.log(`[W2W] Capturing viewport ${label}...`);
      updateProgress(baseProgress, `Setting viewport ${label}...`);

      // --- Viewport Setup ---
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

      __verifyCDPCalls.setViewport++;

      await client.send("Page.reload", { ignoreCache: false });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      __verifyCDPCalls.pageReload++;

      // Auto-scroll for lazy content
      await autoScrollPage(client);

      // Scrollbar compensation
      const layoutMetrics = await client.send<{
        layoutViewport: { clientWidth: number; clientHeight: number };
      }>("Page.getLayoutMetrics", {});
      __verifyCDPCalls.getLayoutMetrics++;

      const actualLayoutWidth = layoutMetrics.layoutViewport.clientWidth;
      const scrollbarWidth = targetViewport - actualLayoutWidth;

      if (scrollbarWidth > 0) {
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

      // CSS scrollbar hide — re-injected after each reload
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

      // --- Content Script DOM Extraction (per viewport) ---
      updateProgress(
        baseProgress + perViewportBudget * 0.3,
        `Extracting DOM at ${label}...`,
      );
      console.log(`[W2W] Sending EXTRACT_DOM to content script for ${label}...`);

      const extractResult = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_DOM" });

      if (!extractResult || !extractResult.success) {
        throw new Error(`Content script extraction failed: ${extractResult?.error || "unknown"}`);
      }

      const { doc, frame, textHostCount } = extractResult.data as {
        doc: W2WDocMeta;
        frame: W2WFrameNode;
        textHostCount: number;
      };
      console.log(
        `[W2W] DOM extracted at ${label}: ${w2wCountNodes(frame)} nodes, ${textHostCount} text hosts`,
      );
      console.log(
        `%c[W2W-VERIFY-CONTENT] Content script extracted ${w2wCountNodes(frame)} nodes, ${textHostCount} text-hosts at ${label}`,
        "color: #2196F3",
      );

      // --- Platform Fonts via CDP (per viewport) ---
      updateProgress(
        baseProgress + perViewportBudget * 0.5,
        `Collecting fonts at ${label}...`,
      );
      await client.send("CSS.enable", {});
      await client.send("DOM.enable", {});

      const docRoot = await client.send<{ root: { nodeId: number } }>(
        "DOM.getDocument",
        { depth: -1, pierce: true },
      );
      const idxResult = await client.send<{ nodeIds: number[] }>(
        "DOM.querySelectorAll",
        { nodeId: docRoot.root.nodeId, selector: "[data-w2w-idx]" },
      );

      const fontsByIdx = new Map<number, { familyName: string; postScriptName: string }>();
      if (idxResult.nodeIds.length > 0) {
        console.log(
          `%c[W2W-VERIFY-CDP] About to call CSS.getPlatformFontsForNode for ${idxResult.nodeIds.length} text elements at ${label}`,
          "color: #FF9800",
        );
        for (const nodeId of idxResult.nodeIds) {
          try {
            const fontsResult = await client.send<{
              fonts: Array<{
                familyName: string;
                postScriptName: string;
                isCustomFont: boolean;
                glyphCount: number;
              }>;
            }>("CSS.getPlatformFontsForNode", { nodeId });

            if (fontsResult.fonts && fontsResult.fonts.length > 0) {
              const attrResult = await client.send<{ attributes: string[] }>(
                "DOM.getAttributes",
                { nodeId },
              );
              const attrs = attrResult.attributes;
              const idxPos = attrs.indexOf("data-w2w-idx");
              if (idxPos >= 0) {
                const idx = parseInt(attrs[idxPos + 1], 10);
                const primaryFont = fontsResult.fonts.reduce(
                  (best, f) => (f.glyphCount > best.glyphCount ? f : best),
                  fontsResult.fonts[0],
                );
                fontsByIdx.set(idx, {
                  familyName: primaryFont.familyName,
                  postScriptName: primaryFont.postScriptName,
                });
                aggregatedUsedFamilies.add(primaryFont.familyName.toLowerCase());
                __verifyCDPCalls.getPlatformFonts++;
                if (fontsByIdx.size <= 5) {
                  console.log(
                    `%c[W2W-VERIFY-CDP] idx=${idx}: platform="${primaryFont.familyName}" (postScript="${primaryFont.postScriptName}", custom=${primaryFont.isCustomFont}, glyphs=${primaryFont.glyphCount})`,
                    "color: #FF9800",
                  );
                }
              }
            }
          } catch {
            // Skip elements that can't be queried
          }
        }

        w2wEnrichAllTextNodes(frame, fontsByIdx);
        console.log(`[W2W] Platform fonts at ${label}: ${fontsByIdx.size} elements`);
      }

      // --- Hover State Capture (per viewport) ---
      // Geometry of hover subtrees must match this viewport's layout, so we
      // capture per viewport rather than once at the end.
      updateProgress(
        baseProgress + perViewportBudget * 0.7,
        `Capturing hover at ${label}...`,
      );

      let hoverSelectorPairs: Array<{ trigger: string; target: string }> = [];
      try {
        const selResult = await chrome.tabs.sendMessage(tabId, {
          type: "COLLECT_HOVER_SELECTORS",
        });
        if (selResult?.success && Array.isArray(selResult.data)) {
          hoverSelectorPairs = selResult.data;
          console.log(
            `[W2W-HOVER] ${label}: collected ${hoverSelectorPairs.length} :hover selectors from stylesheets`,
          );
        }
      } catch (err) {
        console.warn(`[W2W-HOVER] ${label}: failed to collect stylesheet selectors:`, err);
      }

      const extraSelectors = hoverSelectorPairs.map((h) => h.trigger);
      const interactiveNodes = w2wFindHoverCandidates(frame, extraSelectors);
      console.log(
        `[W2W-HOVER] ${label}: found ${interactiveNodes.length} hover candidates`,
      );
      if (interactiveNodes.length > 0) {
        let hoverCount = 0;

        let precaptureInjected = false;
        try {
          const injectRes = await chrome.tabs.sendMessage(tabId, {
            type: "INJECT_PRECAPTURE_STYLES",
          });
          precaptureInjected = !!injectRes?.success;
        } catch {
          // Non-fatal — hover capture still runs, just may catch jitter.
        }

        try {
          for (const { node, selector } of interactiveNodes) {
            if (!selector) continue;
            try {
              const qResult = await client.send<{ nodeId: number }>(
                "DOM.querySelector",
                { nodeId: docRoot.root.nodeId, selector },
              );
              __verifyCDPCalls.hoverDomQuery++;
              if (!qResult.nodeId) continue;

              await client.send("CSS.forcePseudoState", {
                nodeId: qResult.nodeId,
                forcedPseudoClasses: ["hover"],
              });
              __verifyCDPCalls.forcePseudoState++;

              await new Promise((r) => setTimeout(r, 16));

              const hoverResult = await chrome.tabs.sendMessage(tabId, {
                type: "EXTRACT_SUBTREE",
                selector,
              });

              await client.send("CSS.forcePseudoState", {
                nodeId: qResult.nodeId,
                forcedPseudoClasses: [],
              });
              __verifyCDPCalls.forcePseudoState++;

              if (hoverResult?.success && hoverResult.data) {
                node.hover = hoverResult.data as W2WFrameNode;
                attachHoverToDescendants(node, node.hover);
                hoverCount++;
              }
            } catch {
              // Skip elements that fail hover capture
            }
          }
        } finally {
          if (precaptureInjected) {
            try {
              await chrome.tabs.sendMessage(tabId, {
                type: "REMOVE_PRECAPTURE_STYLES",
              });
            } catch {
              // Page may already be navigating away — ignore.
            }
          }
        }
        console.log(`[W2W] Hover states captured at ${label}: ${hoverCount}`);
      }

      // Cleanup data-w2w-idx markers (they'll be re-injected on next reload)
      try {
        await chrome.tabs.sendMessage(tabId, { type: "CLEANUP_MARKERS" });
      } catch {
        // Content script may not be ready
      }

      captures.push({ width: targetViewport, frame, doc });
    }

    // =========================================================================
    // SHARED EXTRACTION (once, after the loop — page is on last viewport)
    // =========================================================================
    // --- Asset Extraction from Browser Cache ---
    // Union of image URLs across ALL captured frames (responsive srcset may
    // expose different images per viewport; browser cache is shared).
    updateProgress(72, "Extracting assets from cache...");
    const assets: Record<string, W2WAssetEntry> = {};

    const settings = await getSettings();
    if (settings.captureAssets) {
      const resourceMap = await buildResourceMap(client);
      const seenUrls = new Set<string>();
      const imageUrls: string[] = [];
      for (const cap of captures) {
        for (const url of w2wCollectImageUrls(cap.frame)) {
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            imageUrls.push(url);
          }
        }
      }
      console.log(
        `[W2W] Extracting ${imageUrls.length} unique assets across ${captures.length} viewport(s)...`,
      );

      for (const url of imageUrls) {
        const resource = resourceMap.get(url);
        if (resource) {
          try {
            const base64 = await getResourceBase64(client, resource.frameId, url);
            if (base64) {
              assets[url] = {
                base64Encoded: true,
                content: base64,
                mimeType: resource.mimeType,
              };
            }
          } catch {
            // Skip failed assets
          }
        }
      }
      console.log(`[W2W] Assets extracted: ${Object.keys(assets).length}`);
    }

    // --- Font Extraction ---
    // Honor user setting: when `captureFonts` is false, skip extraction entirely.
    let extractedFonts: Awaited<ReturnType<typeof extractFonts>> = [];
    if (settings.captureFonts) {
      updateProgress(80, "Extracting fonts...");
      extractedFonts = await extractFonts(client, tab.url);
    }

    const w2wFonts: W2WCaptureResult["fonts"] = extractedFonts.map((f) => {
      // Clean src: strip url() wrapper for clean URL storage
      const cleanSrc = f.src.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, '$1').trim();

      return {
        fontFamily: f.family,
        fontWeight: String(f.weight),
        fontStyle: f.style,
        platformFontFamily: f.family,
        src: cleanSrc || f.src,
        fontDisplay: f.fontDisplay,
        fontStretch: f.fontStretch,
        fontVariant: f.fontVariant,
        unicodeRange: f.unicodeRange,
        fontVariationAxes: f.fontVariationAxes,
        source: { tabId },
      };
    });

    // Fetch ALL font binaries from browser cache
    // Extract all font resources (woff2, woff, ttf, otf) regardless of @font-face matching
    const fontResourceMap = await buildResourceMap(client);
    const fontMimeTypes = new Set([
      "font/woff2", "font/woff", "font/ttf", "font/otf",
      "application/font-woff2", "application/font-woff",
      "application/x-font-woff", "application/x-font-ttf",
      "application/octet-stream", // woff2 often served as this
    ]);
    const fontExtensions = [".woff2", ".woff", ".ttf", ".otf", ".eot"];

    for (const [url, resource] of fontResourceMap) {
      // Match by MIME type or file extension
      const isFontMime = fontMimeTypes.has(resource.mimeType);
      const isFontExt = fontExtensions.some((ext) => url.toLowerCase().includes(ext));

      if (isFontMime || isFontExt) {
        if (assets[url]) continue; // Already extracted
        try {
          const base64 = await getResourceBase64(client, resource.frameId, url);
          if (base64) {
            assets[url] = {
              base64Encoded: true,
              content: base64,
              mimeType: resource.mimeType,
            };
          }
        } catch {
          // Skip failed font extraction
        }
      }
    }

    // Also try extracting fonts referenced in @font-face src
    // w2wFonts.src is already cleaned (no url() wrapper), may contain multiple URLs space-separated
    for (const font of w2wFonts) {
      if (!font.src) continue;
      // Extract URLs: could be clean URLs (after stripping url()) or still have url() wrappers
      const urlRegex = /(?:url\(['"]?)?((https?:\/\/[^\s'")\],]+))['"]?\)?/g;
      let match;
      while ((match = urlRegex.exec(font.src)) !== null) {
        const fontUrl = match[1];
        if (assets[fontUrl]) continue; // Already got it

        // Try resource map first
        const resource = fontResourceMap.get(fontUrl);
        if (resource) {
          try {
            const base64 = await getResourceBase64(client, resource.frameId, fontUrl);
            if (base64) {
              assets[fontUrl] = {
                base64Encoded: true,
                content: base64,
                mimeType: resource.mimeType,
              };
            }
          } catch {
            // Skip
          }
        } else {
          // Font not in resource map (cross-origin CDN) — try Network.getResponseBody
          // or fetch via content script. For now, try with main frame ID from resource tree.
          const mainFrameId = getMainFrameId(fontResourceMap);
          if (mainFrameId) {
            try {
              const base64 = await getResourceBase64(client, mainFrameId, fontUrl);
              if (base64) {
                let mime = 'font/woff2';
                if (fontUrl.includes('.woff2')) mime = 'font/woff2';
                else if (fontUrl.includes('.woff')) mime = 'font/woff';
                else if (fontUrl.includes('.ttf')) mime = 'font/ttf';
                else if (fontUrl.includes('.otf')) mime = 'font/otf';
                assets[fontUrl] = {
                  base64Encoded: true,
                  content: base64,
                  mimeType: mime,
                };
              }
            } catch {
              // Font not available in browser cache — skip
            }
          }
        }
      }
    }
    // Fallback: fetch missing font binaries via content script (page context, no CORS issues)
    const missingFontUrls: string[] = [];
    for (const font of w2wFonts) {
      if (!font.src) continue;
      const urlRegex2 = /(?:url\(['"]?)?((https?:\/\/[^\s'")\],]+))['"]?\)?/g;
      let m2;
      while ((m2 = urlRegex2.exec(font.src)) !== null) {
        const fontUrl = m2[1];
        if (!assets[fontUrl]) missingFontUrls.push(fontUrl);
      }
    }

    if (missingFontUrls.length > 0) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "FETCH_FONT_DATA",
          urls: missingFontUrls,
        });
        if (response?.success && response.data) {
          for (const [url, base64] of Object.entries(response.data)) {
            if (base64 && typeof base64 === 'string') {
              let mime = 'font/woff2';
              if (url.includes('.woff2')) mime = 'font/woff2';
              else if (url.includes('.woff')) mime = 'font/woff';
              else if (url.includes('.ttf')) mime = 'font/ttf';
              else if (url.includes('.otf')) mime = 'font/otf';
              assets[url] = {
                base64Encoded: true,
                content: base64,
                mimeType: mime,
              };
            }
          }
        }
      } catch {
        // Content script font fetch failed — degrade silently; missing fonts
        // are surfaced later via the font fallback modal.
      }
    }

    // --- Filter fonts: keep only actually-used fonts (like h2d) ---
    // aggregatedUsedFamilies unions platform fonts across ALL viewports
    // (responsive designs may use different fonts at different widths).
    const usedFontFamilies = aggregatedUsedFamilies;

    if (usedFontFamilies.size > 0) {
      // Filter w2wFonts: keep only entries whose fontFamily matches a used font
      const filteredFonts = w2wFonts.filter((f) =>
        usedFontFamilies.has(f.fontFamily.toLowerCase()) ||
        (f.platformFontFamily && usedFontFamilies.has(f.platformFontFamily.toLowerCase()))
      );

      // For each kept font, prefer woff2 over woff over ttf
      // Build a set of font URLs to keep
      const fontUrlsToKeep = new Set<string>();
      const fontFamilyBestUrl = new Map<string, string>(); // family|weight|style → best URL

      for (const font of filteredFonts) {
        if (!font.src) continue;
        const key = `${font.fontFamily.toLowerCase()}|${font.fontWeight}|${font.fontStyle}`;
        const urlRegex = /(?:url\(['"]?)?((https?:\/\/[^\s'")\],]+))['"]?\)?/g;
        let m;
        const urls: string[] = [];
        while ((m = urlRegex.exec(font.src)) !== null) {
          urls.push(m[1]);
        }
        // Prefer woff2 > woff > ttf > otf
        const ranked = urls.sort((a, b) => {
          const rank = (u: string) => {
            if (u.includes('.woff2')) return 0;
            if (u.includes('.woff')) return 1;
            if (u.includes('.ttf')) return 2;
            if (u.includes('.otf')) return 3;
            return 4;
          };
          return rank(a) - rank(b);
        });
        if (ranked.length > 0) {
          fontFamilyBestUrl.set(key, ranked[0]);
          fontUrlsToKeep.add(ranked[0]);
        }
      }

      // Remove font assets that are not in the keep set
      const fontMimeSet = new Set([
        "font/woff2", "font/woff", "font/ttf", "font/otf",
        "application/font-woff2", "application/font-woff",
        "application/x-font-woff", "application/x-font-ttf",
      ]);
      const fontExtSet = [".woff2", ".woff", ".ttf", ".otf", ".eot"];
      for (const url of Object.keys(assets)) {
        const asset = assets[url];
        const isFontMime = asset.mimeType ? fontMimeSet.has(asset.mimeType) : false;
        const isFontExt = fontExtSet.some((ext) => url.toLowerCase().includes(ext));
        if ((isFontMime || isFontExt) && !fontUrlsToKeep.has(url)) {
          delete assets[url];
        }
      }

      // Also remove application/octet-stream assets that look like fonts
      for (const url of Object.keys(assets)) {
        const asset = assets[url];
        if (asset.mimeType === "application/octet-stream") {
          const isFontExt = fontExtSet.some((ext) => url.toLowerCase().includes(ext));
          if (isFontExt && !fontUrlsToKeep.has(url)) {
            delete assets[url];
          }
        }
      }

      // Replace w2wFonts with filtered version
      w2wFonts.length = 0;
      w2wFonts.push(...filteredFonts);
    }

    console.log(`[W2W] Final assets count: ${Object.keys(assets).length}`);

    // --- CSS Variables ---
    updateProgress(90, "Extracting CSS variables...");
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariables = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    updateProgress(97, "Finalizing...");

    // --- Assemble Multi-Viewport Result ---
    const result: W2WMultiCaptureResult = {
      name: tab.url,
      url: tab.url,
      theme: "default",
      frames: captures,
      assets,
      fonts: w2wFonts,
      cssVariables,
    };

    updateProgress(100, "Complete!");
    const totalNodes = captures.reduce((sum, c) => sum + w2wCountNodes(c.frame), 0);
    console.log(
      `[W2W] Capture complete: ${captures.length} viewport(s), ${totalNodes} total nodes, ${Object.keys(assets).length} assets, ${w2wFonts.length} fonts`,
    );

    // [W2W-VERIFY] === instrumentation: session summary ===
    const __verifyDuration = Date.now() - __verifyStartTime;
    console.log("%c[W2W-VERIFY] === SUMMARY ===", "color: #4CAF50; font-weight: bold");
    console.log(`[W2W-VERIFY] Total time: ${__verifyDuration}ms`);
    console.log(`[W2W-VERIFY] Viewports captured: ${captures.length}`);
    console.log(`[W2W-VERIFY] Total nodes: ${totalNodes}`);
    console.log(`[W2W-VERIFY] Assets: ${Object.keys(assets).length}`);
    console.log(`[W2W-VERIFY] CSS variables: ${cssVariables.length}`);
    console.log("%c[W2W-VERIFY] CDP calls breakdown (instrumented sites only):", "color: #FF9800; font-weight: bold");
    console.table(__verifyCDPCalls);
    console.log("[W2W-VERIFY] Note: extractFonts/extractCSSVariables/buildResourceMap also use CDP internally — not counted here");
    console.groupEnd();

    return result;
  } finally {
    if (client) {
      try {
        await client.send("Emulation.clearDeviceMetricsOverride", {});
      } catch {
        // Ignore
      }
      await client.destroy();
    }
    state.isCapturing = false;
    // [W2W-VERIFY] safety: close any open console group on error path
    try { console.groupEnd(); } catch { /* noop */ }
  }
}

// ---------------------------------------------------------------------------
// W2W content script helper functions
// ---------------------------------------------------------------------------

/** Count total nodes in a W2W tree. */
/** Get main frame ID from resource map (first entry's frameId). */
function getMainFrameId(resourceMap: Map<string, { frameId: string }>): string | null {
  for (const [, resource] of resourceMap) {
    if (resource.frameId) return resource.frameId;
  }
  return null;
}

function w2wCountNodes(node: W2WNode): number {
  let count = 1;
  if (node.type === "FRAME" && node.children) {
    for (const child of node.children) {
      count += w2wCountNodes(child);
    }
  }
  return count;
}

/** Collect all image URLs ($url) from the W2W tree. */
function w2wCollectImageUrls(node: W2WNode, urls: string[] = []): string[] {
  if (node.type === "FRAME") {
    if (node.$url) urls.push(node.$url);
    for (const child of node.children) {
      w2wCollectImageUrls(child, urls);
    }
  }
  return urls;
}

/**
 * Enrich all TEXT nodes with platform fonts by walking the tree in DFS order.
 * The content script sets data-w2w-idx in the same DFS order (incremented
 * for each frame that has TEXT children).
 */
function w2wEnrichAllTextNodes(
  frame: W2WFrameNode,
  fontsByIdx: Map<number, { familyName: string; postScriptName: string }>,
): void {
  let idx = 0;

  function walk(node: W2WNode): void {
    if (node.type === "FRAME") {
      const hasTextChildren = node.children.some((c) => c.type === "TEXT");
      if (hasTextChildren) {
        const font = fontsByIdx.get(idx);
        if (font) {
          for (const child of node.children) {
            if (child.type === "TEXT") {
              child.platformFont = {
                familyName: font.familyName,
                postScriptName: font.postScriptName,
              };
              // Override content-script's weight-specific font name with platform font
              // (platformFont.familyName overrides content-script font for TEXT nodes)
              child.font = font.familyName;
            }
          }
        }
        idx++;
      }
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(frame);
}

// w2wFindInteractiveNodes imported from @w2w/shared (shared between Extension and API)

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
    state.isCapturing = false;
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


// Extension loaded
