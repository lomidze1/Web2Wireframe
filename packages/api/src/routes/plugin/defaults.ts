/**
 * Default colors/fonts + health check routes
 * GET /api/health
 * GET /api/health/flitt   (admin-gated, payment config sanity check)
 * GET /api/default-colors
 * GET /api/default-fonts
 */

import { Router, Request, Response } from "express";
import {
  DEFAULT_PLUGIN_COLORS,
  DEFAULT_PLUGIN_FONTS,
} from "../../utils/styleUtils.js";
import { config } from "../../config/env.js";
import * as state from "../../state.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";

interface RecentCounts {
  approved: number;
  failed: number;
  reversed: number;
}

/**
 * Roll up the last 24h of Flitt webhooks for the health endpoint. Returns
 * `null` when MongoDB is unreachable or the query throws — operator visibility
 * matters more than strict correctness on this endpoint, so we never let a
 * DB blip turn /health into a 5xx.
 */
async function recentWebhookCounts(): Promise<{
  counts: RecentCounts | null;
  lastProcessedAt: Date | null;
}> {
  if (!state.mongoConnected) {
    return { counts: null, lastProcessedAt: null };
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [approved, failed, reversed, latest] = await Promise.all([
      WebhookEvent.countDocuments({
        orderStatus: "approved",
        processedAt: { $gte: since },
      }),
      WebhookEvent.countDocuments({
        orderStatus: { $in: ["declined", "expired"] },
        processedAt: { $gte: since },
      }),
      WebhookEvent.countDocuments({
        orderStatus: "reversed",
        processedAt: { $gte: since },
      }),
      WebhookEvent.findOne()
        .sort({ processedAt: -1 })
        .select("processedAt")
        .lean(),
    ]);
    const lastProcessedAt =
      latest && typeof latest === "object" && "processedAt" in latest
        ? (latest.processedAt as Date)
        : null;
    return { counts: { approved, failed, reversed }, lastProcessedAt };
  } catch (err) {
    console.warn("[health/flitt] webhook counts query failed:", err);
    return { counts: null, lastProcessedAt: null };
  }
}

const router = Router();

// GET /api/health - Health check
router.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * GET /api/health/flitt — payment config sanity check for operators.
 *
 * Returns *booleans*, never the actual merchant_id or secret key values, so
 * even an unintentional leak (e.g. proxy access log) discloses no secret.
 * The `baseUrl` and `webhookCallbackUrl` are public knowledge.
 *
 * Auth: when `ADMIN_TOKEN` is set, require it via `X-Admin-Token` header.
 * In dev (no `ADMIN_TOKEN`), open — convenient for `curl localhost:3002`.
 */
router.get("/health/flitt", async (req: Request, res: Response) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const provided = req.header("x-admin-token");
    if (provided !== adminToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  const apiPublicUrl =
    process.env.API_PUBLIC_URL ?? "https://api.web2wireframe.design";
  const { counts, lastProcessedAt } = await recentWebhookCounts();
  res.json({
    flittEnabled: config.features.flittEnabled === true,
    merchantIdSet: Boolean(config.flitt.merchantId),
    secretKeySet: Boolean(config.flitt.secretKey),
    baseUrl: config.flitt.baseUrl,
    webhookCallbackUrl: `${apiPublicUrl}/api/webhooks/flitt`,
    mongoConnected: state.mongoConnected,
    recent24h: counts,
    lastWebhookProcessedAt: lastProcessedAt?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/default-colors - Get default plugin colors
router.get("/default-colors", (req: Request, res: Response) => {
  res.json({
    success: true,
    colors: DEFAULT_PLUGIN_COLORS,
  });
});

// GET /api/default-fonts - Get default plugin fonts
router.get("/default-fonts", (req: Request, res: Response) => {
  res.json({
    success: true,
    fonts: DEFAULT_PLUGIN_FONTS,
  });
});

export default router;
