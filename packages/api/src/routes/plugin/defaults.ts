/**
 * Default colors/fonts + health check routes
 * GET /api/health
 * GET /api/default-colors
 * GET /api/default-fonts
 */

import { Router, Request, Response } from "express";
import {
  DEFAULT_PLUGIN_COLORS,
  DEFAULT_PLUGIN_FONTS,
} from "../../utils/styleUtils.js";

const router = Router();

// GET /api/health - Health check
router.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/default-colors - Get default plugin colors
router.get("/default-colors", (req: Request, res: Response) => {
  res.json({
    success: true,
    colors: DEFAULT_PLUGIN_COLORS,
  });
});

// GET /api/default-fonts - Get default plugin fonts
router.get("/default-fonts", (req: Request, res: Response) => {
  res.json({
    success: true,
    fonts: DEFAULT_PLUGIN_FONTS,
  });
});

export default router;
