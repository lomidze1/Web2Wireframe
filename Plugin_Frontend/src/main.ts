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
  RenderWireframeData,
  RenderContext,
} from "./types";
import {
  normalizeColorForLookup,
  createColorStylesFromVariables,
  createPluginColorStyles,
  createWireframeFrame,
} from "./rendering";

// ============================================================================
// Main Plugin Function
// ============================================================================

export default function () {
  showUI({ width: 400, height: 600 });

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Handle render-wireframe message
    if (msg.type === "render-wireframe") {
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
      const fontFamily =
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
        } else if (cssVariables && cssVariables.length > 0) {
          figma.notify("Creating color styles from CSS variables...", {
            timeout: 1500,
          });
          try {
            const styleMap = await createColorStylesFromVariables(
              cssVariables,
              sourceUrl
            );
            logger.info("Created color styles", { styleCount: styleMap.size });

            for (const variable of cssVariables) {
              const normalizedValue = normalizeColorForLookup(variable.value);
              const style = styleMap.get(variable.name);
              if (style && normalizedValue) {
                colorStyleMap.set(normalizedValue, style);
              }
            }
          } catch (err) {
            logger.warn("Failed to create color styles", { error: err });
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
      };

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

        // If multiple frames, wrap in a Section
        let selectionTarget: SceneNode[] = createdFrames;

        if (createdFrames.length > 1) {
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
            // Use default
          }

          const viewportWidths = frames.map((f) => f.viewportWidth).join(" + ");
          const timestamp = new Date().toLocaleString();
          section.name = `${hostname} (${viewportWidths}) - Web2Wireframe - ${timestamp}`;

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

          selectionTarget = [section];

          logger.info("Created Section with frames", {
            frameCount: createdFrames.length,
            sectionName: section.name,
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
    }

    // Handle open-wireframe message from Library
    if (msg.type === "open-wireframe") {
      logger.debug("Open wireframe requested", { data: msg.data });
      // TODO: Implement opening saved wireframes
    }

    // Handle community wireframe usage
    if (msg.type === "use-community-wireframe") {
      logger.debug("Use community wireframe requested", { data: msg.data });
      // TODO: Implement community wireframe insertion
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
