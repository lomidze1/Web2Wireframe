import express, { type Request, type Response } from "express";
import { requireSessionAuth } from "../../middleware/auth.js";
import { config } from "../../config/env.js";
import { licenseService } from "../../services/licenseService.js";
import { incrementCounter } from "../../services/metrics.js";

const router = express.Router();

router.get("/me", requireSessionAuth, async (req: Request, res: Response) => {
  // Session-bound identity — never cache (proxy or browser).
  res.set("Cache-Control", "no-store");
  const figmaUserId = req.session.figmaUserId;
  if (!figmaUserId) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }

  // Fetch license so the website can show subscription status in the
  // "My User" modal. getOrCreate also runs lazy downgrade/cycle reset so the
  // returned plan reflects current entitlement (no separate cron needed).
  //
  // P5-SF-1: a Mongo blip used to fall through silently and return
  // `plan: "free"` — so a Pro user mid-Atlas-failover would see a "Free,
  // 0/10 imports" panel even though they paid $16, generating support
  // tickets. Now we return 503 with `licenseStale: true` so the frontend
  // can render a "Checking subscription…" state and retry without
  // downgrading the UI silently.
  try {
    const license = await licenseService.getOrCreate(figmaUserId);
    const plan = license.plan;
    const usageLimit = plan === "pro" ? null : 10;
    res.json({
      ok: true,
      figmaUserId,
      email: req.session.figmaEmail ?? null,
      plan,
      status: license.status,
      cycleEndsAt: license.cycleEndsAt.toISOString(),
      usage: {
        imports: license.usage?.imports ?? 0,
        limit: usageLimit,
      },
    });
  } catch (err) {
    console.warn("[/web/me] license lookup failed:", err);
    incrementCounter(
      "web_me_license_lookup_failures_total",
      "GET /web/me license-read failures (Mongo blip, etc.).",
    );
    // Return identity + a discriminating flag. Frontend treats this as
    // "don't know yet" and shows a loading/retry state — not a silent
    // Pro→Free downgrade.
    res.status(503).json({
      ok: true,
      licenseStale: true,
      figmaUserId,
      email: req.session.figmaEmail ?? null,
    });
  }
});

router.get(
  "/license/me",
  requireSessionAuth,
  async (_req: Request, res: Response) => {
    if (!config.features.licenseProxyEnabled) {
      res.status(503).json({ error: "License proxy disabled" });
      return;
    }

    const serviceUrl = config.license.serviceUrl;
    const serviceToken = config.license.token;

    if (!serviceUrl || !serviceToken) {
      res.status(500).json({ error: "License service not configured" });
      return;
    }

    const baseUrl = serviceUrl.endsWith("/")
      ? serviceUrl.slice(0, -1)
      : serviceUrl;

    try {
      const licenseResponse = await fetch(`${baseUrl}/me/license`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${serviceToken}`,
        },
      });

      if (!licenseResponse.ok) {
        console.error(
          "License service error:",
          licenseResponse.status,
          await licenseResponse.text(),
        );
        res.status(502).json({ error: "License service error" });
        return;
      }

      const payload = (await licenseResponse.json()) as Record<string, unknown>;
      res.set("Cache-Control", "no-store");
      res.json(payload);
    } catch (error) {
      console.error("License service request failed:", error);
      res.status(502).json({ error: "License service unavailable" });
    }
  },
);

export default router;
