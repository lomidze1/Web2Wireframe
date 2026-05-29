/**
 * Browser-extension session routes.
 *
 *   POST /api/extension-session/redeem   (public — pairing-code → bearer token)
 *   POST /api/extension-session/refresh  (Bearer  — rotate token expiry)
 *   POST /api/extension-session/revoke   (Bearer  — blacklist token server-side)
 *
 * The pairing code is issued by the Figma plugin via /api/extension-pair
 * (cdp.ts) and bound to the plugin's verified figmaUserId. Redeem trades that
 * short-lived code for a long-lived HMAC bearer token that the extension uses
 * for every subsequent API call. After redemption the extension is, from the
 * backend's perspective, indistinguishable from the plugin: the same
 * authenticatePlugin middleware accepts both, so /api/license/me et al. work
 * without per-route changes.
 *
 * Revoke uses an in-memory blacklist (state.ts → revokedTokens). HMAC tokens
 * are stateless, so we cannot "unsign" them; the blacklist is the cheapest
 * way to make logout effective server-side. Restart wipes it (acceptable per
 * EXTENSION-IDENTITY-PARITY plan §risk register).
 */

import { Router, type Request, type Response } from "express";
import {
  EXTENSION_TOKEN_EXPIRY_SECONDS,
  authenticatePlugin,
  revokeToken,
  signToken,
  verifyToken,
} from "../../middleware/auth.js";
import {
  authRateLimiter,
  byTokenUserRateLimiter,
} from "../../middleware/rateLimit.js";
import { licenseService } from "../../services/licenseService.js";
import { serializeLicenseForPlugin } from "../../lib/serializeLicense.js";
import {
  mongoConnected,
  pendingPairings,
  isPairingCodeLocked,
  recordPairingFailure,
  clearPairingFailures,
} from "../../state.js";

const router = Router();

/**
 * 503 fast-fail when Mongo is down. Mirrors the guard used in license routes
 * so the extension surfaces "license database unavailable" cleanly instead
 * of the opaque 500 mongoose buffering would otherwise return.
 */
function requireMongo(_req: Request, res: Response): boolean {
  if (!mongoConnected) {
    const isDev = process.env.NODE_ENV === "development";
    res.status(503).json({
      error: "License database unavailable",
      ...(isDev && {
        hint: "MongoDB is not connected. Start mongo (docker compose up mongo -d).",
      }),
    });
    return false;
  }
  return true;
}

/**
 * POST /api/extension-session/redeem
 *
 * Public. Trades a one-time pairing code for a session token + license.
 * On success the pairing code is deleted so it cannot be redeemed twice
 * (this differs from capture routes, which intentionally keep the code
 * alive for the full 10-minute TTL so a user can capture multiple pages
 * after pairing once).
 */
router.post(
  "/redeem",
  authRateLimiter,
  async (req: Request, res: Response) => {
    if (!requireMongo(req, res)) return;

    const raw = (req.body as { pairingCode?: unknown } | undefined)?.pairingCode;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      res.status(400).json({ error: "pairingCode is required" });
      return;
    }
    const code = raw.trim().toUpperCase();

    // M-2: refuse to look up the entry if this code has hit the failure
    // threshold. Done BEFORE the Map lookup so an attacker who finally
    // lands a correct guess after N misses still gets a 429.
    if (isPairingCodeLocked(code)) {
      res.status(429).json({
        error: "Too many failed attempts. Request a new pairing code.",
      });
      return;
    }

    const entry = pendingPairings.get(code);
    if (!entry) {
      recordPairingFailure(code);
      res.status(401).json({ error: "Invalid or expired pairing code" });
      return;
    }
    if (entry.expires <= Date.now()) {
      pendingPairings.delete(code);
      recordPairingFailure(code);
      res.status(401).json({ error: "Invalid or expired pairing code" });
      return;
    }

    // One-time use: delete BEFORE any failure path that follows, so a partial
    // failure can't leak a still-valid code on a subsequent retry. Also clear
    // the (now-irrelevant) failure counter for this code.
    pendingPairings.delete(code);
    clearPairingFailures(code);

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[ExtensionSession] AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }

    try {
      const license = await licenseService.getOrCreate(entry.figmaUserId);
      const sessionToken = signToken(
        entry.figmaUserId,
        secret,
        EXTENSION_TOKEN_EXPIRY_SECONDS,
      );
      // expiresAt: same instant the token's `exp` encodes (seconds → ms).
      const expiresAt = new Date(
        (Math.floor(Date.now() / 1000) + EXTENSION_TOKEN_EXPIRY_SECONDS) * 1000,
      ).toISOString();
      res.json({
        sessionToken,
        expiresAt,
        figmaUserId: entry.figmaUserId,
        email: license.email,
        license: serializeLicenseForPlugin(license),
      });
    } catch (err) {
      console.error("[ExtensionSession] /redeem error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * POST /api/extension-session/refresh
 *
 * Rolls the token's expiry forward. The old token stays valid until its
 * own `exp`; the extension just overwrites its local copy. Rate-limited
 * per-user to prevent a leaked token from being refreshed in a tight loop.
 */
router.post(
  "/refresh",
  byTokenUserRateLimiter,
  authenticatePlugin,
  (req: Request, res: Response) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[ExtensionSession] AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }
    const sessionToken = signToken(
      req.userId!,
      secret,
      EXTENSION_TOKEN_EXPIRY_SECONDS,
    );
    const expiresAt = new Date(
      (Math.floor(Date.now() / 1000) + EXTENSION_TOKEN_EXPIRY_SECONDS) * 1000,
    ).toISOString();
    res.json({ sessionToken, expiresAt });
  },
);

/**
 * POST /api/extension-session/revoke
 *
 * Blacklist the bearer token used for THIS request so any future use of it
 * fails. Idempotent — re-revoking the same token is a no-op. The token must
 * still verify (be unexpired + correctly signed) for the call to succeed;
 * already-expired tokens are pointless to blacklist.
 */
router.post(
  "/revoke",
  byTokenUserRateLimiter,
  authenticatePlugin,
  (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    // authenticatePlugin already verified this header exists + starts with
    // "Bearer "; the assertions below are defense-in-depth, not real branches.
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: missing token" });
      return;
    }
    const token = authHeader.slice(7);
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[ExtensionSession] AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }
    // Re-verify so we can pull the original expiry off the payload — the
    // blacklist stores it so the entry can be pruned once the token would
    // have expired on its own. authenticatePlugin already verified this
    // upstream, so failures here are impossible barring secret rotation
    // mid-request; treat them as 401.
    let exp: number;
    try {
      exp = verifyToken(token, secret).exp;
    } catch {
      res.status(401).json({ error: "Unauthorized: token verification failed" });
      return;
    }
    revokeToken(token, exp * 1000);
    res.json({ ok: true });
  },
);

export default router;
