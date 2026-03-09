require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Wireframe = require("../models/Wireframe");
const UserSettings = require("../models/UserSettings");
const { createWireframeData, buildFullPage, createWireframeDataFromHTML } = require("../lib/htmlExtractor");
const {
  DEFAULT_PLUGIN_COLORS,
  DEFAULT_PLUGIN_FONTS,
  createLocalStylesStructure,
  getColorByMode,
  getFontByMode,
} = require("../utils/styleUtils");
const { validateUrl } = require("../utils/urlValidation");
const { convertToWireframeTree } = require("../lib/wireframeConverter");
const {
  generateWithRetry,
  analyzeScreenshotWithRetry,
  validateSimplifiedFormat,
  VALID_PAGE_TYPES,
  VALID_BLOCK_TYPES,
} = require("../lib/aiGenerator");

const app = express();

// Middleware - CORS configuration for Figma plugin (origin 'null')
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: !corsOrigin || corsOrigin === "*" ? true : corsOrigin.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));

// MongoDB Connection (optional - wireframe generation works without it)
let mongoConnected = false;
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/web2wireframe")
  .then(() => {
    mongoConnected = true;
  })
  .catch((err) => {
    console.warn("MongoDB connection failed (wireframe generation will still work):", err.message);
    mongoConnected = false;
  });

// In-memory storage for pending CDP imports from Browser Extension
// Key: unique import ID, Value: { data, timestamp, expires }
const pendingCDPImports = new Map();

