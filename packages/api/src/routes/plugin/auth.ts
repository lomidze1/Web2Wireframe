import { Router, Request, Response } from "express";
import {
  signToken,
  authenticatePlugin,
  PLUGIN_TOKEN_EXPIRY_SECONDS,
} from "../../middleware/auth.js";
import { pendingPluginAuth } from "../../state.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";

const router = Router();

/**
 * GET /api/auth/figma-exchange?nonce=<nonce>
 *
 * Plugin OAuth bridge. The plugin generates a high-entropy nonce, opens the
 * Figma OAuth flow (`/auth/figma/login?plugin_nonce=<nonce>`) in a browser
 * tab, then polls this endpoint with the same nonce. Once the OAuth callback
 * has verified the user against Figma and parked a token, this returns it.
 *
 * The nonce is the bearer credential here — it is high-entropy, single-use,
 * and short-lived, so this endpoint is intentionally public. It replaces the
 * old `/api/auth/init`, which minted a token for any `figmaUserId` supplied
 * in the request body with no identity proof at all.
 */
router.get(
  "/auth/figma-exchange",
  authRateLimiter,
  (req: Request, res: Response): void => {
  const nonce = req.query.nonce;
  if (typeof nonce !== "string" || nonce.length === 0) {
    res.status(400).json({ success: false, error: "nonce is required" });
    return;
  }

  // Lazy sweep — drop nonce entries whose short TTL has elapsed.
  const now = Date.now();
  for (const [key, entry] of pendingPluginAuth) {
    if (entry.expires <= now) pendingPluginAuth.delete(key);
  }

  const entry = pendingPluginAuth.get(nonce);
  if (!entry) {
    // Still waiting for the user to finish OAuth, or expired/consumed.
    res.json({ success: true, pending: true });
    return;
  }

  pendingPluginAuth.delete(nonce); // single-use
  res.json({
    success: true,
    pending: false,
    token: entry.token,
    expiresAt: new Date(entry.tokenExpiresAt).toISOString(),
  });
});

/**
 * POST /api/auth/refresh
 * Exchange a valid (non-expired) token for a fresh one.
 * Requires existing valid token.
 */
router.post(
  "/auth/refresh",
  authRateLimiter,
  authenticatePlugin,
  (req: Request, res: Response): void => {
    const userId = req.userId!;
    const secret = process.env.AUTH_SECRET!;

    const token = signToken(userId, secret, PLUGIN_TOKEN_EXPIRY_SECONDS);
    const expiresAt = new Date(
      Date.now() + PLUGIN_TOKEN_EXPIRY_SECONDS * 1000,
    ).toISOString();

    res.json({
      success: true,
      token,
      expiresAt,
    });
  },
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
  },
);

export default router;
