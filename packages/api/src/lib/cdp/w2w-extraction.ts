/* eslint-disable no-console -- `[W2W]` traces are the primary diagnostic
 * surface for Puppeteer + CDP extraction issues; silenced in prod by
 * gateConsoleInProduction() in src/index.ts. */

/**
 * W2W Content Script Extraction for Puppeteer
 *
 * Mirrors the Browser Extension's handleCapturePageW2W() orchestration,
 * but uses Puppeteer's page.evaluate() instead of chrome.tabs.sendMessage().
 *
 * Flow:
 * 1. Viewport setup (Emulation.setDeviceMetricsOverride)
 * 2. Page navigation / reload + auto-scroll for lazy content
 * 3. Scrollbar compensation
 * 4. Inject content script bundle → page.evaluate()
 * 5. Call extractPage() → W2WFrameNode tree
 * 6. Platform fonts via CDP (CSS.getPlatformFontsForNode)
 * 7. Asset extraction from browser cache (Page.getResourceContent)
 * 8. Font @font-face extraction
 * 9. CSS variables extraction
 * 10. Return W2WCaptureResult-like object
 */

import type { Page } from "puppeteer";
import { createCDPClient } from "./client.js";
import { waitForNetworkSettled } from "./network-settle.js";
import { perfMark } from "../../utils/stageTimer.js";

import { getContentScriptBundle } from "@w2w/shared/content-script-bundle";
import {
  buildResourceGraph,
  getResourceBase64,
  collectImageUrlsFromW2W,
  extractCSSVariables,
  parseFontFaceRules,
  isObfuscatedFont,
  collectStyleSheetHeaders,
  getStyleSheetText,
  getResourceText,
  w2wFindHoverCandidates,
  attachHoverToDescendants,
  orderUrlsByInstallability,
  W2W_HYDRATION_EXPRESSION,
  W2W_HYDRATION_TIMEOUT_MS,
  captureTaintedCanvases,
} from "@w2w/shared";
import { normalizeFontPayload } from "../fonts/decompressFont.js";

import type {
  W2WFrameNode,
  W2WTextNode,
  W2WNode,
  W2WDocMeta,
  W2WAssetEntry,
  W2WCSSVariable,
  W2WFontEntry,
} from "@w2w/shared";

/** Minimal shape for collectImageUrlsFromW2W — avoids strict W2WStyles incompatibility */
type W2WAssetTreeNode = { type: string; $url?: string; styles?: Record<string, string | number>; children?: W2WAssetTreeNode[] };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface W2WExtractionResult {
  doc: W2WDocMeta;
  frame: W2WFrameNode;
  assets: Record<string, W2WAssetEntry>;
  fonts: W2WFontEntry[];
  cssVariables: W2WCSSVariable[];
  url: string;
  width: number;
}

export interface W2WExtractionOptions {
  viewportWidth?: number;
  captureAssets?: boolean;
  captureFonts?: boolean;
  /**
   * Skip the `Page.reload` step. Required for the raw-HTML path, where the
   * document is injected via `page.setContent()` and the URL stays
   * `about:blank` — reloading that wipes the content and leaves an empty body.
   * The URL path (`page.goto`) keeps reload so fonts re-download with
   * `ignoreCache`.
   */
  skipReload?: boolean;
  /**
   * Font bytes already captured by a collector the caller attached BEFORE
   * navigating (see `collectFontResponses`). Supplying this makes the
   * cache-busting reload unnecessary — the fonts were caught on the first
   * load — and extraction keeps appending to the same map, so anything
   * fetched later (auto-scroll, lazy `@font-face`) is captured too.
   *
   * Omit it and behaviour is exactly as before: own collector + reload.
   */
  prefetchedFonts?: Map<string, FontBytes>;
}

/** One font response captured off the network. */
export interface FontBytes {
  buffer: Buffer;
  mimeType: string;
}

/** Handle for a font collector attached to a page. */
export interface FontResponseCollector {
  /** URL → bytes. Filled as responses arrive; safe to read after settle. */
  buffers: Map<string, FontBytes>;
  /** Remove the listener. Always call it — listeners keep the page alive. */
  detach: () => void;
}

/**
 * Watch a page's responses and buffer every font body.
 *
 * Why not `Page.getResourceContent` later: it answers "Resource was not
 * cached" for many sites (Chromium evicts response bodies under memory
 * pressure), and re-fetching server-side often trips Cloudflare 429 when 20
 * `@font-face` rules are pulled in a burst. Capturing at response time costs
 * no extra HTTP traffic and no replay.
 *
 * Attach this BEFORE `page.goto` to catch fonts on the first load — that is
 * what lets the caller skip the cache-busting reload entirely.
 */
