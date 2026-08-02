import type { Request, Response, NextFunction } from "express";
import { licenseService } from "../services/licenseService.js";
import { logImportEvent, type ImportType } from "../models/ImportEvent.js";

declare global {
  namespace Express {
    interface Request {
      /** Remaining imports in current cycle (set by requireImportAllowance). null = unlimited (Pro). */
      importRemaining?: number | null;
      /**
       * Set by a route that answers 200 while knowing the user got nothing
       * usable (bot-protection block page). Makes requireImportAllowance
       * refund the slot the same way a 4xx/5xx would.
       */
      importUndelivered?: boolean;
    }
  }
}

/**
 * Best-effort sourceUrl for a blocked attempt. `import-url` carries `url`,
 * the extension file flow carries `sourceUrl`; screenshot/html have no URL at
 * all, so fall back to the same `<type>-import` placeholder the route handlers
 * already write (schema requires the field).
 */
function blockedSourceUrl(req: Request, type: ImportType): string {
  const body = req.body as { url?: unknown; sourceUrl?: unknown } | undefined;
  if (typeof body?.url === "string" && body.url) return body.url;
  if (typeof body?.sourceUrl === "string" && body.sourceUrl) return body.sourceUrl;
  return `${type}-import`;
}

/**
 * Express middleware factory: gate an import endpoint behind the license quota.
 *
 * Identity comes from the verified plugin token (`req.userId`, set by
 * `authenticatePlugin`) — never from a client-supplied body/query field.
 * Atomically increments the user's monthly import counter and returns 403
 * with `error: "limit_exceeded"` when the Free quota is exhausted.
 *
 * `type` is passed in per route so a blocked attempt records which flow the
 * user was trying. It cannot be sniffed from the path without coupling the
 * gate to route strings.
 *
 * Increments BEFORE the import is processed (the atomic conditional update is
 * what makes concurrent imports race-free), so a failure would otherwise
 * "consume" an import without delivering one. A `res.on("finish")` hook
 * compensates: any 4xx/5xx response refunds the slot. The hook is attached
 * only after a successful increment, so the paths that never consumed
 * anything — 401, 403 limit_exceeded, the 503/fail-open branch — cannot
 * hand out free quota.
 */
export function requireImportAllowance(type: ImportType) {
  return async function importAllowanceGate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
  const figmaUserId = req.userId;

  if (!figmaUserId) {
    res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
    return;
  }

  try {
    const result = await licenseService.useImport(figmaUserId);
    if ("error" in result) {
      // The paywall collision is the highest-intent signal a Free user emits,
      // and the 403 returns before any route handler runs — so this is the
      // only place it can be recorded. Never let a telemetry failure turn a
      // clean 403 into a 500.
      try {
        void logImportEvent({
          figmaUserId,
          sourceUrl: blockedSourceUrl(req, type),
          type,
          viewports: [],
          success: false,
          errorCode: "QUOTA_EXCEEDED",
        });
      } catch (logErr) {
        console.warn("[licenseGate] quota-block log failed:", logErr);
      }
      res.status(403).json({
        success: false,
        error: "limit_exceeded",
        upgradeUrl: "/api/checkout/create",
      });
      return;
    }
    // Surface remaining for handlers that want to include it in the
    // response. null = unlimited (Pro plan).
    req.importRemaining = Number.isFinite(result.remaining)
      ? result.remaining
      : null;

    // The slot is spent above; give it back when the request ends in a
    // failure — validation 400s, extraction 500s, AI 422/429 — or when the
    // handler delivered a 200 it knows is worthless (`importUndelivered`,
    // e.g. a bot-protection block page). One hook here covers every import
    // route instead of a refund call at each of the ~22 error exits in the
    // handlers, and fires at most once so the two cases cannot double-refund.
    // A refund failure must never turn an already-sent response into a crash.
    res.on("finish", () => {
      if (res.statusCode < 400 && !req.importUndelivered) return;
      void licenseService.refundImport(figmaUserId).catch((err) => {
        console.warn("[licenseGate] quota refund failed:", err);
      });
    });

    next();
  } catch (err) {
    console.error("[licenseGate] useImport failed:", err);
    // Fail open in dev when DB is down, fail closed in prod.
    if (process.env.NODE_ENV === "production") {
      res.status(503).json({
        success: false,
        error: "License service unavailable",
      });
      return;
    }
    next();
  }
  };
}