// Cleanup expired imports every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingCDPImports.entries()) {
    if (now > entry.expires) {
      pendingCDPImports.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * POST /api/import-url - Main endpoint to import website and generate wireframe
 *
 * Request body:
 * - userId: string (required)
 * - sourceUrl: string (required) - URL to import
 * - viewports: number[] - Viewport widths [1920, 1440, 1024, 768, 375]
 * - colorMode: "plugin-colors" | "website-colors"
 * - typographyMode: "plugin-fonts" | "website-fonts"
 * - textMode: "website" | "lorem" | "semantic"
 * - pluginColors: object - Custom plugin color overrides
 * - pluginFont: string - Custom plugin font (e.g., "Montserrat", "Arial")
 */
app.post("/api/import-url", async (req, res) => {
  try {
    const {
      userId,
      sourceUrl,
      viewports = [1440],
      colorMode = "plugin-colors",
      typographyMode = "plugin-fonts",
      textMode = "website",
      pluginColors = {},
      pluginFont = "Montserrat",
    } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: userId",
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

    // Validate colorMode
    const validColorModes = ["plugin-colors", "website-colors"];
    if (!validColorModes.includes(colorMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid colorMode. Must be one of: ${validColorModes.join(", ")}`,
      });
    }

    // Validate typographyMode
    const validTypographyModes = ["plugin-fonts", "website-fonts"];
    if (!validTypographyModes.includes(typographyMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid typographyMode. Must be one of: ${validTypographyModes.join(", ")}`,
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

    // Generate wireframe data with nested tree structure
    const { frames, cssVariables } = await createWireframeData(normalizedSourceUrl, viewports, {
      colorMode,
      textMode,
      typographyMode,
      pluginColors: finalPluginColors,
      pluginFont,
    });

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
          viewports: viewports.filter((v) =>
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
        console.warn("[Import] Failed to save wireframe to database:", dbError.message);
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
    });
  } catch (error) {
    console.error("[Import] Error:", error);

    // Detailed error response
    let errorMessage = error.message;
    let errorCode = "IMPORT_ERROR";

    if (error.message.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "Website took too long to load. Please try again or use a different URL.";
    } else if (error.message.includes("net::ERR")) {
      errorCode = "NETWORK_ERROR";
      errorMessage = "Could not reach the website. Please check the URL and try again.";
    } else if (error.message.includes("Navigation failed")) {
      errorCode = "NAVIGATION_ERROR";
      errorMessage = "Could not navigate to the website. It may be blocking automated access.";
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      errorCode,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
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
 * - colorMode: "plugin-colors" | "website-colors"
 * - typographyMode: "plugin-fonts" | "website-fonts"
 * - textMode: "website" | "lorem" | "semantic"
 * - pluginColors: object
 * - pluginFont: string
 */
app.post("/api/import-html", async (req, res) => {
  try {
    const {
      htmlCode,
      cssCode = "",
      viewports = [1440],
      colorMode = "plugin-colors",
      typographyMode = "plugin-fonts",
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

    // Validate colorMode
    const validColorModes = ["plugin-colors", "website-colors"];
    if (!validColorModes.includes(colorMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid colorMode. Must be one of: ${validColorModes.join(", ")}`,
      });
    }

    // Validate typographyMode
    const validTypographyModes = ["plugin-fonts", "website-fonts"];
    if (!validTypographyModes.includes(typographyMode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid typographyMode. Must be one of: ${validTypographyModes.join(", ")}`,
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

    // Build full HTML document from fragments
    const fullHTML = buildFullPage(htmlCode, cssCode);

    // Generate wireframe data
    const { frames, cssVariables } = await createWireframeDataFromHTML(fullHTML, viewports, {
      colorMode,
      textMode,
      typographyMode,
      pluginColors: finalPluginColors,
      pluginFont,
    });

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

    // No MongoDB save — ephemeral HTML import

    res.json({
      success: true,
      sourceUrl: "html-import",
      frameCount: frames.length,
      wireframeData: { frames },
      localStyles,
      pluginColors: finalPluginColors,
      cssVariables: cssVariables || [],
    });
  } catch (error) {
    console.error("[HTML Import] Error:", error);

    let errorMessage = error.message;
    let errorCode = "HTML_IMPORT_ERROR";

    if (error.message.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "HTML rendering took too long. Please simplify your HTML and try again.";
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      errorCode,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// GET /api/wireframe/:id - Get wireframe by ID
app.get("/api/wireframe/:id", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      });
    }

    const wireframe = await Wireframe.findById(req.params.id);
    if (!wireframe) {
      return res.status(404).json({
        success: false,
        error: "Wireframe not found",
      });
    }
    res.json({
      success: true,
      wireframe,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/wireframe-history/:userId - Get user's wireframe history
app.get("/api/wireframe-history/:userId", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      });
    }

    const { limit = 10, skip = 0 } = req.query;
    const wireframes = await Wireframe.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select("_id sourceUrl viewports colorMode typographyMode textMode status createdAt");

    const total = await Wireframe.countDocuments({ userId: req.params.userId });

    res.json({
      success: true,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      wireframes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/save-settings - Save user settings
app.post("/api/save-settings", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      });
    }

    const {
      userId,
      defaultColorMode = "plugin-colors",
      defaultViewports = [1440, 375],
      defaultTypographyMode = "plugin-fonts",
      defaultTextMode = "website",
      pluginColors = {},
      pluginFont = "Montserrat",
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId",
      });
    }

    const settings = await UserSettings.findOneAndUpdate(
      { userId },
      {
        userId,
        defaultColorMode,
        defaultViewports,
        defaultTypographyMode,
        defaultTextMode,
        pluginColors,
        pluginFont,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/settings/:userId - Get user settings
app.get("/api/settings/:userId", async (req, res) => {
  try {
    if (!mongoConnected) {
      // Return default settings if DB not available
      return res.json({
        success: true,
        settings: {
          userId: req.params.userId,
          defaultColorMode: "plugin-colors",
          defaultViewports: [1440, 375],
          defaultTypographyMode: "plugin-fonts",
          defaultTextMode: "website",
          pluginColors: DEFAULT_PLUGIN_COLORS,
          pluginFont: "Montserrat",
        },
      });
    }

    let settings = await UserSettings.findOne({ userId: req.params.userId });
    if (!settings) {
      settings = new UserSettings({
        userId: req.params.userId,
        pluginColors: DEFAULT_PLUGIN_COLORS,
      });
      await settings.save();
    }

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/import-cdp - Import from Browser Extension (CDP-captured data)
 *
 * This endpoint receives pre-extracted data from the Browser Extension
 * which uses Chrome DevTools Protocol for higher quality extraction.
 * Stores data in memory for Plugin to fetch via GET /api/pending-import.
 *
 * Request body:
 * - captureData: CaptureResult from Browser Extension
 * - timestamp: number
 */
app.post("/api/import-cdp", async (req, res) => {
  try {
    const { captureData, timestamp } = req.body;

    if (!captureData) {
      return res.status(400).json({
        success: false,
        error: "Missing captureData from Browser Extension",
      });
    }

    // CDP data now contains frames array (multi-viewport support)
    // Each frame has { viewport: { width, height }, tree: ExtractedElement }
    const frames = (captureData.frames || []).map(frame => ({
      viewportWidth: frame.viewport.width,
      viewportHeight: frame.viewport.height,
      tree: frame.tree,
    }));

    // Extract viewport widths for response
    const viewports = frames.map(f => f.viewportWidth);

    // Create local styles structure
    const localStyles = createLocalStylesStructure(DEFAULT_PLUGIN_COLORS, {
      primary: "Montserrat",
    });

    // Generate unique import ID
    const importId = `cdp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store in pending imports (expires in 10 minutes)
    const importData = {
      success: true,
      importId,
      sourceUrl: captureData.url,
      title: captureData.title,
      viewports,
      frameCount: frames.length,
      wireframeData: { frames },
      localStyles,
      fonts: captureData.fonts || [],
      cssVariables: captureData.cssVariables || [],
      cdpMetadata: {
        captureTimestamp: timestamp,
        hasMatchedStyles: true,
        hasGradients: true,
      },
    };

    pendingCDPImports.set(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    res.json({
      success: true,
      importId,
      message: "Data received. Open Figma plugin to import.",
    });
  } catch (error) {
    console.error("[CDP Import] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: "CDP_IMPORT_ERROR",
    });
  }
});

/**
 * GET /api/pending-import - Check for pending CDP imports
 * Returns the most recent pending import and removes it from storage.
 */
app.get("/api/pending-import", (req, res) => {
  // Find the most recent pending import
  let latestEntry = null;
  let latestId = null;

  for (const [id, entry] of pendingCDPImports.entries()) {
    if (!latestEntry || entry.timestamp > latestEntry.timestamp) {
      latestEntry = entry;
      latestId = id;
    }
  }

  if (!latestEntry) {
    return res.json({
      success: true,
      hasPending: false,
      message: "No pending imports from Browser Extension",
    });
  }

  // Remove from pending (one-time fetch)
  pendingCDPImports.delete(latestId);

  res.json({
    success: true,
    hasPending: true,
    ...latestEntry.data,
  });
});

/**
 * DELETE /api/pending-import - Clear all pending imports
 */
app.delete("/api/pending-import", (req, res) => {
  const count = pendingCDPImports.size;
  pendingCDPImports.clear();
  res.json({
    success: true,
    message: `Cleared ${count} pending import(s)`,
  });
});

// GET /api/default-colors - Get default plugin colors
app.get("/api/default-colors", (req, res) => {
  res.json({
    success: true,
    colors: DEFAULT_PLUGIN_COLORS,
  });
});

// GET /api/default-fonts - Get default plugin fonts
app.get("/api/default-fonts", (req, res) => {
  res.json({
    success: true,
    fonts: DEFAULT_PLUGIN_FONTS,
  });
});

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
app.post("/api/generate-page", async (req, res) => {
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

      const tree = convertToWireframeTree(simplified, vp, finalPluginColors, pluginFont);

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
    console.error("[AI Generate Page] Error:", error.message || error);
    console.error("[AI Generate Page] Status:", error.status, "| Type:", error.constructor?.name);
    if (error.status === 401 || error.status === 403) {
      console.error("[AI Generate Page] API KEY issue! Key starts with:", process.env.ANTHROPIC_API_KEY?.substring(0, 12) + "...", "Length:", process.env.ANTHROPIC_API_KEY?.length);
    }

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: "AI service rate limited. Please try again in a moment.",
        errorCode: "AI_RATE_LIMITED",
      });
    }
    if (error.status === 401 || error.status === 403) {
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
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
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
app.post("/api/generate-block", async (req, res) => {
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

      const tree = convertToWireframeTree(simplified, vp, finalPluginColors, pluginFont);

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
    console.error("[AI Generate Block] Error:", error.message || error);
    console.error("[AI Generate Block] Status:", error.status, "| Type:", error.constructor?.name);
    if (error.status === 401 || error.status === 403) {
      console.error("[AI Generate Block] API KEY issue! Key starts with:", process.env.ANTHROPIC_API_KEY?.substring(0, 12) + "...", "Length:", process.env.ANTHROPIC_API_KEY?.length);
    }

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: "AI service rate limited. Please try again in a moment.",
        errorCode: "AI_RATE_LIMITED",
      });
    }
    if (error.status === 401 || error.status === 403) {
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
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
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
app.post("/api/import-screenshot", async (req, res) => {
  try {
    const {
      imageBase64,
      imageWidth = 1440,
      imageHeight = 900,
      viewports = [1440],
      pluginColors = {},
      pluginFont = "Inter",
      textMode = "website",
    } = req.body;

    // Validation
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "imageBase64 is required" });
    }

    // Check base64 size (~5MB limit — base64 is ~33% larger than binary)
    const base64Length = imageBase64.length - (imageBase64.indexOf(",") + 1);
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

    // Merge plugin colors with defaults
    const finalPluginColors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

    // Coerce viewports to numbers (frontend may send string[])
    const numericViewports = viewports.map((v) => Number(v) || 1440);

    // Analyze and generate for each viewport
    const frames = [];
    for (const vp of numericViewports) {
      const simplified = await analyzeScreenshotWithRetry({
        imageBase64,
        imageWidth: Number(imageWidth) || 1440,
        imageHeight: Number(imageHeight) || 900,
        viewportWidth: vp,
        textMode,
      });

      const tree = convertToWireframeTree(simplified, vp, finalPluginColors, pluginFont);

      frames.push({
        viewportWidth: vp,
        viewportHeight: Number(simplified.totalHeight) || 0,
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
      sourceUrl: "screenshot://uploaded",
    });
  } catch (error) {
    console.error("[Screenshot Import] Error:", error.message || error);

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: "AI service rate limited. Please try again in a moment.",
        errorCode: "AI_RATE_LIMITED",
      });
    }
    if (error.status === 401 || error.status === 403) {
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
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[Error]:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

const PORT = process.env.API_PORT || 3002;
app.listen(PORT, () => {
});

// For Vercel
module.exports = app;
