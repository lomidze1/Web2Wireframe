import type { Request, Response, NextFunction } from "express";
import { licenseService } from "../services/licenseService.js";

declare global {
  namespace Express {
    interface Request {
      /** Remaining imports in current cycle (set by requireImportAllowance). null = unlimited (Pro). */
      importRemaining?: number | null;
    }
  }
}

/**
 * Express middleware: gate an import endpoint behind the license quota.
 *
 * Identity comes from the verified plugin token (`req.userId`, set by
 * `authenticatePlugin`) — never from a client-supplied body/query field.
 * Atomically increments the user's monthly import counter and returns 403
 * with `error: "limit_exceeded"` when the Free quota is exhausted.
 *
 * Trade-off: increments BEFORE the import is processed. A crash mid-import
 * "consumes" an import without delivering one — acceptable for MVP given
 * Free users still have 9 retries available, and Pro is unlimited. If we
 * later want stricter accounting, switch to a check/consume pair with
 * compensating decrement on failure.
 */
export async function requireImportAllowance(
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
}
