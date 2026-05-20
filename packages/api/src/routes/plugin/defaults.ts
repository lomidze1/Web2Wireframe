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
import { mongoConnected } from "../../state.js";

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
router.get("/health/flitt", (req: Request, res: Response) => {
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
  res.json({
    flittEnabled: config.features.flittEnabled === true,
    merchantIdSet: Boolean(config.flitt.merchantId),
    secretKeySet: Boolean(config.flitt.secretKey),
    baseUrl: config.flitt.baseUrl,
    webhookCallbackUrl: `${apiPublicUrl}/api/webhooks/flitt`,
    mongoConnected,
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
