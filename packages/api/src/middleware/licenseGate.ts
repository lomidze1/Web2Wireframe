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
 * Reads `figmaUserId` from the request body (or `?figmaUserId` query for
 * GET endpoints), atomically increments the user's monthly import counter,
 * and returns 403 with `error: "limit_exceeded"` when the Free quota is
 * exhausted.
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
  const fromBody = (req.body as { figmaUserId?: unknown } | undefined)
    ?.figmaUserId;
  const fromQuery = req.query?.figmaUserId;
  const figmaUserId =
    typeof fromBody === "string"
      ? fromBody
      : typeof fromQuery === "string"
        ? fromQuery
        : null;

  if (!figmaUserId) {
    res.status(400).json({
      success: false,
      error: "figmaUserId is required for billable import endpoints",
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
