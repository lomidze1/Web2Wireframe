import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { License, type ILicense } from "../../models/License.js";
import { LicenseAudit } from "../../models/LicenseAudit.js";

const router = Router();

// ============================================================================
// Admin auth — Bearer ADMIN_TOKEN (constant-time comparison)
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
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Constant-time compare to avoid timing-oracle attacks on ADMIN_TOKEN.
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
 * GET /api/admin/license/recent?limit=<N>&page=<N>&plan=<free|pro>&duration=<monthly|yearly>&status=<active|canceled|expired>
 *
 * Recent license activity by `updatedAt`. Useful for the support inbox:
 * lets you skim who just upgraded / who has a stuck subscription state
 * without knowing their figmaUserId or email. `limit` caps at 100.
 *
 * Optional filters:
 *   - `plan`     : free | pro                    — coarse-grain plan filter
 *   - `duration` : monthly | yearly              — Pro tier (implies plan=pro)
 *   - `status`   : active | canceled | expired   — subscription state
 *
 * Pagination: `page` (1-indexed) + `limit`. Response always includes
 * `total` so the admin panel can render "Page N of M". `status=canceled`
 * sort key is still `updatedAt desc` — this catches BOTH webhook cancels
 * (which set subscription.canceledAt) AND admin-button cancels (which only
 * flip status), so the "most recently cancelled" view is complete.
 *
 * NOTE: defined BEFORE /:figmaUserId so Express does not treat
 * "recent" as a figmaUserId param.
 */
router.get(
  "/recent",
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 100)
        : 20;
      const rawPage = Number.parseInt(String(req.query.page ?? "1"), 10);
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

      const filter: Record<string, unknown> = {};

      const planFilter = req.query.plan;
      if (typeof planFilter === "string") {
        if (!["free", "pro"].includes(planFilter)) {
          res.status(400).json({ error: "Invalid plan filter" });
          return;
        }
        filter.plan = planFilter;
      }

      const duration = req.query.duration;
      if (typeof duration === "string") {
        if (!["monthly", "yearly"].includes(duration)) {
          res.status(400).json({ error: "Invalid duration filter" });
          return;
        }
        // Duration only exists on a subscription, and only Pro users have
        // subscriptions — pin plan=pro so we never return free rows.
        filter.plan = "pro";
        filter["subscription.lastDuration"] = duration;
      }

      const statusFilter = req.query.status;
      if (typeof statusFilter === "string") {
        if (!["active", "canceled", "expired"].includes(statusFilter)) {
          res.status(400).json({ error: "Invalid status filter" });
          return;
        }
        filter.status = statusFilter;
      }

      const skip = (page - 1) * limit;
      const [licenses, total] = await Promise.all([
        License.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit),
        License.countDocuments(filter),
      ]);
      res.json({
        count: licenses.length,
        total,
        page,
        limit,
        licenses: licenses.map(serialize),
      });
    } catch (err) {
      console.error("[Admin] recent error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

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
 * Body: { figmaUserId, plan?, status?, cycleEndsAt?, email?, reason? }
 *
 * Force-set arbitrary license fields. Use sparingly — for support cases
 * where Flitt-driven state ended up wrong (refund issued, customer claim,
 * etc.). `reason` is recorded in the audit log for accountability.
 */
router.post(
  "/override",
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const { figmaUserId, plan, status, cycleEndsAt, email, reason } =
        req.body as {
          figmaUserId?: unknown;
          plan?: string;
          status?: string;
          cycleEndsAt?: string;
          email?: string | null;
          reason?: string;
        };

      // Must be a non-empty string — an object like {"$ne": null} would turn
      // the findOneAndUpdate filter into a NoSQL operator query matching an
      // arbitrary license.
      if (typeof figmaUserId !== "string" || figmaUserId.length === 0) {
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

      // AUDIT FIRST. Manual admin overrides are the one path where a
      // missing audit row matters legally — non-repudiation breaks if
      // we mutate the license and the audit insert silently fails. For
      // automated webhook-driven audits the best-effort fire-and-forget
      // in licenseService is correct; admin-initiated changes are not.
      try {
        await LicenseAudit.create({
          figmaUserId,
          action: "admin_override",
          changes: {},
          context: { reason: reason ?? null, fields: Object.keys(update) },
        });
      } catch (err) {
        console.error("[Admin] audit write FAILED — refusing to override:", err);
        res.status(500).json({
          error: "Audit log unavailable — override blocked. Try again in a moment.",
        });
        return;
      }

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

/**
 * GET /api/admin/license/:figmaUserId/audit?limit=<N>
 *
 * Returns the most recent audit entries for a user (subscription changes,
 * refunds, admin overrides). Backed by the LicenseAudit collection
 * (18-month TTL).
 */
router.get(
  "/:figmaUserId/audit",
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const rawLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 200)
        : 50;
      const entries = await LicenseAudit.find({
        figmaUserId: req.params.figmaUserId,
      })
        .sort({ at: -1 })
        .limit(limit);
      res.json({
        count: entries.length,
        entries: entries.map((e) => ({
          action: e.action,
          changes: e.changes,
          context: e.context,
          at: e.at.toISOString(),
        })),
      });
    } catch (err) {
      console.error("[Admin] audit error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
