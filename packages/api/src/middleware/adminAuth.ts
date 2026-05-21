import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Verify an incoming admin credential against `process.env.ADMIN_TOKEN` in
 * constant time. A plain `===` / `!==` leaks how many leading bytes matched
 * via response latency, which an attacker can exploit byte-by-byte at scale
 * to recover the token without ever seeing the value.
 *
 * Both header conventions are accepted, in priority order:
 *   1. `X-Admin-Token: <value>`        — bespoke header (legacy callers)
 *   2. `Authorization: Bearer <value>` — what curl, Postman, Datadog,
 *                                        Grafana Agent etc. send by default
 *
 * In dev (no `ADMIN_TOKEN` env), this is a no-op so localhost probes
 * (curl /api/health/flitt) work without ceremony. Production startup
 * (`assertProductionSecrets`) already mandates `ADMIN_TOKEN`.
 */
export function verifyAdminCredential(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true; // dev — open by design

  const xAdmin = req.header("x-admin-token");
  const authHeader = req.header("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const provided = xAdmin ?? bearer ?? "";

  // Constant-time compare requires equal-length inputs. The length check
  // itself runs in constant time relative to the *attacker-supplied* value
  // (we never compare `expected.length` to itself).
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Express middleware form — for callers that want a single `.use()`-style
 * gate rather than the inline `verifyAdminCredential(req)` check.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!verifyAdminCredential(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
