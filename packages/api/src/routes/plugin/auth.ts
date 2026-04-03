import { Router, Request, Response } from "express";
import { signToken, authenticatePlugin } from "../../middleware/auth.js";

const router = Router();

/**
 * POST /api/auth/init
 * Exchange figmaUserId for an HMAC-signed API token.
 * Called once on plugin startup.
 */
router.post("/auth/init", (req: Request, res: Response): void => {
  const { figmaUserId, figmaName } = req.body;

  if (!figmaUserId || typeof figmaUserId !== "string") {
    res.status(400).json({
      success: false,
      error: "figmaUserId is required",
    });
    return;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    res.status(500).json({
      success: false,
      error: "Server authentication not configured",
    });
    return;
  }

  const token = signToken(figmaUserId, secret);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  res.json({
    success: true,
    token,
    expiresAt,
    userId: figmaUserId,
    name: figmaName || null,
  });
});

/**
 * POST /api/auth/refresh
 * Exchange a valid (non-expired) token for a fresh one.
 * Requires existing valid token.
 */
router.post(
  "/auth/refresh",
  authenticatePlugin,
  (req: Request, res: Response): void => {
    const userId = req.userId!;
    const secret = process.env.AUTH_SECRET!;

    const token = signToken(userId, secret);
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    res.json({
      success: true,
      token,
      expiresAt,
    });
  }
);

/**
 * GET /api/auth/me
 * Return the authenticated user's identity.
 */
router.get(
  "/auth/me",
  authenticatePlugin,
  (req: Request, res: Response): void => {
    res.json({
      success: true,
      userId: req.userId,
    });
  }
);

export default router;
