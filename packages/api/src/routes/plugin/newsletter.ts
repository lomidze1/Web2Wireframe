/**
 * Newsletter subscription — public endpoint called by the browser extension's
 * Help Modal. Wraps Resend Audiences API.
 *
 * POST /api/newsletter/subscribe
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  subscribeToNewsletter,
  isNewsletterConfigured,
} from "../../services/newsletterService.js";

const router = Router();

const subscribeSchema = z.object({
  email: z.string().trim().email().max(254),
});

router.post("/newsletter/subscribe", async (req: Request, res: Response) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }

  if (!isNewsletterConfigured()) {
    res.status(503).json({ ok: false, error: "newsletter_not_configured" });
    return;
  }

  const result = await subscribeToNewsletter(parsed.data.email);
  if (!result.ok) {
    // Map all upstream/config failures to a single opaque code so we don't
    // leak Resend internals (API key fragments, rate-limit topology) to a
    // caller that could be hostile.
    res.status(502).json({ ok: false, error: "subscription_failed" });
    return;
  }

  res.json({ ok: true });
});

export default router;
