import { Router, type Request, type Response } from "express";
import { signToken, authenticatePlugin } from "../../middleware/auth.js";

const router = Router();

/**
 * POST /api/auth/issue-cancel-token
 *
 * Plugin → backend. Returns a short-lived HMAC token that the plugin can
 * embed in the URL when opening the website Account page for cancellation.
 *
 * Caller identity comes from the verified plugin install token
 * (`authenticatePlugin` middleware sets `req.userId`). The figmaUserId is
 * no longer accepted in the body — previously, knowing another user's
 * figmaUserId was enough to mint a cancel token for them.
 */
router.post(
  "/issue-cancel-token",
  authenticatePlugin,
  (req: Request, res: Response) => {
    const figmaUserId = req.userId!;

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[Auth] AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }

    // 5-minute TTL — long enough for a user to click through to the website
    // and verify, short enough that a leaked URL is mostly useless.
    const token = signToken(figmaUserId, secret, 5 * 60);
    res.json({ token, expiresInSeconds: 5 * 60 });
  },
);

export default router;
