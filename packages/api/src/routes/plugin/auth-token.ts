import { Router, type Request, type Response } from "express";
import { signToken } from "../../middleware/auth.js";

const router = Router();

/**
 * POST /api/auth/issue-cancel-token
 *
 * Plugin → backend. Returns a short-lived HMAC token that the plugin can
 * embed in the URL when opening the website Account page for cancellation.
 *
 * Body: { figmaUserId }
 *
 * Threat model: figmaUserId is the bearer credential here (consistent
 * with /api/license/me). An attacker who knows another user's
 * figmaUserId could request a token and trigger their cancellation. The
 * blast radius is bounded: cancellation is end-of-period (no immediate
 * loss of access), and the victim can re-subscribe at any time. Phase 4+
 * follow-up: bind tokens to the plugin install via a per-install secret
 * exchanged at first launch.
 */
router.post("/issue-cancel-token", (req: Request, res: Response) => {
  const { figmaUserId } = req.body as { figmaUserId?: string };
  if (!figmaUserId || typeof figmaUserId !== "string") {
    res.status(400).json({ error: "figmaUserId is required" });
    return;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("[Auth] AUTH_SECRET env var is not set");
    res.status(500).json({ error: "Server auth not configured" });
    return;
  }

  // 5-minute TTL — long enough for a user to click through to the website
  // and verify, short enough that a leaked URL is mostly useless.
  const token = signToken(figmaUserId, secret, 5 * 60);
  res.json({ token, expiresInSeconds: 5 * 60 });
});

export default router;
