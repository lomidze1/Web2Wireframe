import { Router, type Request, type Response } from "express";
import { type ILicense, PLAN_LIMITS } from "../../models/License.js";
import { licenseService } from "../../services/licenseService.js";
import { authenticatePlugin } from "../../middleware/auth.js";
import { mongoConnected } from "../../state.js";

const router = Router();

/** Common guard: License routes need a live MongoDB. Without it Mongoose
 * buffers operations and eventually throws "buffering timed out", which
 * surfaces to the plugin as an opaque 500. Fail fast with 503 instead. */
function requireMongo(_req: Request, res: Response): boolean {
  if (!mongoConnected) {
    res.status(503).json({
      error: "License database unavailable",
      hint: "MongoDB is not connected. Start mongo (docker compose up mongo -d).",
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
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[License] /me error:", err);
    res.status(500).json({
      error: message,
      stack:
        process.env.NODE_ENV === "production" || !(err instanceof Error)
          ? undefined
          : err.stack,
    });
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
      const message = err instanceof Error ? err.message : "Server error";
      console.error("[License] /use-import error:", err);
      res.status(500).json({ error: message });
    }
  },
);

export default router;
