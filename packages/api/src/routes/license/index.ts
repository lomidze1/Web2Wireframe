import { Router, type Request, type Response } from "express";
import { licenseService } from "../../services/licenseService.js";
import { authenticatePlugin, verifyToken } from "../../middleware/auth.js";
import {
  authRateLimiter,
  byTokenUserRateLimiter,
} from "../../middleware/rateLimit.js";
import { mongoConnected } from "../../state.js";
import { serializeLicense } from "../../lib/serializeLicense.js";

const router = Router();

/** Common guard: License routes need a live MongoDB. Without it Mongoose
 * buffers operations and eventually throws "buffering timed out", which
 * surfaces to the plugin as an opaque 500. Fail fast with 503 instead. */
function requireMongo(_req: Request, res: Response): boolean {
  if (!mongoConnected) {
    // In production, `hint` would leak that the operator is running docker
    // compose locally — useless to attackers but no reason to publish it.
    const isDev = process.env.NODE_ENV === "development";
    res.status(503).json({
      error: "License database unavailable",
      ...(isDev && {
        hint: "MongoDB is not connected. Start mongo (docker compose up mongo -d).",
      }),
    });
    return false;
  }
  return true;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/license/me
 *
 * Returns the license for the caller identified by their HMAC plugin
 * token. Caller identity comes from the verified `req.userId` set by
 * `authenticatePlugin`; the figmaUserId query parameter is no longer
 * trusted (previous IDOR: anyone could read anyone's license by passing
 * their id in the query string).
 */
router.get("/me", authenticatePlugin, async (req: Request, res: Response) => {
  if (!requireMongo(req, res)) return;
  try {
    const figmaUserId = req.userId!;
    const license = await licenseService.getOrCreate(figmaUserId);
    res.json(serializeLicense(license));
  } catch (err) {
    console.error("[License] /me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/license/use-import
 *
 * Atomically increments imports.usage. Returns 403 when the Free monthly
 * quota has been exhausted; the plugin opens the QuotaExceededModal in
 * response. Caller identity comes from the verified plugin token.
 */
router.post(
  "/use-import",
  authenticatePlugin,
  async (req: Request, res: Response) => {
    if (!requireMongo(req, res)) return;
    try {
      const figmaUserId = req.userId!;
      const result = await licenseService.useImport(figmaUserId);
      if ("error" in result) {
        res.status(403).json({
          error: "limit_exceeded",
          upgradeUrl: "/api/checkout/create",
        });
        return;
      }
      res.json({
        ok: true,
        remaining: Number.isFinite(result.remaining) ? result.remaining : null,
      });
    } catch (err) {
      console.error("[License] /use-import error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * POST /api/license/by-token
 *
 * Read-only license lookup for the website Account ("Manage Subscription")
 * page. That page is opened from the plugin with a short-lived HMAC token
 * (issued by /api/auth/issue-cancel-token) bound to the caller's verified
 * Figma id. We verify that token and that it matches the supplied
 * figmaUserId — the same proof /api/subscription/cancel requires — instead
 * of an HMAC Bearer header the browser page does not hold.
 *
 * Public route (token-in-body); throttled by authRateLimiter.
 */
router.post(
  "/by-token",
  // Order: IP-keyed limiter first (cheap brute-force defense), then
  // figmaUserId-keyed limiter to catch distributed attacks focused on
  // a single victim's identifier. Both must pass.
  authRateLimiter,
  byTokenUserRateLimiter,
  async (req: Request, res: Response) => {
    if (!requireMongo(req, res)) return;

    const { figmaUserId, token } = req.body as {
      figmaUserId?: unknown;
      token?: unknown;
    };
    if (typeof figmaUserId !== "string" || typeof token !== "string") {
      res.status(400).json({ error: "figmaUserId and token are required" });
      return;
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[License] AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token, secret);
    } catch {
      // Generic message: distinguishing 'Invalid signature' from 'Token
      // expired' lets an attacker probe whether their guessed AUTH_SECRET is
      // correct by replaying expired tokens.
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    if (payload.userId !== figmaUserId) {
      res.status(401).json({ error: "Token does not match figmaUserId" });
      return;
    }

    try {
      const license = await licenseService.getOrCreate(figmaUserId);
      res.json(serializeLicense(license));
    } catch (err) {
      console.error("[License] /by-token error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
