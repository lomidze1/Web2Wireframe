/**
 * Settings routes
 * POST /api/save-settings
 * GET  /api/settings/:userId
 */

import { Router, Request, Response } from "express";
import UserSettings from "../../models/UserSettings.js";
import { DEFAULT_PLUGIN_COLORS } from "../../utils/styleUtils.js";
import { mongoConnected } from "../../state.js";

const router = Router();

// POST /api/save-settings - Save user settings
router.post("/save-settings", async (req: Request, res: Response) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      });
    }

    const {
      userId,
      defaultColorMode = "plugin",
      defaultViewports = [1440, 375],
      defaultTypographyMode = "plugin",
      defaultTextMode = "website",
      pluginColors = {},
      pluginFont = "Montserrat",
    } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid userId",
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
      error: (error as Error).message,
    });
  }
});

// GET /api/settings/:userId - Get user settings
router.get("/settings/:userId", async (req: Request, res: Response) => {
  try {
    if (!mongoConnected) {
      // Return default settings if DB not available
      return res.json({
        success: true,
        settings: {
          userId: req.params.userId,
          defaultColorMode: "plugin",
          defaultViewports: [1440, 375],
          defaultTypographyMode: "plugin",
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
      error: (error as Error).message,
    });
  }
});

export default router;