export function collectFontResponses(
  page: Page,
  into: Map<string, FontBytes> = new Map(),
): FontResponseCollector {
  const listener = (response: import("puppeteer").HTTPResponse): void => {
    if (!response.ok()) return; // Skip 4xx/5xx — no usable body
    const url = response.url();
    const lowerUrl = url.split("?")[0].toLowerCase();
    const ext = lowerUrl.split(".").pop() || "";
    const mime = response.headers()["content-type"] || "";
    const isFontByExt = ext === "woff2" || ext === "woff" || ext === "ttf" || ext === "otf";
    const isFontByMime = mime.startsWith("font/") || mime.includes("font-");
    if (!isFontByExt && !isFontByMime) return;
    response
      .buffer()
      .then((buf) => {
        into.set(url, { buffer: buf, mimeType: mime || guessMimeFromUrl(url) });
      })
      .catch(() => { /* response body may have been discarded */ });
  };
  page.on("response", listener);
  return { buffers: into, detach: () => page.off("response", listener) };
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract page content using the W2W content script via Puppeteer.
 *
 * This produces the same W2WFrameNode tree as the Browser Extension,
 * ensuring pixel-identical output regardless of import path.
 */
export async function extractWithContentScript(
  page: Page,
  options: W2WExtractionOptions = {},
): Promise<W2WExtractionResult> {
  const {
    viewportWidth = 1440,
    captureAssets = true,
    captureFonts = true,
    skipReload = false,
  } = options;

  let t = Date.now();

  // Note: Emulation domain doesn't have .enable — it's always available
  const client = await createCDPClient(page, {
    domains: ["DOM", "CSS", "Page", "Runtime"],
  });

  // Font bytes captured off the network. When the caller pre-attached a
  // collector before navigation (see `collectFontResponses`), we keep filling
  // the SAME map — so fonts fetched during the initial load and during
  // auto-scroll both land in one place.
  const networkFontBuffers = options.prefetchedFonts ?? new Map<string, FontBytes>();
  // When the caller handed us its map, its listener is still attached and keeps
  // filling the very same map for the rest of extraction (auto-scroll, lazy
  // `@font-face`). Attaching a second one here would just buffer every font
  // response twice, so only attach when we weren't given one.
  const localCollector = options.prefetchedFonts
    ? null
    : collectFontResponses(page, networkFontBuffers);

  try {
    // --- 1. Viewport Setup ---
    const dprResult = await client.send<{ result: { value: number } }>(
      "Runtime.evaluate",
      { expression: "window.devicePixelRatio", returnByValue: true },
    );
    const browserDpr = dprResult.result.value || 1;
    const targetHeight = 900;

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewportWidth,
      height: targetHeight,
      deviceScaleFactor: 1 / browserDpr,
      mobile: viewportWidth <= 768,
      screenWidth: viewportWidth,
      screenHeight: targetHeight,
      positionX: 0,
      positionY: 0,
      screenOrientation: { angle: 0, type: "landscapePrimary" },
    });

    t = perfMark("  viewportSetup", t);

    // --- 2. Reload + wait for dynamic content ---
    // ignoreCache=true forces every resource to re-download, including fonts
    // that the initial page.goto already cached. The response listener
    // attached above can then capture each font's bytes for the download ZIP.
    //
    // Skipped on the raw-HTML path: that document is injected via
    // `page.setContent()` and lives on `about:blank`, so a reload re-fetches
    // the empty blank page and discards every element (empty body downstream).
    //
    // Also skipped when the caller attached the font collector BEFORE
    // navigating (`prefetchedFonts`): the bytes were already captured on the
    // first load, so a second full download buys nothing. Measured on
    // stripe.com this reload plus its settle wait cost 7.7s of a 45.6s capture.
    const needsReloadForFonts = !options.prefetchedFonts;
    if (!skipReload && needsReloadForFonts) {
      await client.send("Page.reload", { ignoreCache: true });
      // `minWaitMs: 1500` ინარჩუნებს ძველ ფიქსირებულ ლოდინს როგორც იატაკს —
      // ვერსად ველოდებით ნაკლებს, ვიდრე აქამდე. სხვაობა ისაა, რომ ნელ საიტზე
      // ახლა რეალურ დამშვიდებას ველოდებით და არა თვითნებურ 1.5 წამს.
      const settle = await waitForNetworkSettled(page, { minWaitMs: 1500 });
      console.log(
        `[W2W] reload settled: ${settle.reason} ${settle.waitedMs}ms stuck=${settle.stuck}`,
      );
    }

    t = perfMark("  reload+settle#2", t);

    // Scrolling is only useful once the page can react to it — see
    // `waitForHydration`. Must stay BEFORE the auto-scroll.
    await waitForHydration(client);
    t = perfMark("  hydration", t);

    // Auto-scroll for lazy content
    await autoScrollPage(client);
    t = perfMark("  autoScroll", t);


    // Force-load every declared @font-face. With `font-display: swap`, faces
    // that aren't used by visible elements at this viewport stay `unloaded`
    // and never enter the browser's resource cache — `Page.getResourceContent`
    // then can't return their bytes when we package the download ZIP. Calling
    // `face.load()` triggers each binary download eagerly so step 8 below can
    // pull them straight from cache.
    await client
      .send("Runtime.evaluate", {
        expression: `
          (async () => {
            const ps = [];
            document.fonts.forEach((f) => {
              if (f.status === 'unloaded') ps.push(f.load().catch(() => {}));
            });
            await Promise.all(ps);
          })()
        `,
        awaitPromise: true,
      })
      .catch(() => { /* page may not expose document.fonts */ });

    // --- 3. Scrollbar compensation ---
    const layoutMetrics = await client.send<{
      layoutViewport: { clientWidth: number; clientHeight: number };
    }>("Page.getLayoutMetrics", {});

    const actualLayoutWidth = layoutMetrics.layoutViewport.clientWidth;
    const scrollbarWidth = viewportWidth - actualLayoutWidth;

    if (scrollbarWidth > 0) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewportWidth + scrollbarWidth,
        height: targetHeight,
        deviceScaleFactor: 1 / browserDpr,
        mobile: viewportWidth <= 768,
        screenWidth: viewportWidth + scrollbarWidth,
        screenHeight: targetHeight,
        positionX: 0,
        positionY: 0,
        screenOrientation: { angle: 0, type: "landscapePrimary" },
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Hide scrollbar via CSS
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

    t = perfMark("  scrollbarCompensation", t);

    // --- 4. Inject content script bundle ---
    const bundleCode = getContentScriptBundle();
    await page.evaluate(bundleCode);
    t = perfMark("  injectBundle", t);

    // --- 5. Call extractPage() ---
     
    const extractResult = await page.evaluate(() => {
      // Runs in browser context — window is available
      const extractFn = (globalThis as Record<string, unknown>).__w2w_extractPage as (() => unknown) | undefined;
      if (typeof extractFn !== "function") {
        throw new Error("Content script bundle not injected properly");
      }
      return extractFn();
    }) as { doc: W2WDocMeta; frame: W2WFrameNode; textHostCount: number };
     

    const { doc, frame, textHostCount } = extractResult;
    console.log(`[W2W] DOM extracted: ${countNodes(frame)} nodes, ${textHostCount} text hosts`);
    t = perfMark("  extractDOM", t);

    // --- 6. Platform fonts via CDP ---
    const fontsByIdx = new Map<number, { familyName: string; postScriptName: string; isCustomFont: boolean }>();
    // Hoist docRoot so it can be reused by both font collection and hover capture
    let docRoot: { root: { nodeId: number } } | null = null;
    if (textHostCount > 0) {
      docRoot = await client.send<{ root: { nodeId: number } }>(
        "DOM.getDocument",
        { depth: -1, pierce: true },
      );
      const idxResult = await client.send<{ nodeIds: number[] }>(
        "DOM.querySelectorAll",
        { nodeId: docRoot.root.nodeId, selector: "[data-w2w-idx]" },
      );

      // One CDP round-trip per text host, and stripe.com has 760 of them —
      // sequentially that measured 2.9s. CDP multiplexes requests over a
      // single websocket, so a bounded fan-out collapses the wall-clock
      // without changing a single result: `fontsByIdx` is keyed by the
      // element's own data-w2w-idx, so completion order is irrelevant.
      const FONT_LOOKUP_CONCURRENCY = 16;
      const readPlatformFont = async (nodeId: number): Promise<void> => {
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
                isCustomFont: primaryFont.isCustomFont,
              });
            }
          }
        } catch {
          // Skip elements that can't be queried
        }
      };

      for (let i = 0; i < idxResult.nodeIds.length; i += FONT_LOOKUP_CONCURRENCY) {
        await Promise.all(
          idxResult.nodeIds
            .slice(i, i + FONT_LOOKUP_CONCURRENCY)
            .map(readPlatformFont),
        );
      }

      // Enrich TEXT nodes with platform font info
      enrichAllTextNodes(frame, fontsByIdx);
      console.log(`[W2W] Platform fonts collected: ${fontsByIdx.size} elements`);
    }

    t = perfMark("  platformFonts", t);

    // --- 6b. Hover State Capture via CDP ---
    // FIX 1: Expand candidate pool with stylesheet-derived :hover triggers
    // in addition to hard-coded interactive tags.
    let hoverSelectorPairs: Array<{ trigger: string; target: string }> = [];
    try {
      hoverSelectorPairs = await page.evaluate(() => {
        const fn = (globalThis as Record<string, unknown>).__w2w_collectHoverSelectors as
          | (() => Array<{ trigger: string; target: string }>)
          | undefined;
        return fn?.() ?? [];
      });
      console.log(`[W2W-HOVER] Collected ${hoverSelectorPairs.length} :hover selectors from stylesheets`);
    } catch (err) {
      console.warn(`[W2W-HOVER] Failed to collect stylesheet selectors:`, err);
    }

    const extraSelectors = hoverSelectorPairs.map((h) => h.trigger);
    const interactiveNodes = w2wFindHoverCandidates(frame, extraSelectors);
    if (interactiveNodes.length > 0) {
      console.log(`[W2W-HOVER] Total hover candidates: ${interactiveNodes.length} (${hoverSelectorPairs.length} from CSS)`);
      console.log(`[W2W] Capturing hover states for ${interactiveNodes.length} interactive elements...`);

      // Ensure we have docRoot for DOM.querySelector
      if (!docRoot) {
        docRoot = await client.send<{ root: { nodeId: number } }>(
          "DOM.getDocument",
          { depth: -1, pierce: true },
        );
      }

      let hoverCount = 0;
      const hoverStartTime = Date.now();
      const HOVER_TIMEOUT_MS = 5000; // 5 second budget for all hover captures

      for (const { node, selector } of interactiveNodes) {
        // Stop if timeout budget exceeded
        if (Date.now() - hoverStartTime > HOVER_TIMEOUT_MS) {
          console.log(`[W2W] Hover capture timeout reached (${HOVER_TIMEOUT_MS}ms), stopping at ${hoverCount} elements`);
          break;
        }

        if (!selector) continue;
        try {
          // Find element in CDP DOM
          const qResult = await client.send<{ nodeId: number }>(
            "DOM.querySelector",
            { nodeId: docRoot.root.nodeId, selector },
          );
          if (!qResult.nodeId) continue;

          // Force :hover pseudo-state via CDP
          await client.send("CSS.forcePseudoState", {
            nodeId: qResult.nodeId,
            forcedPseudoClasses: ["hover"],
          });

          // Small delay for styles to apply (30ms sufficient for CSS recalc)
          await new Promise((r) => setTimeout(r, 30));

          // Re-extract subtree via content script (same as Browser Extension's EXTRACT_SUBTREE)
          const hoverResult = await page.evaluate((sel: string) => {
            const fn = (globalThis as Record<string, unknown>).__w2w_extractSubtree as
              | ((s: string) => unknown)
              | undefined;
            if (typeof fn !== "function") return null;
            return fn(sel);
          }, selector);

          // Clear forced state
          await client.send("CSS.forcePseudoState", {
            nodeId: qResult.nodeId,
            forcedPseudoClasses: [],
          });

          if (hoverResult) {
            node.hover = hoverResult as W2WFrameNode;
            // FIX 4: propagate hover to descendants
            attachHoverToDescendants(node, node.hover);
            hoverCount++;
          }
        } catch {
          // Skip elements that fail hover capture
        }
      }
      console.log(`[W2W] Hover states captured: ${hoverCount}`);
    }

    // Cleanup data-w2w-idx markers (after hover capture — markers needed for selectors)
    await page.evaluate(() => {
      const cleanupFn = (globalThis as Record<string, unknown>).__w2w_cleanupMarkers as (() => void) | undefined;
      if (typeof cleanupFn === "function") {
        cleanupFn();
      }
    });

    t = perfMark("  hover", t);

    // --- 6c. Tainted <canvas> via compositor screenshot ---
    // Last of the layout-touching steps: `captureBeyondViewport` resizes the
    // viewport for the duration of each shot, so nothing that reads geometry
    // may run after it.
    await captureTaintedCanvases(client, frame);
    t = perfMark("  canvasShots", t);

    // --- 7 & 8. Asset + Font extraction from browser cache ---
    const assets: Record<string, W2WAssetEntry> = {};
    const w2wFonts: W2WFontEntry[] = [];

    // Single resource graph for both assets and fonts
    const resourceGraph = await buildResourceGraph(client);

    if (captureAssets) {
      const imageUrls = collectImageUrlsFromW2W(frame as W2WAssetTreeNode);

      for (const url of imageUrls) {
        if (url.startsWith("data:")) continue;

        // 1. Try exact URL match in resource graph
        let resEntry = resourceGraph.entries.get(url);

        // 2. Fallback: try URL without query params
        if (!resEntry) {
          try {
            const cleanUrl = new URL(url).origin + new URL(url).pathname;
            if (cleanUrl !== url) {
              resEntry = resourceGraph.entries.get(cleanUrl);
            }
          } catch { /* invalid URL */ }
        }

        // 3. Fallback: fuzzy match by pathname suffix
        if (!resEntry) {
          try {
            const pathname = new URL(url).pathname;
            for (const [key, entry] of resourceGraph.entries) {
              try {
                if (new URL(key).pathname === pathname) {
                  resEntry = entry;
                  break;
                }
              } catch { /* skip */ }
            }
          } catch { /* invalid URL */ }
        }

        if (resEntry) {
          try {
            const base64 = await getResourceBase64(client, resEntry);
            if (base64) {
              assets[url] = {
                base64Encoded: true,
                content: base64,
                mimeType: resEntry.mimeType,
              };
            }
          } catch {
            // Skip failed assets
          }
        } else {
          // 4. Direct CDP fallback: try Page.getResourceContent with main frameId
          try {
            const result = await client.send<{ content: string; base64Encoded: boolean }>(
              "Page.getResourceContent",
              { frameId: resourceGraph.frameId, url },
            );
            if (result.content) {
              const content = result.base64Encoded ? result.content : Buffer.from(result.content).toString("base64");
              const mime = guessMimeFromUrl(url);
              assets[url] = {
                base64Encoded: true,
                content,
                mimeType: mime,
              };
              console.log(`[W2W]   Fallback CDP fetch succeeded: ${url.substring(0, 80)}`);
            }
          } catch {
            console.log(`[W2W]   Asset not found: ${url.substring(0, 80)}`);
          }
        }
      }
      console.log(`[W2W] Assets extracted: ${Object.keys(assets).length}`);
    }

    if (captureFonts) {
      // @font-face rules come from two independent sources — neither alone
      // covers every site:
      //
      //   1. CSS domain (`CSS.styleSheetAdded` + `CSS.getStyleSheetText`) —
      //      sees inline <style> and cross-origin sheets. On stripe.com this
      //      is the ONLY source that finds anything (6 sheets → 3 faces).
      //   2. Resource graph (`Page.getResourceContent`) — sheets that rode
      //      the page as cached documents. Finds 0 on stripe.com.
      //
      // Both feed the same collector, deduplicated by family+weight+style+src
      // so the binary-binding pass below never fetches the same face twice.
      const seenFaces = new Set<string>();
      const collectFaces = (cssText: string, sourceUrl: string): void => {
        for (const face of parseFontFaceRules(cssText, sourceUrl)) {
          const cleanSrc = face.src.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, "$1").trim();
          const src = cleanSrc || face.src;
          const key = `${face.family}|${face.weight}|${face.style}|${src}`;
          if (seenFaces.has(key)) continue;
          seenFaces.add(key);
          w2wFonts.push({
            fontFamily: face.family,
            fontWeight: String(face.weight),
            fontStyle: face.style,
            platformFontFamily: face.family,
            src,
          });
        }
      };

      // Source 1 — CSS domain
      const sheetHeaders = await collectStyleSheetHeaders(client);
      for (const header of sheetHeaders) {
        try {
          const cssText = await getStyleSheetText(client, header.styleSheetId);
          if (cssText) collectFaces(cssText, header.sourceURL || page.url());
        } catch {
          // Sheet vanished between announcement and read — skip it.
        }
      }
      const facesFromCSSDomain = w2wFonts.length;

      // Source 2 — resource graph
      for (const stylesheet of resourceGraph.stylesheets) {
        try {
          const cssText = await getResourceText(client, stylesheet);
          if (cssText) collectFaces(cssText, stylesheet.url);
        } catch {
          // Skip failed stylesheet extraction
        }
      }

      console.log(
        `[W2W] Stylesheets: ${sheetHeaders.length} via CSS domain, ` +
        `${resourceGraph.stylesheets.length} via resource graph ` +
        `(@font-face: ${facesFromCSSDomain} + ${w2wFonts.length - facesFromCSSDomain})`,
      );

      // Extract font binaries from browser cache
      for (const fontEntry of resourceGraph.fonts) {
        if (assets[fontEntry.url]) continue;
        try {
          const base64 = await getResourceBase64(client, fontEntry);
          if (base64) {
            assets[fontEntry.url] = {
              base64Encoded: true,
              content: base64,
              mimeType: fontEntry.mimeType,
            };
          }
        } catch {
          // Skip failed font extraction
        }
      }

      // Bind a binary onto each W2WFontEntry. The plugin's "Download fonts
      // (.zip)" path needs `fontBase64` on the font itself — without it, the
      // plugin falls back to fetching the URL inside Figma's sandbox, which
      // CSP blocks for any host outside `api.web2wireframe.design`.
      //
      // Three strategies, first match wins:
      //   1. assets[url]      — already in the browser cache (fastest)
      //   2. Page.getResourceContent(mainFrameId, url) — bypasses the
      //      resourceGraph index for fonts that loaded but weren't enumerated
      //      (font-display: swap with late onload, etc.)
      //   3. Server-side fetch — no CSP, no CORS in Node. Final safety net for
      //      fonts the browser never actually cached during render.
      const bareUrlRegex = /https?:\/\/[^\s'"),]+/g;
      const mainFrameId = resourceGraph.frameId;
      let boundCount = 0;
      let strategy0Count = 0;
      let strategy3Count = 0;
      let decompressedCount = 0;

      // Stamp a captured buffer onto the font entry, decompressing WOFF2 →
      // TTF/OTF along the way so the resulting ZIP is installable on macOS
      // Font Book and Windows. The original (pre-decompression) bytes still
      // get mirrored into `assets[url]` keyed by the network URL, since that
      // map is keyed by URL whose extension implies its content.
      const stampFont = async (
        font: W2WFontEntry,
        url: string,
        originalBuffer: Buffer,
        originalMime: string,
      ) => {
        const originalContent = originalBuffer.toString("base64");
        // Mirror raw bytes into the URL-keyed asset map so any consumer
        // looking up the URL gets the on-the-wire format.
        assets[url] = {
          base64Encoded: true,
          content: originalContent,
          mimeType: originalMime,
        };
        const normalized = await normalizeFontPayload(originalBuffer, url);
        font.fontBase64 = normalized.buffer.toString("base64");
        font.fontMimeType = normalized.mimeType;
        font.format = normalized.format;
        // Real names from the SFNT `name` table — what the OS Font Book and
        // Figma's font cache will actually surface after install. Some
        // foundries stamp "." or other single-char placeholders as an
        // anti-piracy marker (paulstamatiou's PSC fonts do this); using them
        // verbatim would yield hidden-file names like `.-Regular.ttf`. We
        // gate on length ≥ 2 *and* the presence of at least one letter, so
        // anything purely punctuation/numeric falls back to the CSS family.
        if (isUsableFontName(normalized.names.family)) {
          font.realFamily = normalized.names.family;
        }
        if (isUsableFontName(normalized.names.subfamily)) {
          font.realSubfamily = normalized.names.subfamily;
        }
        if (normalized.buffer !== originalBuffer) decompressedCount++;
      };

      for (const font of w2wFonts) {
        if (!font.src || font.fontBase64) continue;
        // Best-installable candidates first (TTF/OTF → woff2 → woff → EOT
        // last). The bulletproof @font-face pattern declares the IE-only
        // .eot URL first; binding in declaration order stamped EOT bytes —
        // whose name table normalizeFontPayload can't read → no realFamily,
        // and macOS/Windows can't install them (telex.ge shipped exactly
        // this). Same ordering as shared's extractFontBinaries.
        const urls = orderUrlsByInstallability(font.src.match(bareUrlRegex) || []);

        for (const url of urls) {
          // Strategy 0: live network capture (primary path).
          // Listener attached at function entry buffers every font response
          // received during page render — bypasses Chromium body-eviction
          // and avoids any extra HTTP traffic.
          const captured = networkFontBuffers.get(url);
          if (captured) {
            await stampFont(font, url, captured.buffer, captured.mimeType);
            strategy0Count++;
            break;
          }

          // Strategy 1: assets cache (image-pipeline already populated it).
          // We have base64 here, not a buffer — round-trip through Buffer so
          // stampFont can re-detect format and decompress if needed.
          const asset = assets[url];
          if (asset?.base64Encoded) {
            const buf = Buffer.from(asset.content, "base64");
            await stampFont(font, url, buf, asset.mimeType ?? guessMimeFromUrl(url));
            break;
          }

          // Strategy 2: direct CDP fetch from main frame. Often fails with
          // "Resource was not cached" because Chromium evicts response bodies
          // under memory pressure — kept as a cheap retry just in case.
          if (!font.fontBase64 && mainFrameId) {
            try {
              const result = await client.send<{ content: string; base64Encoded: boolean }>(
                "Page.getResourceContent",
                { frameId: mainFrameId, url },
              );
              if (result.content) {
                const buf = result.base64Encoded
                  ? Buffer.from(result.content, "base64")
                  : Buffer.from(result.content);
                await stampFont(font, url, buf, guessMimeFromUrl(url));
                break;
              }
            } catch {
              // Fall through to strategy 3.
            }
          }

          // Strategy 3: server-side HTTP fetch. Last-resort safety net for
          // fonts that didn't ride the page (e.g. injected dynamically after
          // our extraction window). Browser UA + Referer dodge most WAFs.
          if (!font.fontBase64) {
            try {
              const response = await fetch(url, {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  Accept: "*/*",
                  Referer: new URL(url).origin + "/",
                },
              });
              if (response.ok) {
                const buf = Buffer.from(await response.arrayBuffer());
                await stampFont(font, url, buf, guessMimeFromUrl(url));
                strategy3Count++;
                break;
              }
            } catch {
              // Network failure — leave font without binary; the plugin will
              // surface it as a skipped entry in the ZIP warning.
            }
          }
        }

        if (font.fontBase64) boundCount++;
      }

      console.log(
        `[W2W] Fonts extracted: ${w2wFonts.length} @font-face rules, ` +
        `bound binaries: ${boundCount}/${w2wFonts.length} ` +
        `(net=${strategy0Count}, fetch=${strategy3Count}, ` +
        `woff2→ttf/otf decompressed=${decompressedCount})`,
      );
    }

    t = perfMark("  assets+fonts", t);

    // --- 9. CSS variables ---
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariables: W2WCSSVariable[] = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

    t = perfMark("  cssVariables", t);

    // --- Cleanup ---
    await client.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});

    const pageUrl = page.url();

    return {
      doc,
      frame,
      assets,
      fonts: deduplicateW2WFonts(w2wFonts),
      cssVariables,
      url: pageUrl,
      width: viewportWidth,
    };
  } finally {
    localCollector?.detach();
    await client.detach().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the page to finish booting before anything scrolls it.
 *
 * Scroll-reveal content — `opacity: 0` until an IntersectionObserver flips a
 * class on it — is released by an observer that a client-rendered page only
 * attaches after hydration. `waitForNetworkSettled` can return well before
 * that: the bytes have arrived, but React has not run. Auto-scrolling then
 * walks the whole page past an observer that does not exist yet, and after the
 * scroll returns to the top every reveal is still transparent — which the
 * plugin deletes, subtree and all.
 *
 * Measured on glinc.io at 6x CPU throttle + slow network (standing in for
 * Render's cold, shared CPU), 24 runs per arm:
 *
 *   without this wait   14 clean / 10 lost content
 *   with this wait      24 clean /  0 lost content
 *
 * The wait itself averaged ~270ms, because on a page that is already idle every
 * step below resolves immediately. Bounded at every step and never throws: a
 * capture must not fail because the page would not go quiet.
 */
export async function waitForHydration(client: {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
}): Promise<void> {
  try {
    await client.send("Runtime.evaluate", {
      // Shared with the extension's capture path — the two ran different waits
      // for a while and only this one was fixed, which left every extension
      // capture losing the scroll-reveal content this exists to save.
      expression: W2W_HYDRATION_EXPRESSION,
      awaitPromise: true,
      timeout: W2W_HYDRATION_TIMEOUT_MS,
    });
  } catch {
    // A page that never goes idle is still worth capturing.
  }
}

/**
 * Ask the page to render as if the visitor had asked for less motion.
 *
 * `waitForHydration` + `autoScrollPage` handle animations that latch: an
 * IntersectionObserver flips a class once and the content stays revealed.
 * Scroll-*progress* animations do not latch. The site writes a 0..1 variable
 * that tracks the scroll position both ways, so `autoScrollPage`'s closing
 * `window.scrollTo(0, 0)` rewinds every one of them to its opening frame,
 * moments before we extract.
 *
 * stripe.com's usage chart is the measured case (headless Chromium, 1440x900,
 * our own content-script bundle). `.billing-plan-graphic__bar` reads
 * `transform: scaleY(calc(var(--bar-target-scale) * var(--progress-in-window)))`,
 * and `--progress` is an inline style Stripe's script keeps in sync with the
 * scroll:
 *
 *   after load, scrollY 0        --progress 0   31 bars at 4.27 x 0
 *   after the auto-scroll loop   --progress 1   7, 12, 23, 33, 47, 67 ...
 *   after scrollTo(0, 0)         --progress 0   31 bars at 4.27 x 0  <- we extract here
 *
 * Zero-height boxes are then dropped by treeSimplify's DEGENERATE test, so the
 * chart arrives in Figma as an empty 306x149 box.
 *
 * Under `prefers-reduced-motion: reduce` Stripe's own script jumps straight to
 * the finished state at page top, before anything scrolls, and never rewinds —
 * all 31 bars land on 100% of their target height, which is closer than h2d
 * gets (h2d relies on not resetting the scroll, which leaves its last four bars
 * ~25% short). Cost on the same page: 52 of 2916 elements differ from a normal
 * capture — the 31 bars, three more nodes of the same widget, a marquee frozen
 * at a defined offset, and an invisible animated checkmark. Element counts are
 * identical, and linear.app / vercel.com / telex.ge / apple.com showed no
 * difference beyond run-to-run noise.
 *
 * Must be called BEFORE navigation: a site reads `matchMedia` when it boots.
 * Puppeteer re-applies the override across navigations and reloads, so one call
 * per page covers the whole capture. Never throws — a page that will not
 * emulate is still worth capturing.
 */
export async function emulateReducedMotion(page: {
  emulateMediaFeatures: (
    features: Array<{ name: string; value: string }>,
  ) => Promise<void>;
}): Promise<void> {
  try {
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
  } catch {
    // Emulation is an improvement, never a precondition.
  }
}

/** Auto-scroll the page to trigger lazy-loaded content. */
async function autoScrollPage(client: { send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T> }): Promise<void> {
  const scrollDelay = 100;
  const maxScrollTime = 30000;

  try {
    await client.send("Runtime.evaluate", {
      expression: `
        (async () => {
          // Step just under one viewport so every band of the page is inside
          // the viewport at some sample — IntersectionObserver reports the
          // state at the landing position, so a step LARGER than the viewport
          // would skip lazy content entirely. The old fixed 400px stepped
          // through a 900px viewport twice as often as needed: 4.8s of
          // stripe.com's capture went here.
          const scrollStep = Math.max(200, window.innerHeight - 100);
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
    await client.send("Runtime.evaluate", {
      expression: "window.scrollTo(0, 0)",
    }).catch(() => {});
  }
}

/** Count total nodes in a W2W tree. */
function countNodes(node: W2WNode): number {
  let count = 1;
  if (node.type === "FRAME" && node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * Enrich all TEXT nodes with platform fonts by walking the tree in DFS order.
 * Matches the Browser Extension's w2wEnrichAllTextNodes().
 */
export function enrichAllTextNodes(
  frame: W2WFrameNode,
  fontsByIdx: Map<number, { familyName: string; postScriptName: string; isCustomFont: boolean }>,
): void {
  let idx = 0;

  function walk(node: W2WNode): void {
    if (node.type === "FRAME") {
      const hasTextChildren = node.children.some((c) => c.type === "TEXT");
      if (hasTextChildren) {
        const font = fontsByIdx.get(idx);
        // A malformed `name` table can put legal text where the family name
        // belongs — stripe.com measures as familyName "Copyright Klim Type
        // Foundry" / postScriptName "SohneVF-Buch". The isCustomFont gate
        // below can't catch it (it IS a real web font), so the string used to
        // reach the user as a font name. Ignore the measurement entirely and
        // let the CSS-declared family stand, same as tree-builder does.
        const trustworthy =
          font && !isObfuscatedFont({ ...font, glyphCount: 1 });
        if (font && trustworthy) {
          for (const child of node.children) {
            if (child.type === "TEXT") {
              (child as W2WTextNode).platformFont = {
                familyName: font.familyName,
                postScriptName: font.postScriptName,
              };
              // Only a real web font (@font-face-loaded) may replace the
              // CSS-declared family. On the Linux server, system fallbacks
              // (Liberation Sans, Noto Sans CJK …) come back as platform
              // fonts for any family without a custom face — stamping them
              // here would send the plugin an un-installable family and
              // strand its Re-apply markers forever.
              if (font.isCustomFont) {
                (child as W2WTextNode).font = font.familyName;
              }
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

/** Deduplicate W2W font entries by family+weight+style. */
function deduplicateW2WFonts(fonts: W2WFontEntry[]): W2WFontEntry[] {
  const seen = new Set<string>();
  return fonts.filter((f) => {
    const key = `${f.fontFamily.toLowerCase()}|${f.fontWeight}|${f.fontStyle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Categorize a CSS variable by its name and value. */
function categorizeCSSVariable(name: string, value: string): string {
  const n = name.toLowerCase();
  const v = value.toLowerCase();

  if (n.includes("color") || n.includes("bg") || n.includes("text") ||
    /^(rgb|hsl|#[0-9a-f])/.test(v)) {
    return "color";
  }
  if (n.includes("font") || n.includes("type")) return "typography";
  if (n.includes("space") || n.includes("gap") || n.includes("padding") ||
    n.includes("margin") || n.includes("radius")) {
    return "spacing";
  }
  if (n.includes("shadow") || n.includes("blur")) return "effect";
  if (n.includes("breakpoint") || n.includes("width") || n.includes("height")) return "layout";
  if (n.includes("z-index") || n.includes("zindex")) return "layout";
  if (n.includes("duration") || n.includes("timing") || n.includes("transition") ||
    n.includes("animation")) {
    return "animation";
  }
  return "other";
}

/** Guess MIME type from URL file extension. */
/**
 * Whether a parsed SFNT name string is worth surfacing to the consumer.
 * Some commercial foundries deliberately stamp short placeholders ("." or
 * "X") as a piracy deterrent. Using such values verbatim produces
 * surprising filenames (hidden files on Unix) and a marker the rebind
 * action will pass to `loadFontAsync` only to fail. We require at least
 * two characters AND one letter — covers Latin / common scripts; anything
 * shorter or letter-free isn't usable as a font identifier.
 */
function isUsableFontName(s: string | undefined): s is string {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (trimmed.length < 2) return false;
  return /[A-Za-z]/.test(trimmed);
}

function guessMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".svg")) return "image/svg+xml";
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".avif")) return "image/avif";
  if (lower.includes(".ico")) return "image/x-icon";
  return "image/png";
}
