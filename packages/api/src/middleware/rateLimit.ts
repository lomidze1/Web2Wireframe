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
