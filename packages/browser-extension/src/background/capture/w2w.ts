/* eslint-disable no-console -- `[W2W]` + `[W2W-VERIFY]` capture-flow
 * tracing; silenced in prod by gateConsoleInProduction(). */

/**
 * W2W page capture — hybrid content-script + CDP pipeline.
 *
 * Flow:
 *  1. Viewport setup (Emulation.setDeviceMetricsOverride + scrollbar
 *     compensation, per viewport — no Page.reload, so the popup stays open)
 *  2. Content script extracts the live DOM → W2WFrameNode tree
 *  3. CDP: platform fonts (CSS.getPlatformFontsForNode) — gets the
 *     ACTUAL rendered font after fallback, not the CSS request
 *  4. CDP: `:hover` state capture (CSS.forcePseudoState)
 *  5. CDP: assets from browser cache (Page.getResourceContent)
 *  6. CDP: CSS variables (computed style on :root)
 *  7. CDP: @font-face binaries (Page.getResourceContent on .woff/.woff2)
 *  8. Assemble W2WMultiCaptureResult and post to /api/import-w2w
 */

import { createCDPClient, CDPClient } from "../cdp/client";
import { extractFonts } from "../cdp/fonts";
import { buildResourceMap, getResourceBase64 } from "../cdp/assets";

import {
  extractCSSVariables,
  isObfuscatedFont,
  attachHoverToDescendants,
  w2wFindHoverCandidates,
  type W2WCaptureResult,
  type W2WMultiCaptureResult,
  type W2WFrameCapture,
  type W2WFrameNode,
  type W2WNode,
  type W2WDocMeta,
  type W2WAssetEntry,
  type CaptureOptions,
  type CaptureStats,
  DEFAULT_CAPTURE_OPTIONS,
  extractUrlsFromSrc,
  orderUrlsByInstallability,
  W2W_HYDRATION_EXPRESSION,
  W2W_HYDRATION_TIMEOUT_MS,
  captureTaintedCanvases,
  type W2WTextNode,
} from "@w2w/shared";

import { state, updateProgress } from "../state";
import { getSettings } from "../utils/settings";
import { categorizeCSSVariable } from "../utils/misc";
import { autoScrollPage } from "./legacy";

// =============================================================================

/** CSS-pixel height of the emulated viewport. The page is captured full-height
 *  by scrolling, so this only seeds the layout viewport (and `vh` units). */
