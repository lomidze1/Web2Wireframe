import { Router, type Request, type Response } from "express";
import { type ILicense, PLAN_LIMITS } from "../../models/License.js";
import { licenseService } from "../../services/licenseService.js";
import { authenticatePlugin, verifyToken } from "../../middleware/auth.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";
import { mongoConnected } from "../../state.js";

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
// Serialization
// ============================================================================

interface SerializedLicense {
  figmaUserId: string;
  email: string | null;
  plan: "free" | "pro";
  status: "active" | "canceled" | "expired";
  cycleStartedAt: string;
  cycleEndsAt: string;
  usage: {
    imports: number;
    periodStartedAt: string;
  };
  limits: {
    // null over JSON for "unlimited" — Pro users see no cap.
    imports: number | null;
  };
  subscription: {
    flittOrderId: string;
    activatedAt: string;
    nextBillingAt: string;
    canceledAt: string | null;
    lastFailedAt: string | null;
    failureCount: number;
    /** true = native Flitt recurring subscription; false = one-time purchase. */
    autoRenew: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(license: ILicense): SerializedLicense {
  const limit = PLAN_LIMITS[license.plan].imports;
  return {
    figmaUserId: license.figmaUserId,
    email: license.email,
    plan: license.plan,
    status: license.status,
    cycleStartedAt: license.cycleStartedAt.toISOString(),
    cycleEndsAt: license.cycleEndsAt.toISOString(),
    usage: {
      imports: license.usage.imports,
      periodStartedAt: license.usage.periodStartedAt.toISOString(),
    },
    limits: {
      imports: Number.isFinite(limit) ? limit : null,
    },
    subscription: license.subscription
      ? {
          flittOrderId: license.subscription.flittOrderId,
          activatedAt: license.subscription.activatedAt.toISOString(),
          nextBillingAt: license.subscription.nextBillingAt.toISOString(),
          canceledAt:
            license.subscription.canceledAt?.toISOString() ?? null,
          lastFailedAt:
            license.subscription.lastFailedAt?.toISOString() ?? null,
          failureCount: license.subscription.failureCount,
          autoRenew: license.subscription.autoRenew === true,
        }
      : null,
    createdAt: license.createdAt.toISOString(),
    updatedAt: license.updatedAt.toISOString(),
  };
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
    res.json(serialize(license));
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
  authRateLimiter,
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
      res.json(serialize(license));
    } catch (err) {
      console.error("[License] /by-token error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
