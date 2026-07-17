import type { Request, Response, NextFunction } from "express";
import { licenseService } from "../services/licenseService.js";
import { logImportEvent, type ImportType } from "../models/ImportEvent.js";

declare global {
  namespace Express {
    interface Request {
      /** Remaining imports in current cycle (set by requireImportAllowance). null = unlimited (Pro). */
      importRemaining?: number | null;
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
 * Trade-off: increments BEFORE the import is processed. A crash mid-import
 * "consumes" an import without delivering one — acceptable for MVP given
 * Free users still have 9 retries available, and Pro is unlimited. If we
 * later want stricter accounting, switch to a check/consume pair with
 * compensating decrement on failure.
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
