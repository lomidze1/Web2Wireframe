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
import { errorHandler, ErrorCode } from "./utils/errorHandler";
import type {
  WireframeFrame,
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
import { extractHostname } from "./rendering/hostname";
import {
  collectAllFonts,
  checkFontsAvailability,
  buildFontsNotAvailableMessage,
  buildPluginModeFontMapping,
} from "./utils/fontUtils";
import {
  prePassConvertFrames,
  isPlaceholderTree,
} from "./utils/preprocessFrames";
import {
  rebindOriginalFonts,
  collectTextNodesIn,
  ORIGINAL_FONT_PLUGIN_KEY,
} from "./rendering/rebindFonts";

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
  } | null = null;

  // Count text nodes on the current page still awaiting original-font re-apply
  // (they carry a non-empty `w2w_original_font` marker — imported with a
  // substituted font). The UI uses this to conditionally show the
  // "Re-apply fonts" footer button only when there's actually work to do.
  const postRebindableCount = () => {
    try {
      const count = figma.currentPage
        .findAll((n) => n.type === "TEXT")
        .filter((n) => !!n.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).length;
      figma.ui.postMessage({ type: "rebindable-count", data: { count } });
    } catch {
      // Page scan can fail on unusual/huge docs — non-fatal, just skip.
    }
  };

  // Switching Figma pages changes which nodes are in scope; refresh the count.
  figma.on("currentpagechange", () => postRebindableCount());

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Relay debug logs from UI iframe — silenced.
    if (msg.type === "debug-log") {
      return;
    }
    // UI asks how many text nodes still need their original font re-applied.
    if (msg.type === "count-rebindable-fonts") {
      postRebindableCount();
      return;
    }
    // Handle font fallback choice from popup
    if (msg.type === "font-fallback-choice") {
      if (pendingRenderData) {
        const { executeRender } = pendingRenderData;
        const fontMapping: FontMapping = msg.data.fontMapping || {};
        const choice: string = msg.data.choice || "";
        pendingRenderData = null;

        if (choice === "continue") {
          // "Use original fonts": render with Inter, but preserve original names for Text Styles
          const renderMapping: FontMapping = {};
          for (const original of Object.keys(fontMapping)) {
            renderMapping[original] = "Inter";
          }
          await executeRender("Inter", renderMapping, fontMapping);
        } else {
          // "fallback" or "plugin": use the provided mapping directly
          const primaryFont = Object.values(fontMapping)[0] || "Inter";
          await executeRender(primaryFont, fontMapping);
        }
      }
      return;
    }

    // Handle render-wireframe message
    if (msg.type === "render-wireframe") {
      try {
      const data = msg.data as RenderWireframeData;
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
      prePassConvertFrames(frames as Parameters<typeof prePassConvertFrames>[0], {
        layoutMode: (layoutMode || "autoLayout") as "absolute" | "autoLayout",
        interactionMode: (interactionMode || "none") as "none" | "variants",
      });

      // TEMP GRID DIAGNOSTIC — remove after debugging paco.me grid placement.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const root: any = frames[0]?.tree;
        let total = 0;
        let gridCount = 0;
        const gridLines: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const walk = (n: any) => {
          if (!n) return;
          total++;
          if (n.layoutMode === "GRID") {
            gridCount++;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const kids = (n.children || [])
              .map((c: any) => `${c.tag}(gcs=${c.gridColumnStart},w=${Math.round(c.width)})`)
              .join(", ");
            gridLines.push(`<${n.tag}> cols="${n.gridTemplateColumns}" gap=${n.gridColumnGap} kids=[${kids}]`);
          }
          (n.children || []).forEach(walk);
        };
        walk(root);
        logger.info(
          `[GRID-DIAG] layoutModeOpt=${layoutMode} format=${frames[0]?.capturedData ? "W2W" : "legacy"} total=${total} gridNodes=${gridCount} rootTag=${root?.tag} rootLayout=${root?.layoutMode}`
        );
        gridLines.slice(0, 25).forEach((l) => logger.info("[GRID-DIAG] " + l));
      } catch (e) {
        logger.warn("[GRID-DIAG] failed", { e: String(e) });
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
            const pluginStyleMap = await createPluginColorStyles(
              colors,
              `${derivedHostname}/Plugin`,
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
            const result = await createUnifiedWebsiteColorStyles(
              frames,
              cssVariables || [],
              derivedHostname
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

      // Collect assets that need conversion (AVIF/WebP → JPEG)
      const assetsToConvert: Array<{ url: string; dataUri: string; frameIdx: number }> = [];

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
                assetsToConvert.push({ url, dataUri, frameIdx: fi });
              } else {
                // Supported format — use directly
                fd.assets[url] = dataUri;
              }
            }
          }
        }
      }

      // Convert unsupported image formats via UI iframe (has Canvas/createImageBitmap)
      if (assetsToConvert.length > 0 && assetMode === "realAssets") {
        figma.ui.postMessage({
          type: "render-progress",
          data: { step: "Converting images for Figma...", percent: 8 },
        });

        logger.info("Converting unsupported images via UI iframe", {
          count: assetsToConvert.length,
        });

        // Send to UI for conversion and wait for response
        const convertedAssets = await new Promise<Array<{ url: string; dataUri: string; frameIdx: number }>>((resolve) => {
          // Temporarily add handler (will be overridden by next onmessage call)
          const origHandler = figma.ui.onmessage;
          figma.ui.onmessage = (msg) => {
            if (msg.type === "assets-converted") {
              figma.ui.onmessage = origHandler;
              resolve(msg.data?.convertedAssets || []);
            } else if (origHandler) {
              origHandler(msg, { origin: '' } as never);
            }
          };

          figma.ui.postMessage({
            type: "convert-assets",
            data: { assets: assetsToConvert },
          });

          // Timeout after 30s
          setTimeout(() => resolve([]), 30000);
        });

        // Merge converted assets
        for (const converted of convertedAssets) {
          const fd = frames[converted.frameIdx] as WireframeFrame;
          if (!fd.assets) fd.assets = {};
          fd.assets[converted.url] = converted.dataUri;
        }
        logger.info("Image conversion complete", {
          converted: convertedAssets.length,
          requested: assetsToConvert.length,
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
        assetMode: assetMode || "placeholders",
        assetsMap,
        interactionMode: interactionMode || "none",
        componentSets: [],
        hoverComponentCache: new Map(),
        renderStats: {
          hoverCacheHits: 0,
          hoverCacheMisses: 0,
          emptyPseudoSkipped: 0,
          pseudoErrors: 0,
        },
      };

      // Create effect styles (Phase 2) — shared shadow/blur library. Plugin
      // color mode returns empty map because effects are stripped upstream
      // for clean wireframes.
      if (variableMode === "styles") {
        try {
          const effectStyleMap = await createEffectStyles(
            frames,
            derivedHostname,
            effectiveColorMode
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
          const textStyleMap = await createTextStyles(
            frames,
            fontFamily,
            effectiveFontMode,
            originalFontNames,
            derivedHostname
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
          const gridStyleMap = await createGridStyles(frames, derivedHostname);
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
          const iconLib = await buildIconLibrary(frames, { componentIndex: 1 });
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
          const registry = await buildHoverMasterRegistry(
            frames,
            renderContext,
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

        for (let i = 0; i < frames.length; i++) {
          const viewportWidth = frames[i].viewportWidth;
          figma.notify(`Processing viewport ${i + 1}/${frames.length}…`, {
            timeout: 1000,
          });

          // Calculate progress
          const frameStartProgress = 25 + (i / frames.length) * 60;
          const frameEndProgress = 25 + ((i + 1) / frames.length) * 60;

          figma.ui.postMessage({
            type: "render-progress",
            data: {
              step: `Building elements for ${viewportWidth}px...`,
              percent: Math.round(frameStartProgress + 5),
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

          const wireframeFrame = await createWireframeFrame(
            frameData,
            sourceUrl,
            renderContext,
            i
          );
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

        // Wrap frame(s) in a Section
        figma.notify("Grouping frames in Section…", { timeout: 1000 });

        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Organizing frames...",
            percent: 90,
          },
        });

        // Create Section
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

        const viewport = figma.viewport.center;
        section.x = viewport.x - section.width / 2;
        section.y = viewport.y - section.height / 2;

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

        // The fresh import may have introduced substituted-font text — refresh
        // the count so the "Re-apply fonts" button surfaces if needed.
        postRebindableCount();
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

      // Pre-render font availability check
      const allFonts = collectAllFonts(frames);

      if (effectiveFontMode === "website") {
        const { missing } = await checkFontsAvailability(allFonts);

        if (missing.length > 0) {
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

          const autoOriginal: FontMapping = {};
          const stillMissing: string[] = [];
          for (const css of missing) {
            const real = realNames[css];
            if (real && real !== css && installedFamilies.has(real)) {
              autoOriginal[css] = real;
            } else {
              stillMissing.push(css);
            }
          }

          if (stillMissing.length === 0 && Object.keys(autoOriginal).length > 0) {
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
            postRebindableCount();
            return;
          }

          const pluginFontOptions = [
            pluginFont || "Montserrat",
            "Inter", "Roboto", "Open Sans", "Lato", "Poppins",
            "Source Sans Pro", "Nunito", "Arial", "Helvetica",
          ];
          // Deduplicate
          const uniqueOptions = Array.from(new Set(pluginFontOptions));

          const message = buildFontsNotAvailableMessage(
            missing,
            pluginFont || "Montserrat",
            uniqueOptions
          );

          pendingRenderData = { data, executeRender, missingFonts: missing };
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
        const scope =
          selection.length > 0
            ? collectTextNodesIn(selection as unknown as SceneNode[])
            : (figma.currentPage.findAll((n) => n.type === "TEXT") as TextNode[]);

        if (scope.length === 0) {
          figma.notify("Re-apply fonts: nothing to scan in this scope.");
          return;
        }

        const result = await rebindOriginalFonts(scope);
        const cumulative = result.previouslyRebound + result.rebound;

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
      }
      // Markers are cleared on successful re-apply — refresh so the button
      // hides once everything is re-applied (and stays if fonts still missing).
      postRebindableCount();
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
