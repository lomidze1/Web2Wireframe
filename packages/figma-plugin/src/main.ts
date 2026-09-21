/**
 * Web2Wireframe Figma Plugin - Main Entry Point
 *
 * This file handles:
 * - Plugin UI initialization
 * - Message handling from UI
 * - Wireframe rendering orchestration
 *
 * All rendering logic has been modularized into:
 * - types/index.ts - Type definitions
 * - rendering/colors.ts - Color utilities
 * - rendering/gradients.ts - Gradient parsing
 * - rendering/layout.ts - Layout conversion
 * - rendering/fills.ts - Fill/stroke/effect conversion
 * - rendering/styles.ts - Style linking and creation
 * - rendering/text.ts - Text node creation
 * - rendering/placeholders.ts - Image placeholders
 * - rendering/nodes.ts - Frame/node creation
 */

import { showUI } from "@create-figma-plugin/utilities";
import { installDevLogger } from "./utils/devLogger";
import { logger } from "./utils/logger";
import * as perf from "./utils/perf";
import { errorHandler, ErrorCode } from "./utils/errorHandler";
import type {
  WireframeFrame,
  WireframeNode,
  RenderContext,
  FontMapping,
  RenderWireframeData,
} from "./types";
import {
  normalizeColorForLookup,
  createPluginColorStyles,
  createUnifiedWebsiteColorStyles,
  createTextStyles,
  createEffectStyles,
  createGridStyles,
  createWireframeFrame,
} from "./rendering";
import { convertW2WToWireframe } from "./rendering/css-converter";
import { planOversizedImages } from "./utils/figmaImageLimit";
import { finishFilteredImages, planFilteredImages } from "./utils/filteredImages";
import { resetFontFailures } from "./rendering/fontLoader";
import { extractHostname } from "./rendering/hostname";
import {
  createAnchorScope,
  resolveAnchorReactions,
  registerFlowStartingPoints,
} from "./rendering/anchorLinks";
import {
  buildNotifySummary,
  buildRelaunchSummary,
  recordWarning,
} from "./rendering/diagnostics";
import {
  collectAllFonts,
  collectFontStacks,
  collectFontUsage,
  checkFontsAvailability,
  filterMissingCutsToDeclared,
  buildFontsNotAvailableMessage,
  buildDownloadCuts,
  buildPluginModeFontMapping,
  partitionMissingFonts,
  buildChoiceRenderPlan,
  resolveStackFallbacks,
} from "./utils/fontUtils";
import {
  prePassConvertFrames,
  isPlaceholderTree,
} from "./utils/preprocessFrames";
import {
  rebindOriginalFonts,
  collectTextNodesIn,
  composeRebindablePayload,
  countRebindableNodes,
  type RebindableCount,
} from "./rendering/rebindFonts";
import { collectTextNodesChunked } from "./rendering/rebindScan";
import { countNodes } from "./rendering/treeSimplify";
import {
  nodeProgressPercent,
  shouldEmitNodeProgress,
} from "./utils/importProgress";

/**
 * clientStorage key + window for the loader's capture-duration history, kept
 * per import kind (`{ url: [...], file: [...] }`) — a two-second `.w2w` decode
 * must not become a URL capture's estimate. Deliberately NOT part of
 * `w2w_plugin_config`: that shape is snapshot on first open and changing it
 * needs a CONFIG_VERSION migration.
 */
const TIMING_KEY = "w2w_import_timing";
const TIMING_SAMPLES = 5;

/**
 * Dev profiler helper: tally the converted tree by node type so the stage
 * timings can be read as ms/node. Walk-only — it never touches the render
 * path, so it stays out of the hot loop.
 */
function countTreeNodes(node: WireframeNode | null | undefined): void {
  if (!node) return;
  perf.count("nodes", 1);
  if (node.type === "text") perf.count("textNodes", 1);
  else if (node.type === "placeholder") perf.count("imageNodes", 1);
  for (const child of node.children || []) countTreeNodes(child);
}

// ============================================================================
// Main Plugin Function
// ============================================================================

