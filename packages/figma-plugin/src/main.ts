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
import { logger } from "./utils/logger";
import { errorHandler, ErrorCode } from "./utils/errorHandler";
import type {
  WireframeNode,
  WireframeFrame,
  RenderWireframeData,
  RenderContext,
  FontMapping,
} from "./types";
import {
  normalizeColorForLookup,
  createPluginColorStyles,
  createUnifiedWebsiteColorStyles,
  createTextStyles,
  createWireframeFrame,
} from "./rendering";
import {
  collectAllFonts,
  checkFontsAvailability,
  buildFontsNotAvailableMessage,
  buildPluginModeFontMapping,
} from "./utils/fontUtils";

// ============================================================================
// Main Plugin Function
// ============================================================================

export default function () {
  showUI({ width: 410, height: 610 });

  // Pending render state for font fallback popup flow
  let pendingRenderData: {
    data: RenderWireframeData;
    executeRender: (font: string, fontMapping?: FontMapping, originalFontNames?: FontMapping) => Promise<void>;
    missingFonts: string[];
  } | null = null;

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Relay debug logs from UI iframe to sandbox console
    if (msg.type === "debug-log") {
      // relay UI debug to sandbox console
      console.log(msg.data);
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
      } else {
        console.warn("font-fallback-choice received but no pendingRenderData");
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

      // Determine font family based on fontMode
      const websiteFont = frames[0]?.tree?.fontFamily || "Inter";
      const websiteFontList = frames[0]?.tree?.fontFamilyList || [];
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


      logger.info("Creating wireframe", {
        frameCount: frames.length,
        sourceUrl,
        variableMode: variableMode || "direct",
        layoutMode: layoutMode || "autoLayout",
        cssVariablesCount: cssVariables?.length || 0,
        colorMode: effectiveColorMode,
        fontMode: effectiveFontMode,
        fontFamily,
      });

      figma.notify("Creating wireframe...", { timeout: 2000 });

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
          figma.notify("Creating plugin color styles...", { timeout: 1500 });
          try {
            const pluginStyleMap = await createPluginColorStyles(colors);
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
          figma.notify("Creating website color styles...", { timeout: 1500 });

          try {
            const result = await createUnifiedWebsiteColorStyles(
              frames,
              cssVariables || []
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

      // Build unified assets map from all frames
      const assetsMap = new Map<string, string>();
      console.log(`[W2W] assetMode="${assetMode}", frames count=${frames.length}`);
      if (assetMode === "realAssets") {
        for (const frame of frames) {
          const frameAssets = (frame as WireframeFrame).assets;
          console.log(`[W2W] Frame assets: ${frameAssets ? Object.keys(frameAssets).length : 0} entries`);
          if (frameAssets) {
            for (const [url, base64] of Object.entries(frameAssets)) {
              assetsMap.set(url, base64);
            }
          }
        }
        console.log(`[W2W] assetsMap built: ${assetsMap.size} entries`);
      } else {
        // Check if assets exist but mode is placeholders
        let totalAssets = 0;
        for (const frame of frames) {
          const frameAssets = (frame as WireframeFrame).assets;
          if (frameAssets) totalAssets += Object.keys(frameAssets).length;
        }
        if (totalAssets > 0) {
          console.warn(`[W2W] ⚠️ ${totalAssets} assets available but assetMode="${assetMode}" — images will be placeholders. Switch to "Real Assets" in More Options.`);
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
        assetMode: assetMode || "placeholders",
        assetsMap,
        interactionMode: interactionMode || "none",
        componentSets: [],
      };

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
            originalFontNames
          );
          renderContext.textStyleMap = textStyleMap;
          logger.info("Created text styles", {
            styleCount: textStyleMap.size,
          });
        } catch (err) {
          logger.warn("Failed to create text styles", { error: err });
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

      try {
        const createdFrames: FrameNode[] = [];

        for (let i = 0; i < frames.length; i++) {
          const viewportWidth = frames[i].viewportWidth;
          figma.notify(`Processing viewport ${i + 1}/${frames.length}...`, {
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

          const wireframeFrame = await createWireframeFrame(
            frames[i],
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
        figma.notify("Grouping frames in Section...", { timeout: 1000 });

        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Organizing frames...",
            percent: 90,
          },
        });

        // Create Section
        const section = figma.createSection();

        let hostname = "website";
        try {
          hostname = new URL(sourceUrl).hostname.replace("www.", "");
        } catch {
          // sourceUrl may not be a valid URL (e.g. "html-import" or missing protocol)
          // Try adding protocol, otherwise use raw sourceUrl if it looks like a domain
          try {
            hostname = new URL(`https://${sourceUrl}`).hostname.replace("www.", "");
          } catch {
            if (sourceUrl && sourceUrl !== "html-import") {
              hostname = sourceUrl;
            }
          }
        }

        const viewportWidths = frames.map((f) => f.viewportWidth).join(" + ");
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

        // Create separate Components Section for interaction variant ComponentSets
        if (renderContext.componentSets && renderContext.componentSets.length > 0) {
          const compSection = figma.createSection();
          compSection.name = `Components — ${hostname}`;
          compSection.fills = [
            { type: "SOLID", color: { r: 0xC0 / 255, g: 0xC0 / 255, b: 0xC0 / 255 } },
          ];

          const compPadding = 80;
          let compX = compPadding;
          let compY = compPadding;
          let rowMaxHeight = 0;
          let actualMaxRight = 0; // Track actual rightmost edge
          const maxRowWidth = 1400;

          for (const cs of renderContext.componentSets) {
            // Wrap to next row if this element would exceed max width
            if (compX + cs.width + compPadding > maxRowWidth && compX > compPadding) {
              compX = compPadding;
              compY += rowMaxHeight + compPadding;
              rowMaxHeight = 0;
            }

            compSection.appendChild(cs);
            cs.x = compX;
            cs.y = compY;

            // Track the actual rightmost edge of placed elements
            actualMaxRight = Math.max(actualMaxRight, compX + cs.width);
            compX += cs.width + compPadding;
            rowMaxHeight = Math.max(rowMaxHeight, cs.height);
          }

          // Size section to exactly fit all elements with padding
          compSection.resizeWithoutConstraints(
            actualMaxRight + compPadding,
            compY + rowMaxHeight + compPadding
          );

          // Position to the right of wireframe section
          compSection.x = section.x + section.width + 200;
          compSection.y = section.y;

          selectionTarget.push(compSection);

          logger.info("Created Components Section", {
            componentSetCount: renderContext.componentSets.length,
          });
        }

        logger.info("Created Section with frames", {
          frameCount: createdFrames.length,
          sectionName: section.name,
        });

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

        logger.info("Wireframe created successfully", {
          frameCount: createdFrames.length,
        });
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
        console.error("[W2W Sandbox] Unhandled render error:", error);
        figma.ui.postMessage({
          type: "wireframe-error",
          data: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown rendering error",
          },
        });
      }
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
  };
}
