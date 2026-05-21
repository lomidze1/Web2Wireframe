import rateLimit from "express-rate-limit";
import { config } from "../config/env.js";

/**
 * Key requests by client IP. `req.ip` honors the configured `trust proxy`
 * hop count, so a client-supplied `x-forwarded-for` header cannot shift the
 * rate-limit bucket (which raw-header parsing would have allowed).
 */
export const ipKeyGenerator = (req: { ip?: string }): string =>
  req.ip ?? "unknown";

/** Rate limiting is a production concern — skip it for local development. */
const skipInDevelopment = (): boolean =>
  config.server.nodeEnv === "development";

function makeLimiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    skip: skipInDevelopment,
  });
}

export const supportRateLimiter = makeLimiter(
  config.rateLimit.windowMs,
  config.rateLimit.maxRequests,
  "Too many support requests, please try again later",
);

// Auth surface: OAuth login/callback and the nonce exchange. The exchange is
// polled (~every 2s for up to 3 min) so the budget must clear a few full
// OAuth attempts without throttling a legitimate user.
export const authRateLimiter = makeLimiter(
  10 * 60 * 1000,
  300,
  "Too many authentication requests, please try again later",
);

// Checkout invoice creation + subscription cancel — cheap to call, spammable.
export const checkoutRateLimiter = makeLimiter(
  10 * 60 * 1000,
  20,
  "Too many checkout requests, please try again later",
);

// Flitt webhook — Flitt-initiated; generous ceiling, just brute-force defence
// against signature/replay probing.
export const webhookRateLimiter = makeLimiter(
  60 * 1000,
  120,
  "Too many webhook requests",
);

// Import endpoints — guards the expensive Puppeteer/AI pipeline and the
// extension capture queue against cost-amplification abuse.
export const importRateLimiter = makeLimiter(
  10 * 60 * 1000,
  60,
  "Too many import requests, please try again later",
);

/**
 * Per-figmaUserId rate limiter for /api/license/by-token. The shared
 * `authRateLimiter` is IP-keyed (300/10min), which a distributed botnet
 * can grind through by spreading attempts across many IPs while focused
 * on a single victim's figmaUserId.
 *
 * This limiter keys by the body's `figmaUserId`, so all attempts against
 * the same victim's identifier hit the same bucket regardless of source
 * IP. Legit traffic peaks at ~2 calls/session ("open Account from plugin"
 * then "click Cancel"), so 30/minute is generous.
 *
 * Fallback: when the body doesn't carry a string figmaUserId, key by IP
 * to avoid bypass via "send a malformed body to get a fresh bucket".
 *
 * Order matters: this limiter MUST run AFTER express.json() (so req.body
 * is populated) but BEFORE the route handler. Both are true given the
 * global parser is mounted up-front in index.ts.
 */
export const byTokenUserRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many license-by-token requests for this account",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: { ip?: string; body?: unknown }): string => {
    const body = req.body as { figmaUserId?: unknown } | undefined;
    const uid = body?.figmaUserId;
    if (typeof uid === "string" && uid.length > 0) {
      return `byToken:uid:${uid}`;
    }
    // Malformed body — fall back to IP keying so an attacker can't reset
    // the bucket by omitting the field.
    return `byToken:ip:${req.ip ?? "unknown"}`;
  },
  skip: skipInDevelopment,
});
