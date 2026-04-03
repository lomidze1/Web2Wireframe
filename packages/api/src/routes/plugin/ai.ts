/**
 * AI generation routes
 * POST /api/generate-page
 * POST /api/generate-block
 * POST /api/import-screenshot
 */

import { Router, Request, Response } from "express";
import {
  DEFAULT_PLUGIN_COLORS,
  createLocalStylesStructure,
} from "../../utils/styleUtils.js";
import { convertToWireframeTree, convertAbsoluteToWireframeTree, type SimplifiedJSON } from "../../lib/wireframeConverter.js";
import {
  generateWithRetry,
  analyzeScreenshotAbsoluteWithRetry,
  validateExtractedColors,
  VALID_PAGE_TYPES,
  VALID_BLOCK_TYPES,
} from "../../lib/aiGenerator.js";

const router = Router();

/**
 * POST /api/generate-page - AI-powered wireframe page generation
 *
 * Request body:
 * - userId: string (required)
 * - pageType: string (required) - "home", "pricing", etc.
 * - sections: string[] - Sections to include ["Hero", "Features", ...]
 * - density: "balanced" | "detailed" (default: "balanced")
 * - viewports: number[] - Viewport widths (default: [1440])
 * - notes: string - Optional special requirements
 * - pluginColors: object - Plugin color palette
 * - pluginFont: string - Plugin font (default: "Inter")
 */
