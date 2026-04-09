/**
 * Website + HTML import routes
 * POST /api/import-url
 * POST /api/import-html
 */

import { Router, Request, Response } from "express";
import Wireframe from "../../models/Wireframe.js";
import { createWireframeData, buildFullPage, createWireframeDataFromHTML, createWireframeDataW2W, createWireframeDataFromHTMLW2W } from "../../lib/htmlExtractor.js";
import {
  DEFAULT_PLUGIN_COLORS,
  createLocalStylesStructure,
} from "../../utils/styleUtils.js";
import { validateUrl } from "../../utils/urlValidation.js";
import { mongoConnected } from "../../state.js";

const router = Router();

/**
 * POST /api/import-url - Main endpoint to import website and generate wireframe
 *
 * Request body:
 * - userId: string (required)
 * - sourceUrl: string (required) - URL to import
 * - viewports: number[] - Viewport widths [1920, 1440, 1024, 768, 375]
 * - colorMode: "plugin" | "website"
 * - fontMode: "plugin" | "website" | "lines"
 * - textMode: "website" | "lorem" | "semantic"
 * - pluginColors: object - Custom plugin color overrides
 * - pluginFont: string - Custom plugin font (e.g., "Montserrat", "Arial")
 */
router.post("/import-url", async (req: Request, res: Response) => {
  try {
    const {
      userId,
      sourceUrl,
      viewports = [1440],
      colorMode = "plugin",
      typographyMode = "plugin",
      textMode = "website",
      pluginColors = {},
      pluginFont = "Montserrat",
    } = req.body;

    // Validation
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid userId",
      });
    }

    if (!sourceUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: sourceUrl",
      });
    }

    // Validate and normalize URL
    const urlValidation = validateUrl(sourceUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({
        success: false,
        error: urlValidation.error || "Invalid URL",
      });
    }
    const normalizedSourceUrl = urlValidation.url;

    // Validate colorMode (matches RenderWireframeData from @w2w/shared-types)
    const validColorModes = ["plugin", "website"];
    if (!validColorModes.includes(colorMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid colorMode. Must be one of: ${validColorModes.join(", ")}`,
      });
    }

    // Validate fontMode (matches RenderWireframeData from @w2w/shared-types)
    const validFontModes = ["plugin", "website", "lines"];
    if (!validFontModes.includes(typographyMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid fontMode. Must be one of: ${validFontModes.join(", ")}`,
      });
    }

    // Validate textMode
    const validTextModes = ["website", "lorem", "semantic"];
    if (!validTextModes.includes(textMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid textMode. Must be one of: ${validTextModes.join(", ")}`,
      });
    }

    // Merge custom plugin colors with defaults
    const finalPluginColors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

    // Generate wireframe data using W2W content script pipeline
    // This uses the same extraction code as Browser Extension for pixel-identical output
    console.log(`[W2W] /import-url: starting W2W extraction for ${normalizedSourceUrl}`);
    const { frames, cssVariables, fonts } = await createWireframeDataW2W(normalizedSourceUrl!, viewports);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const assetCount = f.assets ? Object.keys(f.assets).length : 0;
      console.log(`[W2W] /import-url: frame[${i}] viewport=${f.viewportWidth}x${f.viewportHeight} | assets: ${assetCount}`);
    }

    if (!frames || frames.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to extract wireframe data from URL",
      });
    }

    // Create local styles structure
    const localStyles = createLocalStylesStructure(finalPluginColors, {
      primary: pluginFont,
    });

    // Save to MongoDB if connected (optional)
    let wireframeId = null;
    if (mongoConnected) {
      try {
        const wireframe = new Wireframe({
          userId,
          sourceUrl: normalizedSourceUrl,
          viewports: viewports.filter((v: number) =>
            [375, 768, 1024, 1440, 1920].includes(v)
          ),
          colorMode,
          typographyMode,
          textMode,
          status: "completed",
          wireframeData: { frames },
          localStyles,
        });
        await wireframe.save();
        wireframeId = wireframe._id;
      } catch (dbError) {
        console.warn("[Import] Failed to save wireframe to database:", (dbError as Error).message);
      }
    }

    res.json({
      success: true,
      wireframeId,
      sourceUrl: normalizedSourceUrl,
      viewports,
      colorMode,
      typographyMode,
      textMode,
      frameCount: frames.length,
      wireframeData: { frames },
      localStyles,
      pluginColors: finalPluginColors,
      cssVariables: cssVariables || [],
      fonts: fonts || [],
    });
  } catch (error) {
    console.error("[Import] Error:", error);

    // Detailed error response
    const err = error as Error;
    let errorMessage = err.message;
    let errorCode = "IMPORT_ERROR";

    if (err.message.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "Website took too long to load. Please try again or use a different URL.";
    } else if (err.message.includes("net::ERR")) {
      errorCode = "NETWORK_ERROR";
      errorMessage = "Could not reach the website. Please check the URL and try again.";
    } else if (err.message.includes("Navigation failed")) {
      errorCode = "NAVIGATION_ERROR";
      errorMessage = "Could not navigate to the website. It may be blocking automated access.";
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      errorCode,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

/**
 * POST /api/import-html - Import raw HTML+CSS and generate wireframe
 *
 * Request body:
 * - htmlCode: string (required) - Raw HTML content
 * - cssCode: string (optional) - CSS styles
 * - viewports: number[] - Viewport widths
 * - colorMode: "plugin" | "website"
 * - fontMode: "plugin" | "website" | "lines"
 * - textMode: "website" | "lorem" | "semantic"
 * - pluginColors: object
 * - pluginFont: string
 */
router.post("/import-html", async (req: Request, res: Response) => {
  try {
    const {
      htmlCode,
      cssCode = "",
      viewports = [1440],
      colorMode = "plugin",
      typographyMode = "plugin",
      textMode = "website",
      pluginColors = {},
      pluginFont = "Montserrat",
    } = req.body;

    // Validation
    if (!htmlCode || typeof htmlCode !== "string" || !htmlCode.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: htmlCode (non-empty string)",
      });
    }

    // Validate colorMode (matches RenderWireframeData from @w2w/shared-types)
    const validColorModes = ["plugin", "website"];
    if (!validColorModes.includes(colorMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid colorMode. Must be one of: ${validColorModes.join(", ")}`,
      });
    }

    // Validate fontMode (matches RenderWireframeData from @w2w/shared-types)
    const validFontModes = ["plugin", "website", "lines"];
    if (!validFontModes.includes(typographyMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid fontMode. Must be one of: ${validFontModes.join(", ")}`,
      });
    }

    // Validate textMode
    const validTextModes = ["website", "lorem", "semantic"];
    if (!validTextModes.includes(textMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid textMode. Must be one of: ${validTextModes.join(", ")}`,
      });
    }

    // Merge custom plugin colors with defaults
    const finalPluginColors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

    // Generate wireframe data using W2W content script pipeline
    const { frames, cssVariables, fonts } = await createWireframeDataFromHTMLW2W(htmlCode, cssCode, viewports);

    if (!frames || frames.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to extract wireframe data from HTML",
      });
    }

    // Create local styles structure
    const localStyles = createLocalStylesStructure(finalPluginColors, {
      primary: pluginFont,
    });

    // No MongoDB save -- ephemeral HTML import

    res.json({
      success: true,
      sourceUrl: "html-import",
      frameCount: frames.length,
      wireframeData: { frames },
      localStyles,
      pluginColors: finalPluginColors,
      cssVariables: cssVariables || [],
      fonts: fonts || [],
    });
  } catch (error) {
    console.error("[HTML Import] Error:", error);

    const err = error as Error;
    let errorMessage = err.message;
    let errorCode = "HTML_IMPORT_ERROR";

    if (err.message.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "HTML rendering took too long. Please simplify your HTML and try again.";
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      errorCode,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

export default router;
