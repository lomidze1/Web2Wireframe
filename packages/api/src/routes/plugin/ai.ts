/**
 * Screenshot import route
 * POST /api/import-screenshot
 */

import { Router, Request, Response } from "express";
import {
  DEFAULT_PLUGIN_COLORS,
  createLocalStylesStructure,
} from "../../utils/styleUtils.js";
import { convertAbsoluteToWireframeTree } from "../../lib/wireframeConverter.js";
import {
  analyzeScreenshotAbsoluteWithRetry,
  analyzeScreenshotTiled,
  scaleAbsoluteResult,
  validateExtractedColors,
  type ScreenshotTile,
} from "../../lib/aiGenerator.js";
import { requireImportAllowance } from "../../middleware/licenseGate.js";
import { authenticatePlugin } from "../../middleware/auth.js";
import { importRateLimiter } from "../../middleware/rateLimit.js";
import { logImportEvent } from "../../models/ImportEvent.js";

const router = Router();

// Formats the AI vision API accepts. Rejections here return 4xx, and
// requireImportAllowance refunds the consumed quota slot on any failure
// response — this route does not refund by hand.
const SUPPORTED_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;

interface ParsedTiles {
  tiles: ScreenshotTile[];
  tiledWidth: number;
  tiledHeight: number;
}

/**
 * Validate the optional tall-screenshot tiling fields.
 *
 * Anything malformed returns null and the request silently takes the legacy
 * single-image path — a degraded import beats a failed one, and the legacy
 * image is always present in the body. Bounds mirror clampDim's philosophy:
 * hostile numbers must not reach prompts or the AI client.
 */
