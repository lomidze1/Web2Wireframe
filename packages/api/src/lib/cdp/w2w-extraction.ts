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

import { getContentScriptBundle } from "@w2w/shared/content-script-bundle";
import {
  buildResourceGraph,
  getResourceBase64,
  collectImageUrlsFromW2W,
  extractCSSVariables,
  parseFontFaceRules,
  getResourceText,
  w2wFindHoverCandidates,
  attachHoverToDescendants,
} from "@w2w/shared";

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
  } = options;

  // Note: Emulation domain doesn't have .enable — it's always available
  const client = await createCDPClient(page, {
    domains: ["DOM", "CSS", "Page", "Runtime"],
  });

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

    // --- 2. Reload + wait for dynamic content ---
    await client.send("Page.reload", { ignoreCache: false });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Auto-scroll for lazy content
    await autoScrollPage(client);

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

    // --- 4. Inject content script bundle ---
    const bundleCode = getContentScriptBundle();
    await page.evaluate(bundleCode);

    // --- 5. Call extractPage() ---
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const extractResult = await page.evaluate(() => {
      // Runs in browser context — window is available
      const extractFn = (globalThis as Record<string, unknown>).__w2w_extractPage as (() => unknown) | undefined;
      if (typeof extractFn !== "function") {
        throw new Error("Content script bundle not injected properly");
      }
      return extractFn();
    }) as { doc: W2WDocMeta; frame: W2WFrameNode; textHostCount: number };
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

    const { doc, frame, textHostCount } = extractResult;
    console.log(`[W2W] DOM extracted: ${countNodes(frame)} nodes, ${textHostCount} text hosts`);

    // --- 6. Platform fonts via CDP ---
    const fontsByIdx = new Map<number, { familyName: string; postScriptName: string }>();
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
            }
          }
        } catch {
          // Skip elements that can't be queried
        }
      }

      // Enrich TEXT nodes with platform font info
      enrichAllTextNodes(frame, fontsByIdx);
      console.log(`[W2W] Platform fonts collected: ${fontsByIdx.size} elements`);
    }

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
      // Extract @font-face rules from stylesheets
      for (const stylesheet of resourceGraph.stylesheets) {
        try {
          const cssText = await getResourceText(client, stylesheet);
          if (!cssText) continue;
          const faces = parseFontFaceRules(cssText, stylesheet.url);
          for (const face of faces) {
            const cleanSrc = face.src.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, "$1").trim();
            w2wFonts.push({
              fontFamily: face.family,
              fontWeight: String(face.weight),
              fontStyle: face.style,
              platformFontFamily: face.family,
              src: cleanSrc || face.src,
            });
          }
        } catch {
          // Skip failed stylesheet extraction
        }
      }

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

      console.log(`[W2W] Fonts extracted: ${w2wFonts.length} @font-face rules`);
    }

    // --- 9. CSS variables ---
    const rawCSSVariables = await extractCSSVariables(client);
    const cssVariables: W2WCSSVariable[] = rawCSSVariables.map((v) => ({
      name: v.name,
      value: v.value,
      rawValue: v.rawValue,
      category: categorizeCSSVariable(v.name, v.value),
    }));

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
    await client.detach().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Auto-scroll the page to trigger lazy-loaded content. */
async function autoScrollPage(client: { send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T> }): Promise<void> {
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
function enrichAllTextNodes(
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
              (child as W2WTextNode).platformFont = {
                familyName: font.familyName,
                postScriptName: font.postScriptName,
              };
              (child as W2WTextNode).font = font.familyName;
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
