import { Router, type Request, type Response, type NextFunction } from "express";
import { License, type ILicense } from "../../models/License.js";

const router = Router();

// ============================================================================
// Admin auth — Bearer ADMIN_TOKEN
// ============================================================================

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    console.error("[Admin] ADMIN_TOKEN env var is not set");
    res.status(503).json({ error: "Admin auth not configured" });
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (!token || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ============================================================================
// Serialization (subset of public license fields, with raw Date types)
// ============================================================================

function serialize(license: ILicense) {
  return {
    figmaUserId: license.figmaUserId,
    email: license.email,
    plan: license.plan,
    status: license.status,
    cycleStartedAt: license.cycleStartedAt.toISOString(),
    cycleEndsAt: license.cycleEndsAt.toISOString(),
    usage: license.usage,
    subscription: license.subscription,
    createdAt: license.createdAt.toISOString(),
    updatedAt: license.updatedAt.toISOString(),
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/admin/license/lookup-by-email?email=<...>
 *
 * NOTE: defined BEFORE /:figmaUserId so Express does not treat
 * "lookup-by-email" as a figmaUserId param.
 */
router.get(
  "/lookup-by-email",
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const email = req.query.email;
      if (typeof email !== "string" || !email) {
        res.status(400).json({ error: "email query parameter is required" });
        return;
      }
      const licenses = await License.find({ email }).limit(50);
      res.json({
        count: licenses.length,
        licenses: licenses.map(serialize),
      });
    } catch (err) {
      console.error("[Admin] lookup-by-email error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * GET /api/admin/license/:figmaUserId
 */
router.get(
  "/:figmaUserId",
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const license = await License.findOne({
        figmaUserId: req.params.figmaUserId,
      });
      if (!license) {
        res.status(404).json({ error: "License not found" });
        return;
      }
      res.json(serialize(license));
    } catch (err) {
      console.error("[Admin] get license error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * POST /api/admin/license/override
 *
 * Body: { figmaUserId, plan?, status?, cycleEndsAt?, email? }
 *
 * Force-set arbitrary license fields. Use sparingly — for support cases
 * where Flitt-driven state ended up wrong (refund issued, customer claim,
 * etc.).
 */
router.post(
  "/override",
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const { figmaUserId, plan, status, cycleEndsAt, email } =
        req.body as {
          figmaUserId?: string;
          plan?: string;
          status?: string;
          cycleEndsAt?: string;
          email?: string | null;
        };

      if (!figmaUserId) {
        res.status(400).json({ error: "figmaUserId is required" });
        return;
      }
      if (plan && !["free", "pro"].includes(plan)) {
        res.status(400).json({ error: "Invalid plan" });
        return;
      }
      if (
        status &&
        !["active", "canceled", "expired"].includes(status)
      ) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }

      const update: Record<string, unknown> = {};
      if (plan) update.plan = plan;
      if (status) update.status = status;
      if (cycleEndsAt) update.cycleEndsAt = new Date(cycleEndsAt);
      if (email !== undefined) update.email = email;

      const license = await License.findOneAndUpdate(
        { figmaUserId },
        { $set: update },
        { new: true, upsert: true },
      );
      res.json(serialize(license as ILicense));
    } catch (err) {
      console.error("[Admin] override error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
