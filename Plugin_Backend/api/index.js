require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Wireframe = require("../models/Wireframe");
const UserSettings = require("../models/UserSettings");
const { createWireframeData } = require("../lib/htmlExtractor");
const {
  DEFAULT_PLUGIN_COLORS,
  DEFAULT_PLUGIN_FONTS,
  createLocalStylesStructure,
  getColorByMode,
  getFontByMode,
} = require("../utils/styleUtils");
const { validateUrl } = require("../utils/urlValidation");

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
