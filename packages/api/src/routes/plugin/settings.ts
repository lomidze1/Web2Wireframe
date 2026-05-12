/**
 * Settings routes
 * POST /api/save-settings  (caller-owned via verified token)
 * GET  /api/settings       (caller-owned via verified token)
 */

import { Router, Request, Response } from "express";
import UserSettings from "../../models/UserSettings.js";
import { DEFAULT_PLUGIN_COLORS } from "../../utils/styleUtils.js";
import { authenticatePlugin } from "../../middleware/auth.js";
import { mongoConnected } from "../../state.js";

const router = Router();

// POST /api/save-settings - Save the authenticated user's settings.
// userId comes from the verified token (req.userId); any userId in the
// request body is ignored (previous IDOR: clients could write arbitrary
// users' settings by spoofing the body field).
router.post(
  "/save-settings",
  authenticatePlugin,
  async (req: Request, res: Response) => {
    try {
      if (!mongoConnected) {
        return res.status(503).json({
          success: false,
          error: "Database not available",
        });
      }

      const userId = req.userId!;
      const {
        defaultColorMode = "plugin",
        defaultViewports = [1440, 375],
        defaultTypographyMode = "plugin",
        defaultTextMode = "website",
        pluginColors = {},
        pluginFont = "Montserrat",
      } = req.body;

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
  },
);

// GET /api/settings - Get the authenticated user's settings. userId comes
// from req.userId, not the URL — previous shape /:userId was a public
// enumeration endpoint.
router.get(
  "/settings",
  authenticatePlugin,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      if (!mongoConnected) {
        // Return default settings if DB not available
        return res.json({
          success: true,
          settings: {
            userId,
            defaultColorMode: "plugin",
            defaultViewports: [1440, 375],
            defaultTypographyMode: "plugin",
            defaultTextMode: "website",
            pluginColors: DEFAULT_PLUGIN_COLORS,
            pluginFont: "Montserrat",
          },
        });
      }

      let settings = await UserSettings.findOne({ userId });
      if (!settings) {
        settings = new UserSettings({
          userId,
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
  },
);

export default router;
