import type { Request, Response, NextFunction } from "express";
import { createWebhookLogger } from "../services/webhookLogger.js";

/**
 * Per Flitt's documentation (and our `docs/PRE-LAUNCH-CHECKLIST.md §5`),
 * webhook deliveries originate from a known IP set. Adding an allowlist
 * check **before** signature verification narrows the attack surface
 * against signature-oracle probing — an attacker can no longer hammer the
 * endpoint from any IP looking for collisions.
 *
 * Behavior:
 *   - When `FLITT_IP_ALLOWLIST_ENABLED` is set to "true", the middleware
 *     rejects requests whose source IP isn't in the list. The default is
 *     OFF so Flitt-side IP rotations don't silently break webhook delivery
 *     before we can update the list.
 *   - Reject = log warn + HTTP 200 + `{received: true}` (NOT 403). A 4xx
 *     would trigger Flitt's retry storm, masking the real problem in
 *     traffic spikes. With 200, real Flitt deliveries see no behavior
 *     change, and "blocked" attackers learn nothing useful from the
 *     response.
 *   - The IP list is comma-separated in `FLITT_WEBHOOK_IPS`, falling back
 *     to the two known production IPs.
 *
 * The middleware is mounted only on the webhook router; the rest of the
 * API is unaffected.
 *
 * ⚠️ Trust-boundary requirement: `req.ip` is only trustworthy when the
 * `trust proxy` hop count in `index.ts` matches the actual number of
 * reverse proxies in front of the API. With a misconfigured hop count an
 * attacker can spoof `X-Forwarded-For` and bypass this check. See
 * `docs/runbooks/deployment-security.md §1` for full validation steps.
 */
const FLITT_DEFAULT_IPS = ["54.154.216.60", "3.75.125.89"];

function parseAllowlist(): Set<string> {
  const raw = process.env.FLITT_WEBHOOK_IPS;
  if (!raw) return new Set(FLITT_DEFAULT_IPS);
  const ips = raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return new Set(ips.length > 0 ? ips : FLITT_DEFAULT_IPS);
}

export function flittIpAllowlist(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.FLITT_IP_ALLOWLIST_ENABLED !== "true") {
    next();
    return;
  }
  const allow = parseAllowlist();
  // `req.ip` respects the `app.set("trust proxy", N)` setting, so an
  // attacker-supplied `X-Forwarded-For` header can't bypass the check.
  const source = req.ip ?? "unknown";
  if (allow.has(source)) {
    next();
    return;
  }
  // Strip IPv6-mapped prefix ("::ffff:54.154.216.60" → "54.154.216.60") for
  // environments where Express's IPv6 socket reports the v4 in v6 form.
  const stripped = source.replace(/^::ffff:/, "");
  if (allow.has(stripped)) {
    next();
    return;
  }
  const log = createWebhookLogger();
  log.warn("source IP not in Flitt allowlist — silently dropped", {
    source,
    allow: Array.from(allow),
  });
  res.status(200).json({ received: true });
}