const VIEWPORT_HEIGHT = 900;

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
export async function handleCapturePageW2W(
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

    // Browser zoom — shared across all viewports. `devicePixelRatio` can't tell
    // us this: it is dpr × zoom, so reading it conflates a Retina panel with a
    // zoomed window. `cssVisualViewport.zoom` is the zoom alone.
    const zoom = await client
      .send<{ cssVisualViewport?: { zoom?: number } }>("Page.getLayoutMetrics", {})
      .then((m) => m.cssVisualViewport?.zoom || 1)
      .catch(() => 1);
    __verifyCDPCalls.getLayoutMetrics++;

    // Before the first viewport override and the first layout measurement:
    // the scrollbar must be gone when the layout width is read, or the
    // compensation below widens the viewport for a scrollbar the extraction
    // then hides. Restored in the `finally`. Pinned by a source-order guard in
    // w2w-scrollbars.test.ts.
    await w2wHideScrollbars(client);

    const viewports = options.viewports.length > 0 ? options.viewports : [1440];
    const captures: W2WFrameCapture[] = [];
    console.log("[W2W-VERIFY] Viewports:", viewports);

    // Aggregated across all viewports for shared-font filtering
    const aggregatedUsedFamilies = new Set<string>();

    // Per-viewport progress budget: [10 .. 70] = 60 points across N viewports
    const perViewportBudget = 60 / viewports.length;

    const settings = await getSettings();

    // Filled per viewport inside the loop — see w2wHarvestImageAssets for why
    // harvesting can't wait until after the loop.
    const assets: Record<string, W2WAssetEntry> = {};

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
      await client.send(
        "Emulation.setDeviceMetricsOverride",
        w2wViewportMetrics(targetViewport, zoom),
      );

      __verifyCDPCalls.setViewport++;

      // No Page.reload — Emulation reflows the page live at the new width
      // (h2d's approach). Reloading the active tab closes the action popup, so
      // we skip it; give layout a moment to settle, then trigger lazy content.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Must stay BEFORE the auto-scroll: scrolling is what fires the
      // IntersectionObservers, so they have to be registered first. Pinned by
      // a source-order guard in w2w-hydration.test.ts.
      await w2wWaitForHydration(client);

      // Auto-scroll for lazy content
      await autoScrollPage(client);

      // Scrollbar compensation
      const layoutMetrics = await client.send<{
        cssLayoutViewport?: { clientWidth: number };
        layoutViewport: { clientWidth: number; clientHeight: number };
      }>("Page.getLayoutMetrics", {});
      __verifyCDPCalls.getLayoutMetrics++;

      const scrollbarWidth = w2wScrollbarWidth(targetViewport, layoutMetrics);

      if (scrollbarWidth > 0) {
        await client.send(
          "Emulation.setDeviceMetricsOverride",
          w2wViewportMetrics(targetViewport, zoom, scrollbarWidth),
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // CSS scrollbar hide — injected once; persists across viewports since we
      // no longer reload. Guard against duplicate <style> on later viewports.
      await client.send("Runtime.evaluate", {
        expression: `
          if (!document.getElementById('__w2w_hide_scrollbar')) {
            const style = document.createElement('style');
            style.id = '__w2w_hide_scrollbar';
            style.textContent = 'html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }';
            document.head.appendChild(style);
          }
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

        // Read every host's own text now, AFTER the measurements: a label that
        // changed under us between the DOM read and here (stripe.com's payment
        // mockup cycles locales in place) must not hand its font to the text
        // we captured. Read once more before the loop would only be stronger;
        // this one alone already rejects the stale side.
        const hostText = await w2wReadHostText(client);
        const before = w2wCountPlatformFonts(frame);
        w2wEnrichAllTextNodes(frame, fontsByIdx, hostText);
        console.log(
          `[W2W] Platform fonts at ${label}: ${fontsByIdx.size} measured, ` +
            `${w2wCountPlatformFonts(frame) - before} applied` +
            (hostText ? ` (live text checked on ${hostText.size} hosts)` : " (live text unavailable — unguarded)"),
        );
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

      // A tainted <canvas> cannot hand its pixels to the content script at all
      // (stripe.com's carousel draws cross-origin images without CORS), so it
      // arrives as an empty box. Photograph the compositor instead. Last of the
      // layout-touching steps: `captureBeyondViewport` resizes the viewport for
      // the duration of each shot, and it has to run before this viewport's
      // frame is banked because it fills the frame in place.
      await captureTaintedCanvases(client, frame);

      captures.push({ width: targetViewport, frame, doc });

      // Harvest this viewport's image assets while its srcset variants are
      // still referenced by the live document.
      if (settings.captureAssets) {
        const harvest = await w2wHarvestImageAssets(client, [frame], assets);
        console.log(
          `[W2W] Assets at ${label}: +${harvest.extracted} extracted, ${harvest.missed} deferred to final pass`,
        );
      }
    }

    // =========================================================================
    // SHARED EXTRACTION (once, after the loop — page is on last viewport)
    // =========================================================================
    // --- Asset Extraction from Browser Cache ---
    // Union of image URLs across ALL captured frames (responsive srcset may
    // expose different images per viewport; browser cache is shared).
    updateProgress(72, "Extracting assets from cache...");

    // captureStats is built up alongside the asset loop so the popup can
    // tell the user about cache misses / fetch failures. Format-conversion
    // failures (HEIC/TIFF refused by the figma plugin's Canvas pipeline)
    // happen post-capture and are NOT counted here — that telemetry would
    // need a return channel from the plugin we don't have today.
    let captureStats: CaptureStats | undefined;

    if (settings.captureAssets) {
      // Mop-up pass over the union of all frames: catches anything the
      // per-viewport passes missed (late lazy loads, retried URLs).
      const finalPass = await w2wHarvestImageAssets(
        client,
        captures.map((cap) => cap.frame),
        assets,
      );
      let resourceMapMisses = finalPass.missed;

      // Last resort for URLs the resource tree no longer lists: fetch from
      // page context (same FETCH_FONT_DATA handler the fonts use) — hits the
      // HTTP cache for same-origin and CORS-enabled URLs.
      if (resourceMapMisses > 0) {
        const missingUrls: string[] = [];
        const seenMissing = new Set<string>();
        for (const cap of captures) {
          for (const url of w2wCollectImageUrls(cap.frame)) {
            if (!assets[url] && !seenMissing.has(url)) {
              seenMissing.add(url);
              missingUrls.push(url);
            }
          }
        }
        try {
          const response = await chrome.tabs.sendMessage(tabId, {
            type: "FETCH_FONT_DATA",
            urls: missingUrls,
          });
          if (response?.success && response.data) {
            for (const [url, base64] of Object.entries(response.data)) {
              if (!base64 || typeof base64 !== "string") continue;
              const mime = w2wSniffImageMime(base64);
              if (!mime) continue; // unidentifiable bytes — placeholder is safer
              assets[url] = {
                base64Encoded: true,
                content: base64,
                mimeType: mime,
              };
              resourceMapMisses -= 1;
            }
          }
          console.log(
            `[W2W] Page-context image fetch: asked ${missingUrls.length}, recovered ${missingUrls.length - resourceMapMisses}`,
          );
        } catch (err) {
          console.warn("[W2W] Page-context image fetch failed:", err);
        }
      }

      console.log(`[W2W] Assets extracted: ${Object.keys(assets).length}, missed: ${resourceMapMisses}`);

      captureStats = {
        skippedImageCount: resourceMapMisses,
        unsupportedFormats: {},
        oversizedImageCount: 0,
        payloadTruncated: false,
        resourceMapMisses,
      };
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
    // The browser downloads exactly ONE format per face, so every other
    // declared URL lands here. Ask for them best-installable first and skip the
    // two formats nothing can use — .svg outlines and the IE-only .eot — so the
    // page isn't made to fetch files that would only be discarded.
    const missingFontUrls: string[] = [];
    for (const font of w2wFonts) {
      if (!font.src) continue;
      for (const fontUrl of orderUrlsByInstallability(extractUrlsFromSrc(font.src))) {
        if (assets[fontUrl]) continue;
        if (/\.(svg|eot)(\?|#|$)/i.test(fontUrl)) continue;
        missingFontUrls.push(fontUrl);
      }
    }

    if (missingFontUrls.length > 0) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "FETCH_FONT_DATA",
          urls: missingFontUrls,
        });
        console.log(
          `[W2W] Content-script font fetch: asked ${missingFontUrls.length}, got ${
            response?.data ? Object.keys(response.data).length : 0
          }`,
        );
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
      } catch (err) {
        // Content script font fetch failed — degrade silently; missing fonts
        // are surfaced later via the font fallback modal. Logged because a
        // silent failure here is indistinguishable from "the page shipped no
        // fonts", and it decides whether the export can carry any binary.
        console.warn("[W2W] Content-script font fetch failed:", err);
      }
    }

    // --- Filter fonts: keep only actually-used fonts (like h2d) ---
    // aggregatedUsedFamilies unions platform fonts across ALL viewports
    // (responsive designs may use different fonts at different widths). Those
    // are the names the OS RESOLVED to; an @font-face is keyed by the name the
    // CSS REQUESTED, and for icon fonts the two differ ("glyphs" renders as
    // "icomoon"). Matching platform names alone dropped every such face from
    // the export, so the plugin could neither render nor download them.
    const usedFontFamilies = aggregatedUsedFamilies;
    const usedCssFontFamilies = new Set<string>();
    for (const cap of captures) w2wCollectCssFontFamilies(cap.frame, usedCssFontFamilies);

    if (usedFontFamilies.size > 0 || usedCssFontFamilies.size > 0) {
      const filteredFonts = w2wFilterUsedFonts(
        w2wFonts,
        usedFontFamilies,
        usedCssFontFamilies,
      );

      // For each kept font, prefer woff2 over woff over ttf
      // Build a set of font URLs to keep
      const fontUrlsToKeep = new Set<string>();
      const fontFamilyBestUrl = new Map<string, string>(); // family|weight|style → best URL

      for (const font of filteredFonts) {
        if (!font.src) continue;
        const key = `${font.fontFamily.toLowerCase()}|${font.fontWeight}|${font.fontStyle}`;
        // Keep the files we HOLD BYTES for, most installable first — see
        // w2wPickFontUrlsToKeep. Ranking the declared URLs without checking
        // what was cached drops the one format the browser actually fetched.
        const keep = w2wPickFontUrlsToKeep(font.src, (url) => !!assets[url]);
        if (keep.length > 0) {
          fontFamilyBestUrl.set(key, keep[0]);
          for (const url of keep) fontUrlsToKeep.add(url);
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
      captureStats,
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
      // The style lives in the user's real tab, so unlike emulation state it
      // does not go away on detach — take it back out ourselves.
      await w2wShowScrollbars(client);
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

/**
 * Let a hydrating framework finish before anything is read off the page.
 *
 * A React/Vue/Svelte page is HTML first and interactive second; capture it in
 * between and the scroll-reveal wrappers are still `opacity: 0` with no
 * IntersectionObserver registered to lift them, so the converter drops them and
 * can only report that something hidden went missing.
 *
 * The expression and its bound live in `@w2w/shared` because the API's capture
 * path runs the same wait — they were separate for a while, only the API's was
 * fixed, and this path kept losing the content.
 */
export async function w2wWaitForHydration(client: {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
}): Promise<void> {
  try {
    await client.send("Runtime.evaluate", {
      expression: W2W_HYDRATION_EXPRESSION,
      awaitPromise: true,
      timeout: W2W_HYDRATION_TIMEOUT_MS,
    });
  } catch {
    // A page that never goes idle is still worth capturing.
  }
}

/** Id of the style {@link w2wHideScrollbars} injects — the API path uses the same. */
const HIDE_SCROLLBAR_STYLE_ID = "__w2w_hide_scrollbar";

/**
 * Take the page scrollbar out of layout for the whole capture.
 *
 * Scrollbar compensation measured the layout viewport WITH the scrollbar (1425
 * at a 1440 override on a Mac with classic scrollbars), widened the override by
 * the difference, and expected the content to land on 1440. It did — until the
 * content script hid the scrollbar for the extraction and the 15px came back:
 * everything laid out from `100vw` (stripe.com's `main`, its section padding
 * `(100vw - 1266px) / 2`) then measured 1455 / 94.5 where a URL import of the
 * same page gives 1440 / 87. Headless Chromium has no scrollbar, so the API
 * path never saw this.
 *
 * Hiding it BEFORE the first measurement makes the measured width equal the
 * override, the compensation 0, and the two paths agree. `scrollbar-width:
 * none` is the rule that actually returns the width to layout; the -webkit
 * rule only hides the paint. Both root candidates are covered because the
 * scroller is `html` on most pages and `body` on some.
 *
 * Never throws — a page that refuses the style is still worth capturing.
 */
export async function w2wHideScrollbars(client: {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
}): Promise<void> {
  try {
    await client.send("Runtime.evaluate", {
      expression: `
        if (!document.getElementById(${JSON.stringify(HIDE_SCROLLBAR_STYLE_ID)})) {
          const style = document.createElement('style');
          style.id = ${JSON.stringify(HIDE_SCROLLBAR_STYLE_ID)};
          style.textContent = 'html, body { scrollbar-width: none !important; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }';
          document.head.appendChild(style);
        }
      `,
      awaitPromise: false,
    });
  } catch {
    // Hiding is an improvement, never a precondition.
  }
}

/**
 * Undo {@link w2wHideScrollbars}. The style sits in the user's real tab, so it
 * does not vanish on debugger detach the way emulation state does; the tab has
 * to be handed back exactly as it was. Never throws — cleanup must not mask
 * the capture result.
 */
export async function w2wShowScrollbars(client: {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
}): Promise<void> {
  try {
    await client.send("Runtime.evaluate", {
      expression: `document.getElementById(${JSON.stringify(HIDE_SCROLLBAR_STYLE_ID)})?.remove()`,
      awaitPromise: false,
    });
  } catch {
    // Ignore — the tab may already be gone.
  }
}

/**
 * Width of the scrollbar the page is actually showing, in CSS pixels.
 *
 * `Page.getLayoutMetrics` reports the layout viewport twice. `layoutViewport`
 * is deprecated and, per the protocol, in DEVICE pixels; `cssLayoutViewport` is
 * the CSS-pixel one. `targetViewport` is CSS, so subtracting the deprecated
 * field mixed units: on a Retina display it is ~2x, at 150% zoom ~1.5x, the
 * difference goes negative, and the caller's `> 0` guard then skips
 * compensation altogether — silently, and on most developer machines.
 */
export function w2wScrollbarWidth(
  targetViewport: number,
  metrics: {
    cssLayoutViewport?: { clientWidth: number };
    layoutViewport?: { clientWidth: number };
  },
): number {
  const cssWidth =
    metrics.cssLayoutViewport?.clientWidth ?? metrics.layoutViewport?.clientWidth;
  if (typeof cssWidth !== "number" || !isFinite(cssWidth)) return 0;
  return Math.max(0, targetViewport - cssWidth);
}

/**
 * Build the `Emulation.setDeviceMetricsOverride` params for one capture viewport.
 *
 * `deviceScaleFactor: 0` means "inherit the host's native DPR". Overriding it
 * makes the page resolve every `srcset` against a density it isn't rendering at:
 * the old `1 / devicePixelRatio` sent 0.5 on any Retina display, which is why a
 * capture came back holding the smallest candidate of every responsive image.
 *
 * Browser zoom is the thing that actually needs correcting, and it needs
 * correcting on the SIZE, not the density — CDP sizes are device-independent
 * pixels, so a CSS viewport of `targetViewport` needs `targetViewport * zoom`.
 * Height is scaled for the same reason, so `vh` units resolve against the
 * height we asked for.
 */
export function w2wViewportMetrics(
  targetViewport: number,
  zoom: number,
  scrollbarWidth = 0,
): {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  screenWidth: number;
  screenHeight: number;
  positionX: number;
  positionY: number;
  screenOrientation: { angle: number; type: string };
} {
  const cssWidth = targetViewport + scrollbarWidth;
  const width = Math.round(cssWidth * zoom);
  const height = Math.round(VIEWPORT_HEIGHT * zoom);
  // Mobile emulation keys off the CSS viewport we asked for, never the zoomed
  // device width — 375 CSS px is a phone capture at any zoom level.
  const mobile = targetViewport <= 768;

  return {
    width,
    height,
    deviceScaleFactor: 0,
    mobile,
    screenWidth: width,
    screenHeight: height,
    positionX: 0,
    positionY: 0,
    screenOrientation: {
      angle: 0,
      type: mobile ? "portraitPrimary" : "landscapePrimary",
    },
  };
}

/** Count total nodes in a W2W tree. */
/** Get main frame ID from resource map (first entry's frameId). */
export function getMainFrameId(resourceMap: Map<string, { frameId: string }>): string | null {
  for (const [, resource] of resourceMap) {
    if (resource.frameId) return resource.frameId;
  }
  return null;
}

export function w2wCountNodes(node: W2WNode): number {
  let count = 1;
  if (node.type === "FRAME" && node.children) {
    for (const child of node.children) {
      count += w2wCountNodes(child);
    }
  }
  return count;
}

/** Collect all image URLs ($url) from the W2W tree. */
export function w2wCollectImageUrls(node: W2WNode, urls: string[] = []): string[] {
  if (node.type === "FRAME") {
    if (node.$url) urls.push(node.$url);
    for (const child of node.children) {
      w2wCollectImageUrls(child, urls);
    }
  }
  return urls;
}

/**
 * Harvest the given frames' image assets from the browser cache into `assets`.
 *
 * Must run while the current document still references those resources:
 * Page.getResourceTree only lists the LIVE document's resources, and a srcset
 * variant fetched for an intermediate viewport width (e.g. `*_desktop_1x`) can
 * be evicted once a later width swaps it out. Harvesting once after the
 * viewport loop lost exactly those variants (iwm.org.uk, resourceMapMisses: 8),
 * so the loop calls this per viewport and the post-loop call only mops up.
 */
export async function w2wHarvestImageAssets(
  client: CDPClient,
  frames: W2WNode[],
  assets: Record<string, W2WAssetEntry>,
): Promise<{ extracted: number; missed: number }> {
  const resourceMap = await buildResourceMap(client);
  let extracted = 0;
  let missed = 0;
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const url of w2wCollectImageUrls(frame)) {
      if (seen.has(url) || assets[url]) continue;
      seen.add(url);
      const resource = resourceMap.get(url);
      if (!resource) {
        missed += 1;
        continue;
      }
      try {
        const base64 = await getResourceBase64(client, resource.frameId, url);
        if (base64) {
          assets[url] = {
            base64Encoded: true,
            content: base64,
            mimeType: resource.mimeType,
          };
          extracted += 1;
        } else {
          missed += 1;
        }
      } catch {
        missed += 1;
      }
    }
  }
  return { extracted, missed };
}

/**
 * Identify an image's MIME type from its magic bytes. The page-context fetch
 * fallback returns bare base64 with no Content-Type, and the plugin's decode
 * path keys off mimeType — a wrong guess misrenders, so unknown bytes return
 * null and the caller must skip the asset.
 */
export function w2wSniffImageMime(base64: string): string | null {
  let head: Uint8Array;
  try {
    head = Uint8Array.from(atob(base64.slice(0, 64)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (head.length < 4) return null;
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) return "image/webp";
  if (head[0] === 0x3c) return "image/svg+xml"; // '<' — "<svg" or "<?xml"
  return null;
}

/**
 * Enrich all TEXT nodes with platform fonts by walking the tree in DFS order.
 * The content script sets data-w2w-idx in the same DFS order (incremented
 * for each frame that has TEXT children).
 */
/** CSS keywords that name no installable file, so an @font-face can never
 *  declare them. */
const GENERIC_CSS_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji",
  "fangsong", "inherit", "initial", "unset", "revert",
]);

/**
 * Every font family the captured tree REQUESTS, lowercased.
 *
 * The used-font filter can't rely on platform font names alone: those are what
 * the OS resolved to ("icomoon"), while an @font-face is keyed by what the CSS
 * asked for ("glyphs"). Collecting the CSS side is the only way to tell that a
 * face is used when the two names differ — which is the norm for icon fonts,
 * anti-piracy aliases and variable-font instances.
 */
export function w2wCollectCssFontFamilies(
  node: W2WNode,
  out: Set<string> = new Set<string>(),
): Set<string> {
  if (node.type === "FRAME") {
    const declared = node.styles?.fontFamily;
    if (declared) {
      for (const part of declared.split(",")) {
        const name = part.trim().replace(/^['"]|['"]$/g, "").trim().toLowerCase();
        if (name && !GENERIC_CSS_FAMILIES.has(name)) out.add(name);
      }
    }
    for (const child of node.children) w2wCollectCssFontFamilies(child, out);
  }
  return out;
}

/**
 * Keep only the @font-face entries the page actually uses — matched against
 * BOTH the platform names that rendered and the families the CSS requested.
 * With an empty demand on both sides we can't prove anything unused, so
 * everything stays.
 */
export function w2wFilterUsedFonts<
  T extends { fontFamily: string; platformFontFamily?: string },
>(fonts: T[], usedPlatformFamilies: Set<string>, usedCssFamilies: Set<string>): T[] {
  if (usedPlatformFamilies.size === 0 && usedCssFamilies.size === 0) return fonts;
  return fonts.filter((f) => {
    const css = f.fontFamily.toLowerCase();
    return (
      usedCssFamilies.has(css) ||
      usedPlatformFamilies.has(css) ||
      (!!f.platformFontFamily && usedPlatformFamilies.has(f.platformFontFamily.toLowerCase()))
    );
  });
}

/**
 * The URLs of a face worth keeping in the export, best-installable first.
 *
 * Ranking alone is not enough: a face declares up to five formats but the
 * browser only ever downloaded ONE of them, so the ranking must be applied to
 * the URLs we actually HOLD BYTES for. Keeping the theoretically-best URL
 * instead (a .ttf the page never requested) makes the cleanup below delete the
 * cached .woff — which is how a capture ended up shipping zero font files.
 *
 * All available URLs are kept, not just the first: they cost a few KB each and
 * let the plugin pick the format it can actually unwrap (it converts WOFF and
 * EOT to SFNT, but has no Brotli for WOFF2). When nothing was cached we keep
 * the best-ranked URL as a marker so a later fetch has a target.
 */
export function w2wPickFontUrlsToKeep(
  src: string,
  hasBytes: (url: string) => boolean,
): string[] {
  const ranked = orderUrlsByInstallability(extractUrlsFromSrc(src));
  const available = ranked.filter(hasBytes);
  if (available.length > 0) return available;
  return ranked.slice(0, 1);
}

export function w2wEnrichAllTextNodes(
  frame: W2WFrameNode,
  fontsByIdx: Map<number, { familyName: string; postScriptName: string }>,
  hostText?: Map<number, string>,
): void {
  let idx = 0;

  function walk(node: W2WNode): void {
    if (node.type !== "FRAME") return;

    // Pseudo-element and list-marker wrappers are synthesized by the content
    // script, not traversed, so they never received a `data-w2w-idx`. Counting
    // them shifted every host after them — 80 of stripe.com's 831 hosts were
    // wrappers, the first at position 7, and 17 Latin labels ended up wearing
    // the Hiragino / PingFang measured on Japanese labels nearby.
    if (isSyntheticFrame(node)) return;

    // POST-order: the content script tags a host only after traversing its
    // children (`nodeIndexCounter++` sits below the child loop), so a nested
    // host is numbered BEFORE its parent. Counting pre-order swapped the two.
    for (const child of node.children) {
      walk(child);
    }

    const textChildren = node.children.filter(
      (c): c is W2WTextNode => c.type === "TEXT",
    );
    if (textChildren.length === 0) return;

    const font = fontsByIdx.get(idx);
    const live = hostText?.get(idx);
    idx++;

    if (!font) return;
    // A malformed `name` table can put legal text where the family name
    // belongs — stripe.com measures as familyName "Copyright Klim Type
    // Foundry" / postScriptName "SohneVF-Buch". Ignore such measurements
    // entirely so the CSS-declared family stands.
    if (
      isObfuscatedFont({
        familyName: font.familyName,
        postScriptName: font.postScriptName,
        isCustomFont: true,
        glyphCount: 1,
      })
    ) {
      return;
    }
    // The measurement describes whatever the element shows NOW. If that is
    // not the text we captured — the label rotated, or the numbering is off
    // in some way not covered above — the font belongs to other text.
    // Whitespace is ignored on both sides: the content script splits a text
    // node into trimmed visual lines.
    if (hostText) {
      if (live === undefined) return;
      const captured = textChildren.map((c) => c.value).join("");
      if (stripWhitespace(live) !== stripWhitespace(captured)) return;
    }

    for (const child of textChildren) {
      child.platformFont = {
        familyName: font.familyName,
        postScriptName: font.postScriptName,
      };
      // Override content-script's weight-specific font name with platform font
      // (platformFont.familyName overrides content-script font for TEXT nodes)
      child.font = font.familyName;
    }
  }

  walk(frame);
}

/** A FRAME the content script synthesized (pseudo-element / list-marker
 *  wrapper) rather than traversed — never tagged with `data-w2w-idx`. */
function isSyntheticFrame(node: W2WFrameNode): boolean {
  return (node.classList ?? []).some((c) => String(c).startsWith("__w2w-"));
}

function stripWhitespace(s: string): string {
  return s.replace(/\s+/g, "");
}

/** TEXT nodes in the tree that carry a platform font — for the capture log. */
export function w2wCountPlatformFonts(frame: W2WFrameNode): number {
  let n = 0;
  const walk = (node: W2WNode): void => {
    if (node.type === "TEXT") {
      if (node.platformFont) n++;
      return;
    }
    if (node.type === "FRAME") for (const c of node.children) walk(c);
  };
  walk(frame);
  return n;
}

/**
 * Each tagged host's OWN text — its direct child text nodes joined — keyed by
 * `data-w2w-idx`, in one round trip.
 *
 * Direct children only, deliberately: the captured TEXT children of a host
 * come from exactly those nodes (`extractTextNodes` runs on `el.childNodes`),
 * and every descendant element with text is a host of its own. `textContent`
 * would drag in nested and hidden text and fail the comparison for nothing.
 *
 * Returns undefined when the page cannot be read, and the caller then assigns
 * unguarded — the guard is an improvement on a capture, never a precondition.
 */
export async function w2wReadHostText(client: {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
}): Promise<Map<number, string> | undefined> {
  try {
    const result = await client.send<{ result: { value?: Array<[string, string]> } }>(
      "Runtime.evaluate",
      {
        expression: `
          Array.from(document.querySelectorAll('[data-w2w-idx]')).map((el) => [
            el.getAttribute('data-w2w-idx'),
            Array.from(el.childNodes)
              .filter((n) => n.nodeType === 3)
              .map((n) => n.textContent)
              .join(''),
          ])
        `,
        returnByValue: true,
      },
    );
    const pairs = result?.result?.value;
    if (!Array.isArray(pairs)) return undefined;
    const out = new Map<number, string>();
    for (const [idx, text] of pairs) {
      const n = parseInt(idx, 10);
      if (Number.isFinite(n)) out.set(n, String(text ?? ""));
    }
    return out;
  } catch {
    return undefined;
  }
}

// w2wFindHoverCandidates imported from @w2w/shared (shared between Extension and API)
