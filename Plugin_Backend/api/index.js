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

const app = express();

// Middleware - CORS configuration for Figma plugin (origin 'null')
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    // If CORS_ORIGIN is "*" or not set, allow all origins
    // Otherwise, split by comma for specific origins
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
    console.log("MongoDB connected");
    mongoConnected = true;
  })
  .catch((err) => {
    console.warn("MongoDB connection failed (wireframe generation will still work):", err.message);
    mongoConnected = false;
  });

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// POST /api/import-url - Main endpoint to import website and generate wireframe
app.post("/api/import-url", async (req, res) => {
  try {
    const {
      userId,
      sourceUrl,
      viewports = [1440],
      colorMode = "plugin-colors",
      typographyMode = "plugin-fonts",
      textMode = "website", // NEW: "website" | "lorem" | "semantic"
      pluginMainColor = "#1f3a5f", // NEW: Color for image/video placeholders
    } = req.body;

    if (!userId || !sourceUrl) {
      return res.status(400).json({
        error: "Missing required fields: userId, sourceUrl",
      });
    }

    // Validate URL
    try {
      new URL(sourceUrl);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    // Validate textMode
    const validTextModes = ["website", "lorem", "semantic"];
    if (!validTextModes.includes(textMode)) {
      return res.status(400).json({
        error: `Invalid textMode. Must be one of: ${validTextModes.join(", ")}`,
      });
    }

    // Generate wireframe data (works without MongoDB)
    const frames = await createWireframeData(
      sourceUrl,
      viewports,
      colorMode,
      textMode,
      pluginMainColor
    );

    // Extract colors and fonts from frames for color mode support
    const extractedColors = extractUniqueColors(frames);
    const extractedFonts = extractUniqueFonts(frames);

    // Get colors based on mode
    const colorsByMode = getColorByMode(colorMode, extractedColors);
    const fontsByMode = getFontByMode(typographyMode, extractedFonts);

    // Create local styles based on selected mode
    const localStyles = createLocalStylesStructure(colorsByMode, fontsByMode);

    // Apply color mode to frame elements
    const processedFrames = applyColorModeToFrames(
      frames,
      colorMode,
      colorsByMode
    );

    // Save to MongoDB if connected (optional)
    let wireframeId = null;
    if (mongoConnected) {
      try {
        const wireframe = new Wireframe({
          userId,
          sourceUrl,
          viewports: viewports.filter((v) =>
            [375, 768, 1024, 1440, 1920].includes(v)
          ),
          colorMode,
          typographyMode,
          status: "completed",
          wireframeData: { frames: processedFrames },
          localStyles: localStyles,
        });
        await wireframe.save();
        wireframeId = wireframe._id;
      } catch (dbError) {
        console.warn("Failed to save wireframe to database:", dbError.message);
      }
    }

    res.json({
      success: true,
      wireframeId: wireframeId,
      sourceUrl: sourceUrl,
      viewports: viewports,
      colorMode: colorMode,
      frames: processedFrames.length,
      wireframeData: { frames: processedFrames },
      localStyles: localStyles,
    });
  } catch (error) {
    console.error("Import URL error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wireframe/:id - Get wireframe by ID
app.get("/api/wireframe/:id", async (req, res) => {
  try {
    const wireframe = await Wireframe.findById(req.params.id);
    if (!wireframe) {
      return res.status(404).json({ error: "Wireframe not found" });
    }
    res.json(wireframe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wireframe-history/:userId - Get user's wireframe history
app.get("/api/wireframe-history/:userId", async (req, res) => {
  try {
    const { limit = 10, skip = 0 } = req.query;
    const wireframes = await Wireframe.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select("_id sourceUrl viewports colorMode status createdAt");

    const total = await Wireframe.countDocuments({ userId: req.params.userId });

    res.json({
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      wireframes,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/save-settings - Save user settings
app.post("/api/save-settings", async (req, res) => {
  try {
    const {
      userId,
      defaultColorMode = "plugin-colors",
      defaultViewports = [1440, 375],
      defaultTypographyMode = "plugin-fonts",
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const settings = await UserSettings.findOneAndUpdate(
      { userId },
      {
        userId,
        defaultColorMode,
        defaultViewports,
        defaultTypographyMode,
      },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settings/:userId - Get user settings
app.get("/api/settings/:userId", async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ userId: req.params.userId });
    if (!settings) {
      settings = new UserSettings({ userId: req.params.userId });
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Helper: Extract unique colors from frames
function extractUniqueColors(frames) {
  const colors = new Set();
  frames.forEach((frame) => {
    frame.elements.forEach((element) => {
      if (element.backgroundColor) colors.add(element.backgroundColor);
      if (element.textColor) colors.add(element.textColor);
    });
  });
  return Array.from(colors).slice(0, 10); // Top 10 colors
}

// Helper: Extract unique fonts from frames
function extractUniqueFonts(frames) {
  const fonts = {};
  let headingCount = 0;
  let bodyCount = 0;

  frames.forEach((frame) => {
    frame.elements.forEach((element) => {
      if (element.type === "heading" && headingCount === 0) {
        fonts.heading = {
          fontFamily: element.fontFamily || "Montserrat",
          fontSize: element.fontSize || 24,
          fontWeight: element.fontWeight || 600,
        };
        headingCount++;
      } else if (!fonts.body && bodyCount === 0) {
        fonts.body = {
          fontFamily: element.fontFamily || "Open Sans",
          fontSize: element.fontSize || 14,
          fontWeight: element.fontWeight || 400,
        };
        bodyCount++;
      }
    });
  });

  return fonts;
}

// Helper: Apply color mode to all frames
function applyColorModeToFrames(frames, colorMode, colorsByMode) {
  if (colorMode === "plugin-colors" || colorMode === "figma-styles") {
    // Use predefined colors
    return frames.map((frame) => ({
      ...frame,
      elements: frame.elements.map((el) => ({
        ...el,
        backgroundColor: colorsByMode.background || el.backgroundColor,
        textColor: colorsByMode.text || el.textColor,
        borderColor: colorsByMode.border || el.borderColor,
      })),
    }));
  }
  // For website-colors and create-styles, keep original colors
  return frames;
}

const PORT = process.env.API_PORT || 3002;
app.listen(PORT, () => {
  console.log(`Web2Wireframe API running on port ${PORT}`);
});

// For Vercel
module.exports = app;