function parseTiles(body: Record<string, unknown>): ParsedTiles | null {
  const { tiles, tiledWidth, tiledHeight } = body as {
    tiles?: unknown;
    tiledWidth?: unknown;
    tiledHeight?: unknown;
  };
  if (!Array.isArray(tiles) || tiles.length < 2 || tiles.length > 8) return null;

  const width = Number(tiledWidth);
  const height = Number(tiledHeight);
  if (!(width >= 320 && width <= 1600)) return null;
  if (!(height >= 1960 && height <= 30000)) return null;

  const parsed: ScreenshotTile[] = [];
  let totalBase64 = 0;
  for (const raw of tiles) {
    const t = raw as Record<string, unknown>;
    const imageBase64 = t.imageBase64;
    const tw = Number(t.width);
    const th = Number(t.height);
    const offsetY = Number(t.offsetY);
    if (typeof imageBase64 !== "string" || !SUPPORTED_IMAGE_RE.test(imageBase64)) return null;
    // All tiles share the tiled coordinate space's width.
    if (tw !== width) return null;
    if (!(th >= 320 && th <= 1600)) return null;
    if (!(offsetY >= 0 && offsetY <= 30000)) return null;
    totalBase64 += imageBase64.length;
    parsed.push({ imageBase64, width: tw, height: th, offsetY });
  }

  // ~20MB decoded across all tiles.
  if ((totalBase64 * 3) / 4 > 20 * 1024 * 1024) return null;

  // Tiles must start at the top, ascend, and cover the full height.
  if (parsed[0].offsetY !== 0) return null;
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].offsetY <= parsed[i - 1].offsetY) return null;
    // No vertical gaps between consecutive tiles.
    if (parsed[i].offsetY > parsed[i - 1].offsetY + parsed[i - 1].height) return null;
  }
  const last = parsed[parsed.length - 1];
  if (last.offsetY + last.height < height - 8) return null;

  return { tiles: parsed, tiledWidth: width, tiledHeight: height };
}

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
router.post("/import-screenshot", importRateLimiter, authenticatePlugin, requireImportAllowance("screenshot"), async (req: Request, res: Response) => {
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

    // Reject formats the AI vision API doesn't accept (AVIF/HEIC/SVG/…) —
    // previously these defaulted to image/png and failed downstream with a
    // burned quota slot and an opaque error.
    if (!SUPPORTED_IMAGE_RE.test(imageBase64 as string)) {
      void logImportEvent({
        figmaUserId: req.userId!,
        sourceUrl: "screenshot-import",
        type: "screenshot",
        viewports: Array.isArray(req.body?.viewports) ? req.body.viewports : [],
        success: false,
        errorCode: "UNSUPPORTED_IMAGE_FORMAT",
      });
      return res.status(400).json({
        success: false,
        error: "Unsupported image format. Please use PNG, JPEG, WebP, or GIF.",
        errorCode: "UNSUPPORTED_IMAGE_FORMAT",
      });
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

    // L-2: clamp every user-supplied dimension to a sane range BEFORE it
    // hits the AI prompt. The prompt interpolates these values, so without
    // clamping a hostile `imageWidth: 1e308` interpolates as
    // "1e+308" — pollutes the prompt and could confuse the model. Range
    // chosen to cover realistic viewports (mobile 320px → 4k 4000px) and
    // tall screenshots (200px → 4000px imageHeight).
    const clampDim = (v: unknown, fallback: number, min: number, max: number) =>
      Math.min(Math.max(Number(v) || fallback, min), max);

    // Coerce viewports to numbers (frontend may send string[]) + clamp.
    const numericViewports = (viewports as (string | number)[]).map((v) =>
      clampDim(v, 1440, 320, 4000),
    );
    const clampedImageWidth = clampDim(imageWidth, 1440, 320, 4000);
    const clampedImageHeight = clampDim(imageHeight, 900, 200, 4000);

    // Tall screenshots arrive additionally as overlapping full-width tiles so
    // the model sees every strip at full resolution instead of one image
    // crushed to the 1568px long-edge ceiling. Invalid/absent tiles → legacy
    // single-image path below, unchanged.
    const tiled = parseTiles(req.body);

    // Analyze ONCE in the image's natural coordinate space (viewportWidth =
    // imageWidth → the model does no coordinate arithmetic), then derive each
    // viewport frame by linear scaling server-side. The prompt only ever
    // asked the model for the same linear scaling, so per-viewport AI calls
    // were pure cost/latency waste (N viewports = N identical-image calls).
    const absoluteResult = tiled
      ? await analyzeScreenshotTiled({ textMode }, tiled.tiles, tiled.tiledWidth, tiled.tiledHeight)
      : await analyzeScreenshotAbsoluteWithRetry({
          imageBase64,
          imageWidth: clampedImageWidth,
          imageHeight: clampedImageHeight,
          viewportWidth: clampedImageWidth,
          textMode,
        });
    // Anchor the scaling source width when the model omitted pageWidth.
    if (!Number(absoluteResult.pageWidth)) {
      absoluteResult.pageWidth = clampedImageWidth;
    }

    // Use AI-extracted colors when colorMode is "website" — validated once,
    // so every frame, localStyles, and the response share one palette.
    let renderColors = finalPluginColors;
    if (colorMode === "website") {
      const { valid, colors } = validateExtractedColors(absoluteResult.extractedColors);
      renderColors = valid ? colors : finalPluginColors;
    }

    const frames = numericViewports.map((vp) => {
      const scaled = scaleAbsoluteResult(absoluteResult, vp);
      const tree = convertAbsoluteToWireframeTree(scaled, vp, renderColors, pluginFont);
      return {
        viewportWidth: vp,
        viewportHeight: Number(scaled.pageHeight) || 0,
        tree,
      };
    });

    // Create local styles structure
    const localStyles = createLocalStylesStructure(renderColors, {
      primary: pluginFont,
    });

    // Record the attempt (no real URL — uploaded image), so the import
    // counter and the per-user history stay in sync.
    void logImportEvent({
      figmaUserId: req.userId!,
      sourceUrl: "screenshot-import",
      type: "screenshot",
      viewports: numericViewports,
      params: {
        colorMode,
        textMode,
        pluginFont,
        typographyMode: req.body?.typographyMode,
        assetMode: req.body?.assetMode,
        cssVariablesMode: req.body?.cssVariablesMode,
        layoutMode: req.body?.layoutMode,
        tiles: tiled ? tiled.tiles.length : undefined,
      },
      success: true,
    });

    res.json({
      success: true,
      wireframeData: { frames },
      localStyles,
      pluginColors: renderColors,
      sourceUrl: "screenshot://uploaded",
      ...(tiled ? { tiling: { tiles: tiled.tiles.length } } : {}),
    });
  } catch (error) {
    const err = error as Error & { status?: number; code?: string };
    console.error("[Screenshot Import] Error:", err.message || error);

    // Log the failed attempt — surfaces screenshots the AI pipeline rejects.
    const failureCode =
      err.code === "TRUNCATED"
        ? "SCREENSHOT_TRUNCATED"
        : err.status === 429
          ? "AI_RATE_LIMITED"
          : err.status === 401 || err.status === 403
            ? "AI_AUTH_ERROR"
            : "SCREENSHOT_ANALYSIS_ERROR";
    void logImportEvent({
      figmaUserId: req.userId!,
      sourceUrl: "screenshot-import",
      type: "screenshot",
      viewports: Array.isArray(req.body?.viewports) ? req.body.viewports : [],
      params: {
        colorMode: req.body?.colorMode,
        textMode: req.body?.textMode,
        pluginFont: req.body?.pluginFont,
        typographyMode: req.body?.typographyMode,
        assetMode: req.body?.assetMode,
        cssVariablesMode: req.body?.cssVariablesMode,
        layoutMode: req.body?.layoutMode,
      },
      success: false,
      errorCode: failureCode,
    });

    if (err.code === "TRUNCATED") {
      return res.status(422).json({
        success: false,
        error: "Screenshot is too complex or tall to analyze fully. Try cropping it into smaller sections and importing them separately.",
        errorCode: "SCREENSHOT_TRUNCATED",
      });
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
      error: "Failed to analyze screenshot",
      errorCode: "SCREENSHOT_ANALYSIS_ERROR",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

export default router;
