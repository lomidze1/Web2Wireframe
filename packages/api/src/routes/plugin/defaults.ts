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
import {
  renderMetrics,
  getCounterSnapshot,
} from "../../services/metrics.js";

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
 * GET /api/metrics — Prometheus text-format counters.
 *
 * Admin-gated by the same `ADMIN_TOKEN` as `/api/health/flitt`: in production
 * the metrics endpoint exposes operational state (webhook volume, decline
 * rates, signature-failure spikes) that we wouldn't want an unauthenticated
 * adversary to probe. In dev (no `ADMIN_TOKEN`), open for local scrapes.
 *
 * Auth accepts EITHER `X-Admin-Token: <value>` or `Authorization: Bearer <value>`.
 */
router.get("/metrics", (req: Request, res: Response) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const xAdmin = req.header("x-admin-token");
    const authHeader = req.header("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
    const provided = xAdmin ?? bearer ?? "";
    if (provided !== adminToken) {
      res.status(401).type("text/plain").send("Unauthorized\n");
      return;
    }
  }
  // Prometheus expects this exact content-type with the version param.
  res
    .status(200)
    .type("text/plain; version=0.0.4; charset=utf-8")
    .send(renderMetrics());
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
    // Accept either `X-Admin-Token: <value>` or `Authorization: Bearer <value>`.
    // The Bearer form matches what most CLIs (curl, Postman, httpie) and
    // monitoring tools default to, and it's also what /api/admin/* uses, so
    // operators don't juggle two header names.
    const xAdmin = req.header("x-admin-token");
    const authHeader = req.header("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
    const provided = xAdmin ?? bearer ?? "";
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
    // MongoDB-backed, survives restart, scoped to last 24h.
    recent24h: counts,
    lastWebhookProcessedAt: lastProcessedAt?.toISOString() ?? null,
    // In-memory metrics — reset on restart, useful for quick "is this
    // build healthy?" probes. Same data source as /api/metrics.
    sinceRestart: summarizeMetricsForHealth(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Compact health-friendly view of the metrics counters. Sums across label
 * dimensions so the operator sees one number per concept rather than the
 * full Prometheus matrix.
 */
function summarizeMetricsForHealth(): Record<string, number | Record<string, number>> {
  const raw = getCounterSnapshot();
  const sumAll = (counterName: string): number => {
    const c = raw[counterName];
    if (!c) return 0;
    let total = 0;
    for (const v of Object.values(c)) total += v;
    return total;
  };
  // Group checkout_creations by `result` so success/fail is visible at a glance.
  const checkoutByResult: Record<string, number> = { success: 0, fail: 0 };
  for (const [labels, n] of Object.entries(
    raw.flitt_checkout_creations_total ?? {},
  )) {
    if (labels.includes('result="success"')) checkoutByResult.success += n;
    if (labels.includes('result="fail"')) checkoutByResult.fail += n;
  }
  return {
    webhooks: sumAll("flitt_webhook_total"),
    signatureFailures: sumAll("flitt_signature_failures_total"),
    checkoutCreations: checkoutByResult,
    emailsSent: sumAll("email_send_total"),
    licenseEvents: sumAll("license_events_total"),
  };
}

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
