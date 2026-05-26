import { Router, type Request, type Response } from "express";
import { CancellationEvent } from "../../models/CancellationEvent.js";
import { requireAdmin } from "../../middleware/adminAuth.js";

const router = Router();

/**
 * GET /api/admin/cancellations/recent?limit=<N>
 *
 * Returns the most recent failed-purchase events from `CancellationEvent`.
 * "Failed purchase" = user opened Flitt checkout but didn't complete payment
 * (declined card, expired order, user clicked Cancel, browser closed).
 *
 * Distinct from `/api/admin/license/recent?status=canceled` — that query
 * targets License documents flipped to canceled status by subscription
 * cancel flows. We do not sell subscriptions at launch, so that view is
 * always empty; this endpoint is the real "who's trying but not buying"
 * view operators actually need.
 *
 * Limit is capped at 100 to keep responses bounded; default 20 mirrors the
 * other admin panel views.
 */
router.get("/recent", requireAdmin, async (req: Request, res: Response) => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 20;

  const events = await CancellationEvent.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ events, total: events.length });
});

export default router;
