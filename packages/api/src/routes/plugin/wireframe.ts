/**
 * Wireframe CRUD routes
 * GET /api/wireframe/:id
 * GET /api/wireframe-history (caller-owned via verified token)
 */

import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import Wireframe from "../../models/Wireframe.js";
import { authenticatePlugin } from "../../middleware/auth.js";
import { mongoConnected } from "../../state.js";

const router = Router();

// GET /api/wireframe/:id - Get wireframe by ID. Verifies the wireframe
// belongs to the authenticated caller before returning it (previous IDOR:
// any wireframe ID exposed any user's stored extraction).
router.get(
  "/wireframe/:id",
  authenticatePlugin,
  async (req: Request, res: Response) => {
    try {
      if (!mongoConnected) {
        return res.status(503).json({
          success: false,
          error: "Database not available",
        });
      }

      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid wireframe ID format",
        });
      }

      const wireframe = await Wireframe.findById(req.params.id);
      if (!wireframe) {
        return res.status(404).json({
          success: false,
          error: "Wireframe not found",
        });
      }
      if (wireframe.userId !== req.userId) {
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
        error: (error as Error).message,
      });
    }
  },
);

// GET /api/wireframe-history - Get the authenticated user's wireframe history.
// The userId comes from the verified token (req.userId), not from the URL —
// previous shape was /:userId, which allowed enumeration of any user's history.
router.get(
  "/wireframe-history",
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
      const { limit = "10", skip = "0" } = req.query;
      const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 10, 1), 100);
      const skipNum = Math.max(parseInt(skip as string, 10) || 0, 0);
      const wireframes = await Wireframe.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skipNum)
        .select("_id sourceUrl viewports colorMode typographyMode textMode status createdAt");

      const total = await Wireframe.countDocuments({ userId });

      res.json({
        success: true,
        total,
        limit: limitNum,
        skip: skipNum,
        wireframes,
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