export default function () {
  if (__W2W_DEV_LOG__) installDevLogger();
  showUI({ width: 410, height: 560 });

  // Pending render state for font fallback popup flow
  let pendingRenderData: {
    data: RenderWireframeData;
    executeRender: (font: string, fontMapping?: FontMapping, originalFontNames?: FontMapping) => Promise<void>;
    missingFonts: string[];
    /** Missing CSS families already installed under their real (SFNT) name —
     *  resolved silently via marker + rebind, never shown in the modal. */
    autoOriginal: FontMapping;
  } | null = null;

  // Dev profiler: wall-clock start of the current import, so the stage table
  // can be compared against the time the user actually waited.
  let renderStartedAt = 0;

  // Count text nodes on the current page still awaiting original-font re-apply
  // (they carry a non-empty `w2w_original_font` marker — imported with a
  // substituted font). The UI uses this to conditionally show the
  // "Re-apply fonts" footer button only when there's actually work to do.
  //
  // The walk is chunked and cancellable (see rendering/rebindScan.ts): a page
  // holding a dozen imported sites is hundreds of thousands of nodes, and
  // scanning them in one synchronous findAll() blocked Figma's main thread —
  // the plugin opened with its URL field frozen for a second or two.
  let scanToken = 0;
  /** Last completed page-wide count, reused while the document is unchanged. */
  let cachedPageCount: RebindableCount | null = null;
  /** Whether `documentchange` is available to invalidate the cache above. */
  let documentChangeWatched = false;

  const postRebindableCount = async (pageDirty = true) => {
    const token = ++scanToken;
    const isCancelled = () => token !== scanToken;
    if (pageDirty) cachedPageCount = null;

    try {
      let page = cachedPageCount;
      if (!page) {
        const pageNodes = await collectTextNodesChunked(
          figma.currentPage.children,
          { isCancelled },
        );
        if (!pageNodes) return; // superseded by a newer scan
        page = countRebindableNodes(pageNodes);
        cachedPageCount = page;
      }

      // Scope to the current selection, so every number the modal shows —
      // header count, per-font list, button label — describes what Re-apply
      // will actually touch. The rebind handler honours the same
      // selection-or-page scope.
      const selection = figma.currentPage.selection;
      const selectionNodes =
        selection.length > 0
          ? await collectTextNodesChunked(selection as unknown as SceneNode[], {
              isCancelled,
            })
          : [];
      if (!selectionNodes) return;
      if (isCancelled()) return;

      figma.ui.postMessage({
        type: "rebindable-count",
        // Per-layer detail rides along so the modal can render a clickable
        // per-font list ("h1.u-text" → select & zoom).
        data: composeRebindablePayload(
          page,
          countRebindableNodes(selectionNodes),
          selection.length > 0,
        ),
      });
    } catch {
      // Page scan can fail on unusual/huge docs — non-fatal, just skip.
    }
  };

  // Switching Figma pages changes which nodes are in scope; refresh the count.
  figma.on("currentpagechange", () => void postRebindableCount());

  // Selecting a frame changes the re-apply scope — refresh so the footer button
  // can reflect "Re-apply to selection" when the selection holds pending fonts.
  // Only the selection is re-walked (the page's count is unchanged unless the
  // document was edited, which `documentchange` below invalidates), and bursts
  // from drag-selecting are coalesced.
  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  figma.on("selectionchange", () => {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      selectionTimer = null;
      void postRebindableCount(!documentChangeWatched);
    }, 150);
  });

  // Editing the canvas changes it too — deleting the imported frames must hide
  // the "Re-apply fonts" button, not leave it pointing at nothing. documentchange
  // fires per edit (and in bursts while dragging), so coalesce to one rescan.
  let rescanTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    figma.on("documentchange", () => {
      if (rescanTimer) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => {
        rescanTimer = null;
        void postRebindableCount();
      }, 400);
    });
    // The cache above is only safe while edits invalidate it.
    documentChangeWatched = true;
  } catch {
    // documentchange needs the `documentAccess: dynamic-page` manifest flag and
    // isn't available in every host/test env — the other refresh points remain.
  }

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Relay debug logs from UI iframe — silenced.
    if (msg.type === "debug-log") {
      return;
    }
    // UI asks how many text nodes still need their original font re-applied.
    if (msg.type === "count-rebindable-fonts") {
      void postRebindableCount();
      return;
    }
    // A layer row in the Re-apply modal was clicked — select it on canvas and
    // bring it into view so the user sees which element the font refers to.
    // The Re-apply modal's per-font picker needs the families this machine
    // can actually offer. Figma's list includes its own web fonts, so it is
    // never just what the OS has installed.
    if (msg.type === "list-installed-fonts") {
      try {
        const avail =
          typeof figma.listAvailableFontsAsync === "function"
            ? await figma.listAvailableFontsAsync()
            : [];
        const families = Array.from(
          new Set(avail.map((f) => f.fontName.family)),
        ).sort((a, b) => a.localeCompare(b));
        figma.ui.postMessage({ type: "installed-fonts", data: { families } });
      } catch {
        figma.ui.postMessage({ type: "installed-fonts", data: { families: [] } });
      }
      return;
    }

    if (msg.type === "select-rebind-layer") {
      const nodeId: unknown = msg.data?.nodeId;
      if (typeof nodeId !== "string") return;
      try {
        const node =
          typeof figma.getNodeByIdAsync === "function"
            ? await figma.getNodeByIdAsync(nodeId)
            : figma.getNodeById(nodeId);
        if (node && node.type === "TEXT") {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        } else {
          figma.notify("Layer no longer exists");
        }
      } catch {
        figma.notify("Layer no longer exists");
      }
      return;
    }
    // A row in the post-import report was clicked. Same behaviour as
    // select-rebind-layer above, but any SceneNode qualifies — the report
    // links to frames and images too, not only text.
    if (msg.type === "select-import-warning-layer") {
      const nodeId: unknown = msg.data?.nodeId;
      if (typeof nodeId !== "string") return;
      try {
        const node =
          typeof figma.getNodeByIdAsync === "function"
            ? await figma.getNodeByIdAsync(nodeId)
            : figma.getNodeById(nodeId);
        if (node && "visible" in node) {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        } else {
          figma.notify("Layer no longer exists");
        }
      } catch {
        figma.notify("Layer no longer exists");
      }
      return;
    }
    // Handle font fallback choice from popup
    if (msg.type === "font-fallback-choice") {
      // The user may have just installed the downloaded fonts — stale
      // failure entries would keep steering this render to fallbacks.
      resetFontFailures();
      if (pendingRenderData) {
        const { executeRender, autoOriginal } = pendingRenderData;
        const fontMapping: FontMapping = msg.data.fontMapping || {};
        const choice: string = msg.data.choice || "";
        pendingRenderData = null;

        // The modal only saw the still-missing fonts; auto-resolvable ones
        // (installed under their real SFNT name) always take the Inter +
        // marker route, whatever the user picked for the rest.
        const plan = buildChoiceRenderPlan(choice, fontMapping, autoOriginal);
        await executeRender(plan.primaryFont, plan.renderMapping, plan.originalFontNames);

        if (Object.keys(autoOriginal).length > 0) {
          try {
            const textNodes = figma.currentPage.findAll(
              (n) => n.type === "TEXT",
            ) as TextNode[];
            await rebindOriginalFonts(textNodes);
          } catch {
            /* rebind best-effort — markers remain for a manual Re-apply */
          }
          void postRebindableCount();
        }
      }
      return;
    }

    // Handle render-wireframe message
    if (msg.type === "render-wireframe") {
      try {
      // Fonts may have been installed since the last import — let failed
      // loadFontAsync probes retry (successes stay cached; see fontLoader.ts).
      resetFontFailures();
      const data = msg.data as RenderWireframeData;

      // Dev profiler: the UI iframe and this sandbox are separate realms with
      // separate perf tables, so the UI ships its rows with the message and we
      // replay them here. `sentAt` closes the one gap neither side can time on
      // its own — the postMessage structured clone of a multi-MB payload.
      if (__W2W_DEV_LOG__) {
        perf.reset();
        renderStartedAt = Date.now();
        if (typeof data.sentAt === "number") {
          perf.mark("ui.bridge", Date.now() - data.sentAt);
        }
        for (const [label, ms] of Object.entries(data.perfUi || {})) {
          perf.mark(label, ms);
        }
        perf.count("frames", data.frames?.length || 0);
      }
      const {
        frames,
        sourceUrl,
        pluginColors,
        pluginFont,
        cssVariables,
        variableMode,
        layoutMode,
        colorMode,
        fontMode,
        textMode,
        assetMode,
        interactionMode,
        htmlLayerNames,
        geometryRows,
        originLinks,
      } = data;

      // Default colors if not provided
      const colors = pluginColors || {
        main: "#1f3a5f",
        text: "#333333",
        accent: "#3b82f6",
        surface: "#f5f5f5",
        border: "#e0e0e0",
        background: "#ffffff",
      };

      // Determine effective modes (defaults)
      const effectiveColorMode = colorMode || "plugin";
      const effectiveFontMode = fontMode || "plugin";

      // ----------------------------------------------------------------------
      // PRE-PASS: Convert W2W content-script `capturedData.frame` →
      // WireframeNode `tree` for every frame BEFORE any sandbox code reads
      // `frame.tree`. Without this, the font availability check below
      // (collectAllFonts) and `websiteFont` derivation see only placeholder
      // (null/{}) trees and silently fall back to defaults — the symptom
      // was that Web/HTML/AreaSelection imports never opened the font
      // fallback modal, even when the page used unavailable fonts.
      //
      // Idempotent + side-effect-free for legacy frames (no capturedData).
      // The duplicate FIX A loop inside executeRender remains as a safety
      // net but is now a no-op for content-script-format frames (its
      // guard checks isPlaceholderTree, so populated trees are skipped).
      // ----------------------------------------------------------------------
      // Subtrees the converter dropped as fully transparent. Reported to the
      // user once `renderContext.renderStats` exists (it does not yet — the
      // conversion has to run before the font check reads the tree).
      const skippedFrames = perf.timedSync("prePassConvert", () =>
        prePassConvertFrames(frames as Parameters<typeof prePassConvertFrames>[0], {
          layoutMode: (layoutMode || "autoLayout") as "absolute" | "autoLayout",
          interactionMode: (interactionMode || "none") as "none" | "variants",
          htmlLayerNames: htmlLayerNames === true,
          geometryRows: geometryRows === true,
        })
      );

      // Payload size, so the timings below can be read as ms/node.
      if (__W2W_DEV_LOG__) {
        for (const f of frames) countTreeNodes(f?.tree);
      }

      // Determine font family based on fontMode
      const websiteFont = frames[0]?.tree?.fontFamily || "Inter";
      const initialFontFamily =
        effectiveFontMode === "plugin"
          ? pluginFont || "Montserrat"
          : websiteFont;


      if (!frames || frames.length === 0) {
        errorHandler.handle({
          code: ErrorCode.NO_DATA_RECEIVED,
          message: "No wireframe data received",
        });
        return;
      }


      // Extract rendering into a function for font fallback flow
      const executeRender = async (fontFamily: string, fontMapping?: FontMapping, originalFontNames?: FontMapping) => {


      figma.notify("Creating wireframe…", { timeout: 2000 });

      // Send initial progress to UI
      figma.ui.postMessage({
        type: "render-progress",
        data: {
          step: "Initializing wireframe...",
          percent: 5,
        },
      });

      // Build context for rendering
      const colorStyleMap = new Map<string, PaintStyle>();
      const variableValueMap = new Map<string, string>();
      let variableStyleMap: Map<string, PaintStyle> | undefined;

      // Populate variable value map
      if (cssVariables && cssVariables.length > 0) {
        for (const variable of cssVariables) {
          variableValueMap.set(variable.name, variable.value);
        }
      }

      // Derive hostname once for all style-creation passes. Used as the
      // top-level group prefix in Figma's Styles panel so multi-site
      // wireframes stay visually separated (e.g. `apple.com/--accent` vs
      // `web2wireframe.design/--accent`).
      //
      // IMPORTANT: we intentionally do NOT use `new URL(...)` here — the
      // Figma plugin sandbox does not reliably expose the URL constructor,
      // which is why earlier builds of this code fell through to "WEB" /
      // raw sourceUrl defaults. `extractHostname` is a regex-based parser
      // that works in any ES5+ runtime.
      // derivedHostname is the single source of truth for style folder
      // names. Both modes use it:
      //   - Website Colors: `{hostname}/--varName`
      //   - Plugin Colors:  `{hostname}/Plugin/--role`
      //   - Website Fonts:  `{hostname}/--Inter-Bold-24`
      //   - Plugin Fonts:   `{hostname}/Plugin/--Inter-Bold-24`
      //   - Lines Fonts:    `{hostname}/Lines/--Inter-Bold-24`
      // Falls back to "website" for missing / unparseable sourceUrl.
      const derivedHostname = extractHostname(sourceUrl);

      // -----------------------------------------------------------------------
      // FIX A: Convert captured data → WireframeNode tree for EVERY frame
      // BEFORE running style-creation passes. Pass 3 (auto-named literal color
      // styles) and createTextStyles both iterate `frames[i].tree` — which was
      // previously populated only inside the render loop (line ~430), leaving
      // tree = undefined during style creation. That caused 0 literal color
      // styles and 0 text styles for W-03. See P4/P5 root cause analysis.
      //
      // Guard note: callers send `tree: null` (Web.tsx) or `tree: {}` (Area
      // Selection .w2w/.json import) as a placeholder meaning "main.ts will
      // populate this from capturedData". We MUST overwrite both shapes, so
      // the guard only checks capturedData presence — a previously-built real
      // tree wouldn't carry capturedData.frame (legacy prepareFramesForRendering
      // path doesn't set it).
      // -----------------------------------------------------------------------
      // Safety net for legacy callers that bypass the top-level pre-pass
      // (none today — but guards future regressions). The pre-pass at the
      // entry of the message handler already converted every frame whose
      // tree was a placeholder; here we only reconvert if a placeholder is
      // still present, so this loop is a no-op in the common path.
      for (const frameData of frames) {
        if (frameData.capturedData?.frame && isPlaceholderTree(frameData.tree)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const capturedFrame = frameData.capturedData.frame as any;
            frameData.tree = convertW2WToWireframe(capturedFrame, {
              layoutMode: (layoutMode || 'autoLayout') as 'absolute' | 'autoLayout',
              interactionMode: interactionMode || 'none',
              htmlLayerNames: htmlLayerNames === true,
              geometryRows: geometryRows === true,
            });
          } catch (err) {
            logger.warn("Pre-pass tree conversion failed", { error: err });
          }
        }
      }

      // Create color styles based on mode
      if (variableMode === "styles") {
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Creating color styles...",
            percent: 15,
          },
        });

        if (effectiveColorMode === "plugin") {
          figma.notify("Creating plugin color styles…", { timeout: 1500 });
          try {
            // Nest plugin styles under `{hostname}/Plugin` so multi-site
            // imports in Plugin Colors mode don't collide (e.g. importing
            // Tesla then Apple no longer overwrites `--accent`).
            const pluginStyleMap = await perf.timed("colorStyles", () =>
              createPluginColorStyles(colors, `${derivedHostname}/Plugin`)
            );
            logger.info("Created plugin color styles", {
              styleCount: pluginStyleMap.size,
            });

            // Build color lookup map
            pluginStyleMap.forEach((style, role) => {
              const colorValue = colors[role as keyof typeof colors];
              if (colorValue) {
                const normalizedValue = normalizeColorForLookup(colorValue);
                if (normalizedValue) {
                  colorStyleMap.set(normalizedValue, style);
                }
              }
              colorStyleMap.set(role, style);
            });
          } catch (err) {
            logger.warn("Failed to create plugin color styles", { error: err });
          }
        } else {
          // Website color mode: unified variable-first style creation
          figma.notify("Creating website color styles…", { timeout: 1500 });

          try {
            const result = await perf.timed("colorStyles", () =>
              createUnifiedWebsiteColorStyles(frames, cssVariables || [], derivedHostname)
            );
            logger.info("Created unified website color styles", {
              colorStyleCount: result.colorStyleMap.size,
              variableStyleCount: result.variableStyleMap.size,
            });

            result.colorStyleMap.forEach((style, key) => {
              colorStyleMap.set(key, style);
            });
            variableStyleMap = result.variableStyleMap;
          } catch (err) {
            logger.warn("Failed to create website color styles", { error: err });
          }
        }
      }

      // Pre-process: merge capturedData assets into frame assets before building assetsMap
      const FIGMA_SUPPORTED_MIMES = new Set(["image/png", "image/jpeg", "image/gif"]);

      // Images the UI iframe has to convert (it has Canvas/createImageBitmap,
      // the sandbox does not): a format Figma cannot take (AVIF/WebP), or a
      // size over Figma's 4096px limit (utils/figmaImageLimit.ts). One job per
      // url, even when several viewport frames carry it.
      const conversionJobs = new Map<string, { url: string; dataUri: string; frameIdxs: number[]; filter?: string }>();
      const queueConversion = (url: string, dataUri: string, frameIdx: number, filter?: string): void => {
        const job = conversionJobs.get(url);
        if (!job) conversionJobs.set(url, { url, dataUri, frameIdxs: [frameIdx], ...(filter ? { filter } : {}) });
        else if (!job.frameIdxs.includes(frameIdx)) job.frameIdxs.push(frameIdx);
      };

      for (let fi = 0; fi < frames.length; fi++) {
        const fd = frames[fi] as WireframeFrame;
        if (fd.capturedData?.assets) {
          if (!fd.assets) fd.assets = {};
          for (const [url, entry] of Object.entries(fd.capturedData.assets)) {
            const e = entry as { base64Encoded?: boolean; content?: string; mimeType?: string };
            if (e.base64Encoded && e.content) {
              const mime = e.mimeType || 'image/png';
              const dataUri = `data:${mime};base64,${e.content}`;

              if (mime.startsWith('image/') && mime !== 'image/svg+xml' && !FIGMA_SUPPORTED_MIMES.has(mime)) {
                // Need conversion — collect for batch UI conversion
                queueConversion(url, dataUri, fi);
              } else {
                // Supported format — use directly. An oversized one is queued
                // below; if its conversion fails this raw entry stays, and the
                // render reports it exactly as before.
                fd.assets[url] = dataUri;
              }
            }
          }
        }
      }

      // Over Figma's 4096px limit — read off the converted trees, i.e. the exact
      // urls the renderer will look up, whatever flow filled the assets.
      for (const job of planOversizedImages(frames as WireframeFrame[])) {
        for (const fi of job.frameIdxs) queueConversion(job.url, job.dataUri, fi);
      }

      // CSS color filters on raster images (white logos: `brightness(0)
      // invert(1)`) — recoloured by the same UI conversion, under a filtered key.
      const filteredImagePlan = assetMode === "realAssets"
        ? planFilteredImages(
            frames as WireframeFrame[],
            new Map(Array.from(conversionJobs.values(), (job) => [job.url, job.dataUri])),
          )
        : null;
      for (const job of filteredImagePlan?.jobs ?? []) {
        for (const fi of job.frameIdxs) queueConversion(job.key, job.dataUri, fi, job.filter);
      }

      // Original sizes of the images the conversion shrinks — fills.ts measures
      // backgrounds with them.
      const imageNaturalSizes = new Map<string, { width: number; height: number }>();

      // Convert via UI iframe (has Canvas/createImageBitmap)
      if (conversionJobs.size > 0 && assetMode === "realAssets") {
        figma.ui.postMessage({
          type: "render-progress",
          data: { step: "Converting images for Figma...", percent: 8 },
        });

        logger.info("Converting images via UI iframe", {
          count: conversionJobs.size,
        });

        type ConvertedAsset = {
          url: string;
          dataUri: string;
          width?: number;
          height?: number;
          originalWidth?: number;
          originalHeight?: number;
        };

        // Send to UI for conversion and collect results as they arrive
        const convertedAssets = await perf.timed("assetsConvert", () => new Promise<ConvertedAsset[]>((resolve) => {
          const results: ConvertedAsset[] = [];
          // Temporarily add handler (will be overridden by next onmessage call)
          const origHandler = figma.ui.onmessage;
          let settled = false;
          const finish = (): void => {
            if (settled) return;
            settled = true;
            figma.ui.onmessage = origHandler;
            resolve(results);
          };
          figma.ui.onmessage = (msg) => {
            if (msg.type === "asset-converted") {
              if (msg.data?.url && msg.data?.dataUri) results.push(msg.data as ConvertedAsset);
            } else if (msg.type === "assets-converted") {
              finish();
            } else if (origHandler) {
              origHandler(msg, { origin: '' } as never);
            }
          };

          figma.ui.postMessage({
            type: "convert-assets",
            data: {
              assets: Array.from(conversionJobs.values()).map(({ url, dataUri, filter }) => ({
                url,
                dataUri,
                ...(filter ? { filter } : {}),
              })),
            },
          });

          // Timeout after 30s — keep whatever arrived.
          setTimeout(finish, 30000);
        }));

        // Merge converted assets into every frame that carries them
        for (const converted of convertedAssets) {
          const job = conversionJobs.get(converted.url);
          if (!job) continue;
          for (const fi of job.frameIdxs) {
            const fd = frames[fi] as WireframeFrame;
            if (!fd.assets) fd.assets = {};
            fd.assets[converted.url] = converted.dataUri;
          }
          if (
            converted.originalWidth && converted.originalHeight &&
            (converted.width !== converted.originalWidth || converted.height !== converted.originalHeight)
          ) {
            imageNaturalSizes.set(converted.url, {
              width: converted.originalWidth,
              height: converted.originalHeight,
            });
          }
        }
        if (filteredImagePlan) {
          finishFilteredImages(filteredImagePlan, new Set(convertedAssets.map((c) => c.url)));
        }
        logger.info("Image conversion complete", {
          converted: convertedAssets.length,
          requested: conversionJobs.size,
          downscaled: imageNaturalSizes.size,
        });
      }

      // Build unified assets map from all frames
      const assetsMap = new Map<string, string>();
      if (assetMode === "realAssets") {
        for (const frame of frames) {
          const frameAssets = (frame as WireframeFrame).assets;
          if (frameAssets) {
            for (const [url, base64] of Object.entries(frameAssets)) {
              assetsMap.set(url, base64);
            }
          }
        }
      }


      // Create render context
      const renderContext: RenderContext = {
        pluginColors: colors,
        fontFamily,
        variableMode: variableMode || "direct",
        layoutMode: layoutMode || "autoLayout",
        cssVariables: cssVariables || [],
        colorStyleMap,
        variableValueMap,
        colorMode: effectiveColorMode,
        fontMode: effectiveFontMode,
        textMode: textMode || "semantic",
        variableStyleMap,
        fontMapping,
        originalFontNames,
        fontRealNames: data.fontRealNames,
        fontDeclaredCuts: data.fontDeclaredCuts,
        fontVariableFamilies: data.fontVariableFamilies,
        fontFaceStyles: data.fontFaceStyles,
        assetMode: assetMode || "placeholders",
        assetsMap,
        imageNaturalSizes,
        interactionMode: interactionMode || "none",
        // "Links" option — absent means ON, so only an explicit false silences
        // the site's links (old payloads keep today's behaviour).
        originLinks: originLinks !== false,
        componentSets: [],
        hoverComponentCache: new Map(),
        renderStats: {
          hoverCacheHits: 0,
          hoverCacheMisses: 0,
          emptyPseudoSkipped: 0,
          pseudoErrors: 0,
          droppedNodes: [],
        },
      };

      // Replay the pre-pass's transparent-subtree drops into the report. They
      // happened before this context existed, and they are not render errors —
      // the converter removed them on purpose — so they carry no node id.
      for (const skipped of skippedFrames) {
        recordWarning(renderContext, {
          category: "layout",
          message: "Hidden at capture time (opacity: 0) — skipped",
          layerName: skipped.layerName,
          detail:
            `${skipped.nodes} layer(s) · ` +
            `${Math.round(skipped.width)}×${Math.round(skipped.height)}px`,
        });
      }

      // Create effect styles (Phase 2) — shared shadow/blur library. Plugin
      // color mode returns empty map because effects are stripped upstream
      // for clean wireframes.
      if (variableMode === "styles") {
        try {
          const effectStyleMap = await perf.timed("otherStyles", () =>
            createEffectStyles(frames, derivedHostname, effectiveColorMode)
          );
          renderContext.effectStyleMap = effectStyleMap;
          logger.info("Created effect styles", {
            styleCount: effectStyleMap.size,
          });
        } catch (err) {
          logger.warn("Failed to create effect styles", { error: err });
        }
      }

      // Create text styles if "Create Figma Styles" is enabled
      if (variableMode === "styles") {
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Creating text styles...",
            percent: 18,
          },
        });

        try {
          const textStyleMap = await perf.timed("otherStyles", () =>
            createTextStyles(
              frames,
              fontFamily,
              effectiveFontMode,
              originalFontNames,
              derivedHostname
            )
          );
          renderContext.textStyleMap = textStyleMap;
          logger.info("Created text styles", {
            styleCount: textStyleMap.size,
          });
        } catch (err) {
          logger.warn("Failed to create text styles", { error: err });
        }
      }

      // Create grid styles (Phase 3) — only root-level CSS Grid containers
      // get promoted to a reusable GridStyle. Nested sub-grids remain inline.
      if (variableMode === "styles") {
        try {
          const gridStyleMap = await perf.timed("otherStyles", () =>
            createGridStyles(frames, derivedHostname)
          );
          renderContext.gridStyleMap = gridStyleMap;
          logger.info("Created grid styles", {
            styleCount: gridStyleMap.size,
          });
        } catch (err) {
          logger.warn("Failed to create grid styles", { error: err });
        }
      }

      // Send "analyzing structure" progress
      figma.ui.postMessage({
        type: "render-progress",
        data: {
          step: "Analyzing page structure...",
          percent: 20,
        },
      });

      renderContext.componentWrappers = renderContext.componentWrappers ?? [];

      // Orphan sweep baseline: page-root children that existed BEFORE any
      // render pass. Everything the render leaks onto the page root (frames
      // auto-parented by figma.createFrame() and never re-parented) is swept
      // after the Sections are assembled — see collectRenderOrphans.
      const preexistingPageIds = new Set(
        figma.currentPage.children.map((c) => c.id),
      );

      // Phase D (h2d-parity, PASS 0): build the shared icon library FIRST so
      // PASS 1 hover masters can reference icons via INSTANCE instead of
      // inlining vector markup. Mirrors h2d's `Component 3` (43 unique SVGs
      // bundled into one ComponentSet, referenced from Components 4/7/8).
      // Gated on interactionMode=variants — in `none` mode we skip the
      // Components section entirely and SVGs render inline via realImages.ts.
      if (
        renderContext.assetMode === "realAssets" &&
        renderContext.interactionMode === "variants"
      ) {
        try {
          const { buildIconLibrary } = await import("./rendering/svgLibrary");
          const iconLib = await perf.timed("iconLibrary", () =>
            buildIconLibrary(frames, { componentIndex: 1 })
          );
          if (iconLib) {
            renderContext.iconLibrary = iconLib;
            renderContext.componentWrappers!.push(iconLib.wrapper);
            logger.info("Built icon library", {
              uniqueSvgs: iconLib.hashToComponent.size,
              componentIndex: iconLib.componentIndex,
            });
          }
        } catch (err) {
          logger.warn("Failed to build icon library — SVGs will render inline", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // PASS 1: h2d-aligned hover ComponentSet consolidation.
      // Before the frame-render loop, walk the tree once, group hoverables
      // by (children-structure, visual-signature), and build shared master
      // ComponentSets. PASS 2 (nodes.ts) turns each hoverable element into
      // an instance of the right master.
      if (renderContext.interactionMode === "variants") {
        try {
          const { buildHoverMasterRegistry } = await import(
            "./rendering/hoverConsolidation"
          );
          // Sequential index continues after the icon library (so icons are
          // Component 1 and hover sets follow as Component 2, 3, …).
          const startIndex = renderContext.iconLibrary ? 2 : 1;
          const registry = await perf.timed("hoverRegistry", () =>
            buildHoverMasterRegistry(frames, renderContext),
          );
          renderContext.hoverMasterRegistry = registry;
          // Phase C (h2d-parity): collect "Component N" wrapper FRAMEs (with
          // legends + ComponentSet styling) for the Components section. Bare
          // ComponentSets stay accessible via the registry for PASS 2 lookups.
          let runningIndex = startIndex;
          registry.forEach((entry) => {
            // Re-number wrappers if the icon library bumped startIndex.
            if (startIndex > 1) {
              entry.componentIndex = runningIndex;
              entry.componentSet.name = `Component ${runningIndex}`;
              entry.wrapper.name = `Component ${runningIndex}`;
              runningIndex += 1;
            }
            renderContext.componentSets?.push(entry.componentSet);
            renderContext.componentWrappers!.push(entry.wrapper);
          });
          logger.info("Built hover master registry", {
            categories: registry.size,
            masters: registry.size,
          });
        } catch (err) {
          logger.warn("Failed to build hover master registry — falling back to inline variants", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      try {
        const createdFrames: FrameNode[] = [];

        // Real render progress. Every node passes through createNodeInFigma,
        // and the converted trees say how many there are — so the stretch that
        // used to jump 30 → 85 in silence is now measured. The renderer drops
        // some nodes and invents wrappers, so the ratio is approximate and
        // `nodeProgressPercent` clamps it below the "frames done" milestone.
        const totalTreeNodes = frames.reduce(
          (sum, f) => sum + (f.tree ? countNodes(f.tree) : 0),
          0
        );
        let renderedNodes = 0;
        let lastSentPercent = 0;
        let currentBuildStep = "Building elements…";
        renderContext.onNodeRendered = () => {
          renderedNodes++;
          if (!shouldEmitNodeProgress(renderedNodes)) return;
          const percent = Math.round(
            nodeProgressPercent(renderedNodes, totalTreeNodes)
          );
          if (percent === lastSentPercent) return;
          lastSentPercent = percent;
          figma.ui.postMessage({
            type: "render-progress",
            data: { step: currentBuildStep, percent },
          });
        };

        for (let i = 0; i < frames.length; i++) {
          const viewportWidth = frames[i].viewportWidth;
          figma.notify(`Processing viewport ${i + 1}/${frames.length}…`, {
            timeout: 1000,
          });

          // Calculate progress
          const frameEndProgress = 25 + ((i + 1) / frames.length) * 60;

          currentBuildStep = `Building elements for ${viewportWidth}px...`;
          figma.ui.postMessage({
            type: "render-progress",
            data: {
              step: currentBuildStep,
              percent: Math.round(nodeProgressPercent(renderedNodes, totalTreeNodes)),
            },
          });

          // Tree is now pre-converted above (FIX A). Only merge assets here.
          const frameData = frames[i];
          if (frameData.capturedData?.assets) {
            const assetMap: Record<string, string> = {};
            const assetsTyped = frameData.capturedData.assets as Record<
              string,
              { base64Encoded?: boolean; content?: string; mimeType?: string }
            >;
            for (const [url, entry] of Object.entries(assetsTyped)) {
              if (entry.base64Encoded && entry.content) {
                const mime = entry.mimeType || 'image/png';
                assetMap[url] = `data:${mime};base64,${entry.content}`;
              }
            }
            frameData.assets = { ...frameData.assets, ...assetMap };
          }

          // Same-page `#anchor` wiring, scoped to THIS viewport frame: desktop
          // and mobile captures both contain `id="faq"`, and a shared map would
          // wire the mobile nav to the desktop section.
          const anchorScope = createAnchorScope();
          renderContext.anchorScope = anchorScope;
          let wireframeFrame: FrameNode;
          try {
            wireframeFrame = await perf.timed("createWireframeFrame", () =>
              createWireframeFrame(frameData, sourceUrl, renderContext, i)
            );
          } finally {
            renderContext.anchorScope = undefined;
          }
          // Node ids only exist once rendered, so the hashes resolve now.
          await perf.timed("anchorReactions", () => resolveAnchorReactions(anchorScope));
          createdFrames.push(wireframeFrame);

          figma.ui.postMessage({
            type: "render-progress",
            data: {
              step:
                frames.length > 1
                  ? `Viewport ${i + 1} of ${frames.length} complete...`
                  : "Applying styles and colors...",
              percent: Math.round(frameEndProgress),
            },
          });
        }

        // Everything past this point (Components section, orphan sweep) has
        // its own milestones — stop the node counter from talking over them.
        renderContext.onNodeRendered = undefined;

        // Wrap frame(s) in a Section
        figma.notify("Grouping frames in Section…", { timeout: 1000 });

        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Organizing frames...",
            percent: 90,
          },
        });

        const section = figma.createSection();

        // Same extractHostname used for style-prefix — keeps section name
        // and style folders in sync. Avoids `new URL()` which is unreliable
        // in the Figma plugin sandbox (previously this fell through to
        // "hostname = sourceUrl" and wrote the raw URL into the section name).
        const hostname = extractHostname(sourceUrl);

        // Sort widths descending (largest → smallest) to match the visual
        // top-to-bottom / left-to-right frame order in the section.
        const viewportWidths = frames
          .map((f) => f.viewportWidth)
          .slice()
          .sort((a, b) => b - a)
          .join(" + ");
        const now = new Date();
        const shortDate = now.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        section.name = `${hostname} (${viewportWidths}) — Made with ♥ by Web2Wireframe · ${shortDate}`;

        // Section styling
        section.fills = [
          { type: "SOLID", color: { r: 0x93 / 255, g: 0x93 / 255, b: 0x93 / 255 } },
        ];

        // Sort frames by viewport width descending (desktop → mobile, left → right)
        createdFrames.sort((a, b) => b.width - a.width);

        // Position frames inside section
        const sectionPadding = 100;
        let currentX = sectionPadding;
        let maxHeight = 0;

        for (const frame of createdFrames) {
          section.appendChild(frame);
          frame.x = currentX;
          frame.y = sectionPadding;
          currentX += frame.width + sectionPadding;
          maxHeight = Math.max(maxHeight, frame.height);
        }

        section.resizeWithoutConstraints(
          currentX,
          maxHeight + sectionPadding * 2
        );

        // Give Presentation mode a way in — one starting point per viewport.
        // Runs after the frames are parented into the Section so the flows
        // point at nodes that are settled on the page.
        registerFlowStartingPoints(createdFrames);

        const viewport = figma.viewport.center;
        section.x = viewport.x - section.width / 2;
        section.y = viewport.y - section.height / 2;

        // Stamp the import's state onto the Section itself, so months later
        // the canvas still says what happened — Figma shows the summary under
        // the plugin's relaunch button in the right-hand panel.
        try {
          section.setRelaunchData({
            open: buildRelaunchSummary(renderContext.renderStats?.warnings),
          });
        } catch {
          // setRelaunchData is unavailable in some hosts/tests — never fatal.
        }

        const selectionTarget: SceneNode[] = [section];

        // Create separate Components Section for interaction variant ComponentSets.
        // Phase C (h2d-parity): wrappers (FRAME containing ComponentSet +
        // x-axis-legend + y-axis-legend) replace bare ComponentSets. Section
        // fill switched to white to match h2d.
        // Defense in depth: even if a future code path pushes into
        // componentWrappers/componentSets, we only render the Components
        // Section when the user explicitly opted into interaction variants.
        const sectionItems =
          renderContext.interactionMode === "variants"
            ? renderContext.componentWrappers && renderContext.componentWrappers.length > 0
              ? renderContext.componentWrappers
              : renderContext.componentSets ?? []
            : [];
        if (sectionItems.length > 0) {
          const compSection = figma.createSection();
          compSection.name = `Components — ${hostname}`;
          // Phase E (h2d-parity): white section fill (was gray rgb(192,192,192)).
          compSection.fills = [
            { type: "SOLID", color: { r: 1, g: 1, b: 1 } },
          ];

          const compPadding = 120;
          let compY = compPadding;
          let maxWidth = 0;

          for (const item of sectionItems) {
            compSection.appendChild(item);
            (item as { x: number }).x = compPadding;
            (item as { y: number }).y = compY;

            maxWidth = Math.max(maxWidth, item.width);
            compY += item.height + compPadding;
          }

          compSection.resizeWithoutConstraints(
            maxWidth + compPadding * 2,
            compY,
          );

          // Position to the right of wireframe section
          compSection.x = section.x + section.width + 200;
          compSection.y = section.y;

          selectionTarget.push(compSection);

          logger.info("Created Components Section (vertical)", {
            componentSetCount: sectionItems.length,
          });
        }

        // Sweep render leaks: element-named frames auto-parented to the page
        // root during rendering that never made it into a Section (hover
        // master intermediates whose remove() failed, mid-append exceptions).
        try {
          const { collectRenderOrphans } = await import("./rendering/orphanSweep");
          const keepIds = new Set(selectionTarget.map((n) => n.id));
          const orphans = perf.timedSync("orphanSweep", () =>
            collectRenderOrphans(figma.currentPage.children, preexistingPageIds, keepIds),
          );
          for (const orphan of orphans) {
            try { orphan.remove(); } catch { /* non-fatal */ }
          }
          if (orphans.length > 0) {
            logger.info("Swept render orphans", { count: orphans.length });
          }
        } catch (err) {
          logger.warn("Orphan sweep failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Send finalizing progress
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Finalizing wireframe...",
            percent: 95,
          },
        });

        // Select created node(s)
        figma.currentPage.selection = selectionTarget;

        // Zoom to fit
        figma.viewport.scrollAndZoomIntoView(selectionTarget);

        figma.notify(
          `Created ${createdFrames.length} wireframe frame(s)${createdFrames.length > 1 ? " in Section" : ""}!`,
          {
            timeout: 3000,
          }
        );

        // Surface everything that quietly degraded: lost subtrees, substituted
        // fonts, images and SVGs replaced by placeholders. Without this a
        // partially-lost import is indistinguishable from a perfect one (the
        // prod logger is a no-op, so none of it reaches anyone). The toast is
        // the headline; the report modal in the UI carries the clickable list.
        const warnings = renderContext.renderStats?.warnings ?? [];
        const warningOverflow = renderContext.renderStats?.warningOverflow ?? 0;
        if (warnings.length > 0) {
          logger.warn("Import produced warnings", {
            count: warnings.length,
            overflow: warningOverflow,
            samples: warnings.slice(0, 20),
          });
          figma.notify(`⚠️ ${buildNotifySummary(warnings)}`, { timeout: 5000 });
        }

        // Hand the list to the UI, which holds the report; the sandbox keeps
        // the node ids so a click can come back as select-import-warning-layer.
        // The origin rides along for "Report this to the developer": only a
        // URL/extension import carries a page the developer can re-import.
        figma.ui.postMessage({
          type: "import-report",
          data: {
            warnings,
            overflow: warningOverflow,
            sourceUrl,
            kind: data.kind,
            viewports: frames.map((f) => f.viewportWidth),
          },
        });

        // Read-only WCAG AA count for the "Fix all via styles — Pro" card.
        // Best-effort: a failed audit must never taint a successful import.
        try {
          const { auditTextContrast } = await import("./rendering/contrastAudit");
          const texts = createdFrames.flatMap((f) =>
            f.findAllWithCriteria({ types: ["TEXT"] }),
          );
          const contrast = perf.timedSync("contrastAudit", () => auditTextContrast(texts));
          logger.info("Contrast audit", { texts: texts.length, ...contrast });
          figma.ui.postMessage({ type: "contrast-audit", data: contrast });
        } catch (err) {
          logger.warn("Contrast audit failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Dev profiler: one table per import, out through the dev-log bridge.
        // Gated at the call site so the `[w2w-perf]` sentinel never reaches a
        // production bundle (scripts/build-prod.mjs greps for it).
        if (__W2W_DEV_LOG__) {
          const wall = Date.now() - renderStartedAt;
          logger.info(
            perf.report() +
              "\n  " +
              "WALL-CLOCK (since message)".padEnd(28) +
              String(wall).padStart(8) +
              "ms"
          );
        }

        // Send completion progress to UI
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Wireframe created successfully!",
            percent: 100,
            isComplete: true,
          },
        });

        // Send success message back to UI
        figma.ui.postMessage({
          type: "wireframe-created",
          data: {
            success: true,
            frameCount: createdFrames.length,
          },
        });

        // Screenshot import only: hand the rendered pixels back so the UI can
        // score them against the image the user uploaded. Best-effort — a
        // failed export must never taint a successful import.
        if (data.compareToSource && createdFrames.length > 0) {
          try {
            // createdFrames was sorted widest-first above; the widest frame
            // carries the most detail to compare against.
            const target = createdFrames[0];
            const bytes = await target.exportAsync({
              format: "PNG",
              constraint: { type: "WIDTH", value: 512 },
            });
            figma.ui.postMessage({
              type: "wireframe-exported",
              data: { bytes, width: target.width, height: target.height },
            });
          } catch (err) {
            logger.warn("Frame export for visual comparison failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // The fresh import may have introduced substituted-font text — refresh
        // the count so the "Re-apply fonts" button surfaces if needed.
        void postRebindableCount();
      } catch (error) {
        errorHandler.handle({
          code: ErrorCode.WIREFRAME_CREATION_FAILED,
          message: "Error creating wireframe",
          originalError: error,
          context: { sourceUrl, frameCount: frames.length },
        });

        figma.ui.postMessage({
          type: "wireframe-error",
          data: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
      }; // end executeRender

      // Pre-render font check, per CUT (family + weight + italic):
      //   `missing`     — families with nothing installed; they lose their
      //                   identity to Inter, so the modal must offer a choice.
      //   `missingCuts` — installed families whose specific cuts the page uses
      //                   are absent. They still render under their own name
      //                   (same-family rescue), but the download should ship
      //                   exactly those files.
      const allFonts = collectAllFonts(frames);

      if (effectiveFontMode === "website") {
        const fontUsage = collectFontUsage(frames);
        // The real-name map goes in too: a cut is only truly missing when
        // neither the CSS family nor its real (SFNT) family ships it.
        const { missing, missingCuts: rawMissingCuts } = await perf.timed("checkFonts", () =>
          checkFontsAvailability(
            allFonts,
            fontUsage,
            data.fontRealNames || {},
            new Set(data.fontVariableFamilies || []),
            data.fontFaceStyles || {},
          ),
        );
        // A cut is only worth offering when some @font-face actually declares
        // a matching face — telex.ge fakes bold from one 400 file, and the
        // undownloadable 700 "missing cut" reopened this modal on every import.
        const missingCuts = filterMissingCutsToDeclared(
          rawMissingCuts,
          data.fontDeclaredCuts || {},
        );
        const partialFamilies = Object.keys(missingCuts);
        // Diagnostic: why does (or doesn't) the font modal appear — which
        // families/cuts the page wants vs what Figma reports as installed.
        logger.info("Font availability check", {
          allFonts: Array.from(allFonts),
          usage: Object.fromEntries(
            Array.from(fontUsage.entries()).map(([fam, cuts]) => [
              fam,
              cuts.map((c) => `${c.weight}${c.italic ? "i" : ""}`),
            ]),
          ),
          missing,
          missingCuts,
          rawMissingCuts,
        });

        if (missing.length > 0 || partialFamilies.length > 0) {
          // Auto-resolve: a "missing" CSS family may already be installed under
          // its real (SFNT) name — Söhne installs as "Copyright Klim Type
          // Foundry". If EVERY missing font resolves to an installed real
          // family, skip the modal entirely: render via the proven marker +
          // rebind path so the original font lands directly. Re-imports of a
          // font the user installed once just work, no modal, no Re-apply.
          const realNames = data.fontRealNames || {};
          let installedFamilies = new Set<string>();
          try {
            if (typeof figma.listAvailableFontsAsync === "function") {
              const avail = await figma.listAvailableFontsAsync();
              installedFamilies = new Set(avail.map((f) => f.fontName.family));
            }
          } catch {
            /* no font list available — fall through to the modal */
          }

          const { autoOriginal, stillMissing } = partitionMissingFonts(
            missing,
            realNames,
            installedFamilies,
          );

          if (
            stillMissing.length === 0 &&
            partialFamilies.length === 0 &&
            Object.keys(autoOriginal).length > 0
          ) {
            // Render with Inter + original-name markers (the modal "continue"
            // path), then immediately rebind to the installed real fonts.
            const renderMapping: FontMapping = {};
            for (const css of Object.keys(autoOriginal)) renderMapping[css] = "Inter";
            await executeRender("Inter", renderMapping, autoOriginal);
            try {
              const textNodes = figma.currentPage.findAll(
                (n) => n.type === "TEXT",
              ) as TextNode[];
              await rebindOriginalFonts(textNodes);
            } catch {
              /* rebind best-effort — markers remain for a manual Re-apply */
            }
            void postRebindableCount();
            return;
          }

          const pluginFontOptions = [
            pluginFont || "Montserrat",
            "Inter", "Roboto", "Open Sans", "Lato", "Poppins",
            "Source Sans Pro", "Nunito", "Arial", "Helvetica",
          ];
          // Deduplicate
          const uniqueOptions = Array.from(new Set(pluginFontOptions));

          // The modal covers fonts the user can act on: families with nothing
          // installed, plus installed families whose needed cuts are absent.
          // Auto-resolvable ones stay out of it (handled by
          // buildChoiceRenderPlan once the user chooses).
          const modalFonts = [...stillMissing, ...partialFamilies];
          // Narrow the download ZIP to the cuts the page actually renders — for
          // partial families (missingCuts) AND fully-missing families (their
          // used cuts from fontUsage). Without the latter, a family absent from
          // Figma shipped every declared @font-face weight (e.g. apple.com's
          // unused SF Pro Text Light). See buildDownloadCuts.
          const downloadCuts = buildDownloadCuts(stillMissing, missingCuts, fontUsage);
          // "Use fallback fonts" follows each family's own CSS stack to an
          // installed substitute before the plugin font.
          const stackFallbacks = resolveStackFallbacks(
            modalFonts,
            collectFontStacks(frames),
            installedFamilies,
          );
          const message = buildFontsNotAvailableMessage(
            modalFonts,
            pluginFont || "Montserrat",
            uniqueOptions,
            downloadCuts,
            stackFallbacks
          );

          pendingRenderData = { data, executeRender, missingFonts: modalFonts, autoOriginal };
          figma.ui.postMessage(message);
          return; // Wait for user choice via font-fallback-choice message
        }
      } else {
        // Plugin mode: map all fonts to pluginFont automatically
        const pluginFontMapping = buildPluginModeFontMapping(allFonts, pluginFont || "Montserrat");

        await executeRender(initialFontFamily, pluginFontMapping);
        return;
      }

      await executeRender(initialFontFamily);
      } catch (error) {
        // Outer catch: handles errors outside executeRender's try/catch
        // (e.g., data destructuring, font check, executeRender call itself)
        figma.ui.postMessage({
          type: "wireframe-error",
          data: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown rendering error",
          },
        });
      }
    }

    // Handle "Re-apply original fonts" footer action.
    // Smart scope: walk the active selection if non-empty, else the whole
    // current page. Reports a toast with rebound / total / still-missing.
    if (msg.type === "rebind-original-fonts") {
      try {
        const selection = figma.currentPage.selection;
        const pageNodes = () =>
          figma.currentPage.findAll((n) => n.type === "TEXT") as TextNode[];
        const selected =
          selection.length > 0
            ? collectTextNodesIn(selection as unknown as SceneNode[])
            : [];
        // A selection with nothing pending falls back to the page — the same
        // rule `buildRebindableCountPayload` follows. Without it the modal
        // showed page-wide numbers while the button acted on a clean
        // selection, so clicking it did nothing at all.
        const scope =
          countRebindableNodes(selected).count > 0 ? selected : pageNodes();

        // Families the user chose to replace instead of install (see the
        // Re-apply modal's per-font picker).
        const substitutions =
          msg.data && typeof msg.data.substitutions === "object"
            ? (msg.data.substitutions as Record<string, string>)
            : undefined;

        if (scope.length === 0) {
          figma.notify("Re-apply fonts: nothing to scan in this scope.");
          figma.ui.postMessage({
            type: "rebind-result",
            data: { rebound: 0, total: 0, stillMissing: [], skippedMixed: 0, previouslyRebound: 0 },
          });
          return;
        }

        const result = await rebindOriginalFonts(scope, substitutions);
        const cumulative = result.previouslyRebound + result.rebound;

        // Mirror the outcome into the UI — the Re-apply modal stays open and
        // renders this inline, since the toast alone was easy to miss.
        figma.ui.postMessage({
          type: "rebind-result",
          data: {
            rebound: result.rebound,
            total: result.total,
            stillMissing: result.stillMissing,
            skippedMixed: result.skippedMixed,
            previouslyRebound: result.previouslyRebound,
          },
        });

        if (result.total === 0 && result.previouslyRebound === 0) {
          figma.notify("Re-apply fonts: no marked text found.");
        } else if (result.total === 0 && result.previouslyRebound > 0) {
          // All markers cleared in earlier passes — nothing new to do, but
          // the user has accumulated rebinds in this scope. Show that
          // instead of the misleading "no marked text found".
          figma.notify(`All ${result.previouslyRebound} font(s) already re-applied.`);
        } else if (
          result.rebound === result.total &&
          result.skippedMixed === 0 &&
          result.previouslyRebound === 0
        ) {
          figma.notify(`Re-applied ${result.rebound} text node(s) to original fonts.`);
        } else {
          const parts = [
            result.previouslyRebound > 0
              ? `Re-applied ${result.rebound} new (${cumulative} total)`
              : `Re-applied ${result.rebound} / ${result.total}`,
          ];
          if (result.stillMissing.length > 0) {
            const list = result.stillMissing.slice(0, 3).join(", ");
            const more = result.stillMissing.length > 3 ? ` (+${result.stillMissing.length - 3} more)` : "";
            parts.push(`still missing: ${list}${more}`);
          }
          if (result.skippedMixed > 0) {
            parts.push(`${result.skippedMixed} mixed-style skipped`);
          }
          figma.notify(parts.join(" — "));
        }
      } catch (err) {
        logger.warn("rebind-original-fonts handler failed", { error: err });
        figma.notify("Couldn't re-apply fonts. Please try again.", { error: true });
        // Release the modal's busy state — without this the button would
        // spin forever after a sandbox error.
        figma.ui.postMessage({ type: "rebind-result", data: { error: true } });
      }
      // Markers are cleared on successful re-apply — refresh so the button
      // hides once everything is re-applied (and stays if fonts still missing).
      void postRebindableCount();
      return;
    }

    // Capture-duration history for the import loader's estimate. Kept in its
    // OWN clientStorage key rather than the plugin config: config is snapshot
    // on first open and needs a CONFIG_VERSION migration to change shape, and
    // a progress-bar hint is not worth putting existing users through one.
    if (msg.type === "save-timing") {
      try {
        const stored =
          ((await figma.clientStorage.getAsync(TIMING_KEY)) as
            | Record<string, number[]>
            | undefined) ?? {};
        const kind: string = msg.data.kind || "url";
        stored[kind] = [...(stored[kind] ?? []), msg.data.captureMs].slice(
          -TIMING_SAMPLES
        );
        await figma.clientStorage.setAsync(TIMING_KEY, stored);
      } catch (err) {
        logger.warn("Failed to save import timing", { error: err });
      }
      return;
    }

    if (msg.type === "load-timing") {
      try {
        const stored = (await figma.clientStorage.getAsync(TIMING_KEY)) as
          | Record<string, number[]>
          | undefined;
        figma.ui.postMessage({ type: "timing-loaded", data: stored ?? {} });
      } catch (err) {
        logger.warn("Failed to load import timing", { error: err });
        figma.ui.postMessage({ type: "timing-loaded", data: {} });
      }
      return;
    }

    // Handle save-config message
    if (msg.type === "save-config") {
      const { config } = msg.data;
      try {
        await figma.clientStorage.setAsync("w2w_plugin_config", config);
        logger.info("Config saved to clientStorage");
      } catch (err) {
        logger.warn("Failed to save config to clientStorage", { error: err });
      }
    }

    // Handle load-config message
    if (msg.type === "load-config") {
      try {
        const config = await figma.clientStorage.getAsync("w2w_plugin_config");
        figma.ui.postMessage({
          type: "config-loaded",
          data: { config },
        });
        logger.info("Config loaded from clientStorage", {
          hasConfig: !!config,
        });
      } catch (err) {
        logger.warn("Failed to load config from clientStorage", { error: err });
        figma.ui.postMessage({
          type: "config-loaded",
          data: { config: null },
        });
      }
    }

    // Plugin OAuth token persistence. The token is obtained via the Figma
    // OAuth flow in the UI iframe; clientStorage lives in the sandbox, so the
    // iframe round-trips through these messages to persist/load it.
    if (msg.type === "save-auth-token") {
      try {
        await figma.clientStorage.setAsync("w2w_auth_token", msg.data);
      } catch (err) {
        logger.warn("Failed to save auth token to clientStorage", { error: err });
      }
    }

    if (msg.type === "load-auth-token") {
      try {
        const token = await figma.clientStorage.getAsync("w2w_auth_token");
        figma.ui.postMessage({ type: "auth-token-loaded", data: token ?? null });
      } catch (err) {
        logger.warn("Failed to load auth token from clientStorage", { error: err });
        figma.ui.postMessage({ type: "auth-token-loaded", data: null });
      }
    }

    if (msg.type === "clear-auth-token") {
      try {
        await figma.clientStorage.deleteAsync("w2w_auth_token");
      } catch (err) {
        logger.warn("Failed to clear auth token from clientStorage", { error: err });
      }
    }

    // Handle get-current-user message — primary identity source for License
    // lookups. Sandbox is the only context with access to figma.currentUser;
    // UI consumes this via ConfigContext.figmaUserId.
    //
    // NOTE: figma.currentUser requires the "currentuser" permission in the
    // figma-plugin section of package.json. Without it, accessing the
    // property throws synchronously.
    if (msg.type === "get-current-user") {
      let userId: string | null = null;
      try {
        userId = figma.currentUser?.id ?? null;
      } catch {
        userId = null;
      }
      figma.ui.postMessage({
        type: "current-user",
        data: { userId },
      });
    }
  };
}