router.post("/generate-page", async (req: Request, res: Response) => {
  try {
    const {
      userId,
      pageType,
      sections,
      density = "balanced",
      viewports = [1440],
      notes = "",
      pluginColors = {},
      pluginFont = "Inter",
    } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }
    if (!pageType) {
      return res.status(400).json({ success: false, error: "pageType is required" });
    }
    if (!VALID_PAGE_TYPES.includes(pageType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid pageType: ${pageType}. Must be one of: ${VALID_PAGE_TYPES.join(", ")}`,
      });
    }
    if (!["balanced", "detailed"].includes(density)) {
      return res.status(400).json({ success: false, error: "density must be 'balanced' or 'detailed'" });
    }

    // TODO: License validation (Phase 3)
    // TODO: Rate limiting (Phase 3)

    // Merge plugin colors with defaults
    const finalPluginColors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

    // Generate for each viewport
    const frames = [];
    for (const vp of viewports) {
      const simplified = await generateWithRetry({
        type: "page",
        pageType,
        sections,
        density,
        viewportWidth: vp,
        notes,
      });

      const tree = convertToWireframeTree(
        simplified as unknown as SimplifiedJSON,
        vp, finalPluginColors, pluginFont,
      );

      frames.push({
        viewportWidth: vp,
        viewportHeight: simplified.totalHeight || 0,
        tree,
      });
    }

    // Create local styles structure
    const localStyles = createLocalStylesStructure(finalPluginColors, {
      primary: pluginFont,
    });

    res.json({
      success: true,
      wireframeData: { frames },
      localStyles,
      pluginColors: finalPluginColors,
      sourceUrl: `ai://${pageType}-page`,
    });
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("[AI Generate Page] Error:", err.message || error);
    console.error("[AI Generate Page] Status:", err.status, "| Type:", err.constructor?.name);
    if (err.status === 401 || err.status === 403) {
      console.error("[AI Generate Page] API KEY issue! Key present:", !!process.env.ANTHROPIC_API_KEY);
    }

    if (err.status === 429) {
      return res.status(429).json({
        success: false,
        error: "AI service rate limited. Please try again in a moment.",
        errorCode: "AI_RATE_LIMITED",
      });
    }
    if (err.status === 401 || err.status === 403) {
      return res.status(500).json({
        success: false,
        error: "AI service configuration error. Please contact support.",
        errorCode: "AI_AUTH_ERROR",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to generate wireframe",
      errorCode: "AI_GENERATION_ERROR",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

/**
 * POST /api/generate-block - AI-powered single block/section generation
 *
 * Request body:
 * - userId: string (required)
 * - blockType: string (required) - "hero", "features", etc.
 * - density: "balanced" | "detailed" (default: "balanced")
 * - viewports: number[] - Viewport widths (default: [1440])
 * - notes: string - Optional special requirements
 * - pluginColors: object - Plugin color palette
 * - pluginFont: string - Plugin font (default: "Inter")
 */
router.post("/generate-block", async (req: Request, res: Response) => {
  try {
    const {
      userId,
      blockType,
      density = "balanced",
      viewports = [1440],
      notes = "",
      pluginColors = {},
      pluginFont = "Inter",
    } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }
    if (!blockType) {
      return res.status(400).json({ success: false, error: "blockType is required" });
    }
    if (!VALID_BLOCK_TYPES.includes(blockType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid blockType: ${blockType}. Must be one of: ${VALID_BLOCK_TYPES.join(", ")}`,
      });
    }
    if (!["balanced", "detailed"].includes(density)) {
      return res.status(400).json({ success: false, error: "density must be 'balanced' or 'detailed'" });
    }

    // TODO: License validation (Phase 3)
    // TODO: Rate limiting (Phase 3)

    // Merge plugin colors with defaults
    const finalPluginColors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

    // Generate for each viewport
    const frames = [];
    for (const vp of viewports) {
      const simplified = await generateWithRetry({
        type: "block",
        blockType,
        density,
        viewportWidth: vp,
        notes,
      });

      const tree = convertToWireframeTree(
        simplified as unknown as SimplifiedJSON,
        vp, finalPluginColors, pluginFont,
      );

      frames.push({
        viewportWidth: vp,
        viewportHeight: simplified.totalHeight || 0,
        tree,
      });
    }

    // Create local styles structure
    const localStyles = createLocalStylesStructure(finalPluginColors, {
      primary: pluginFont,
    });

    res.json({
      success: true,
      wireframeData: { frames },
      localStyles,
      pluginColors: finalPluginColors,
      sourceUrl: `ai://${blockType}-block`,
    });
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("[AI Generate Block] Error:", err.message || error);
    console.error("[AI Generate Block] Status:", err.status, "| Type:", err.constructor?.name);
    if (err.status === 401 || err.status === 403) {
      console.error("[AI Generate Block] API KEY issue! Key present:", !!process.env.ANTHROPIC_API_KEY);
    }

    if (err.status === 429) {
      return res.status(429).json({
        success: false,
        error: "AI service rate limited. Please try again in a moment.",
        errorCode: "AI_RATE_LIMITED",
      });
    }
    if (err.status === 401 || err.status === 403) {
      return res.status(500).json({
        success: false,
        error: "AI service configuration error. Please contact support.",
        errorCode: "AI_AUTH_ERROR",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to generate wireframe block",
      errorCode: "AI_GENERATION_ERROR",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

/**
 * POST /api/import-screenshot
 * Analyze a screenshot using Claude Vision and convert to wireframe
 *
 * Body:
 * - imageBase64: string (required) - Base64 encoded image with data URI prefix
 * - imageWidth: number - Original image width
 * - imageHeight: number - Original image height
 * - viewports: number[] - Viewport widths (default: [1440])
 * - pluginColors: object - Plugin color palette
 * - pluginFont: string - Plugin font (default: "Inter")
 * - textMode: string - Text handling mode: "website"|"lorem"|"semantic" (default: "website")
 */
router.post("/import-screenshot", async (req: Request, res: Response) => {
  try {
    const {
      imageBase64,
      imageWidth = 1440,
      imageHeight = 900,
      viewports = [1440],
      pluginColors = {},
      pluginFont = "Inter",
      textMode = "website",
      colorMode = "plugin",
    } = req.body;

    // Validation
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "imageBase64 is required" });
    }

    // Check base64 size (~5MB limit -- base64 is ~33% larger than binary)
    const base64Length = (imageBase64 as string).length - ((imageBase64 as string).indexOf(",") + 1);
    const estimatedBytes = (base64Length * 3) / 4;
    if (estimatedBytes > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: "Image too large. Maximum size is 5MB.",
        errorCode: "IMAGE_TOO_LARGE",
      });
    }

    if (!["website", "lorem", "semantic"].includes(textMode)) {
      return res.status(400).json({ success: false, error: "textMode must be 'website', 'lorem', or 'semantic'" });
    }

    if (!["plugin", "website"].includes(colorMode)) {
      return res.status(400).json({ success: false, error: "colorMode must be 'plugin' or 'website'" });
    }

    // Merge plugin colors with defaults
    const finalPluginColors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

    // Coerce viewports to numbers (frontend may send string[])
    const numericViewports = (viewports as (string | number)[]).map((v) => Number(v) || 1440);

    // Analyze and generate for each viewport (absolute positioning mode)
    const frames = [];
    let renderColors = finalPluginColors;
    for (const vp of numericViewports) {
      const absoluteResult = await analyzeScreenshotAbsoluteWithRetry({
        imageBase64,
        imageWidth: Number(imageWidth) || 1440,
        imageHeight: Number(imageHeight) || 900,
        viewportWidth: vp,
        textMode,
      });

      // Use AI-extracted colors when colorMode is "website"
      if (colorMode === "website") {
        const { valid, colors } = validateExtractedColors(absoluteResult.extractedColors);
        renderColors = valid ? colors : finalPluginColors;
      }

      const tree = convertAbsoluteToWireframeTree(absoluteResult, vp, renderColors, pluginFont);

      frames.push({
        viewportWidth: vp,
        viewportHeight: Number(absoluteResult.pageHeight) || 0,
        tree,
      });
    }

    // Create local styles structure
    const localStyles = createLocalStylesStructure(renderColors, {
      primary: pluginFont,
    });

    res.json({
      success: true,
      wireframeData: { frames },
      localStyles,
      pluginColors: renderColors,
      sourceUrl: "screenshot://uploaded",
    });
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("[Screenshot Import] Error:", err.message || error);

    if (err.status === 429) {
      return res.status(429).json({
        success: false,
        error: "AI service rate limited. Please try again in a moment.",
        errorCode: "AI_RATE_LIMITED",
      });
    }
    if (err.status === 401 || err.status === 403) {
      return res.status(500).json({
        success: false,
        error: "AI service configuration error. Please contact support.",
        errorCode: "AI_AUTH_ERROR",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to analyze screenshot",
      errorCode: "SCREENSHOT_ANALYSIS_ERROR",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

export default router;
