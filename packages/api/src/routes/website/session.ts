import express, { type Request, type Response } from "express";
import { requireSessionAuth } from "../../middleware/auth.js";
import { config } from "../../config/env.js";

const router = express.Router();

router.get("/me", requireSessionAuth, (req: Request, res: Response) => {
  res.json({
    ok: true,
    figmaUserId: req.session.figmaUserId,
    email: req.session.figmaEmail ?? null,
  });
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
      res.json(payload);
    } catch (error) {
      console.error("License service request failed:", error);
      res.status(502).json({ error: "License service unavailable" });
    }
  },
);

export default router;
