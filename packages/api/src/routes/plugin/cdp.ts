/**
 * CDP + auth capture routes
 * POST   /api/extension-pair    (plugin — issues a pairing code)
 * POST   /api/import-cdp        (extension — pairing-code scoped)
 * POST   /api/import-w2w        (extension — pairing-code scoped)
 * POST   /api/capture-with-auth (extension — pairing-code scoped)
 * GET    /api/pending-import    (plugin — token scoped)
 * DELETE /api/pending-import    (plugin — token scoped)
 */

import { randomUUID, randomBytes } from "node:crypto";
import { Router, Request, Response } from "express";
import { createWireframeData } from "../../lib/htmlExtractor.js";
import {
  DEFAULT_PLUGIN_COLORS,
  createLocalStylesStructure,
} from "../../utils/styleUtils.js";
import { validateUrl } from "../../utils/urlValidation.js";
import {
  pendingCDPImports,
  setPendingImport,
  pendingPairings,
  PAIRING_CODE_TTL_MS,
  isPairingCodeLocked,
  recordPairingFailure,
  clearPairingFailures,
} from "../../state.js";
import { convertAssetsForFigma } from "../../lib/cdp/convertImage.js";
import { authenticatePlugin } from "../../middleware/auth.js";
import {
  authRateLimiter,
  importRateLimiter,
} from "../../middleware/rateLimit.js";

const router = Router();

// Unambiguous charset — no 0/O, 1/I/L — for human-typed pairing codes.
const PAIRING_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LENGTH = 10;

function generatePairingCode(): string {
  // 10 chars × 31-char alphabet ≈ 49 bits of entropy (M-2: raised from 8
  // chars / 39 bits to widen the safety margin against brute-force as
  // concurrent-code count grows post-launch). Combined with per-code
  // failure lockout (state.ts) the practical attack surface is now both
  // entropy-bounded AND probe-budget bounded.
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    code += PAIRING_CHARSET[bytes[i] % PAIRING_CHARSET.length];
  }
  return code;
}

/**
 * Invalidate any pairing codes already outstanding for `figmaUserId`. Called
 * before issuing a fresh one so a user can't accumulate multiple live codes
 * (each was previously valid until its independent 10-min TTL elapsed, which
 * widened the brute-force surface unnecessarily).
 */
function invalidatePriorCodesForUser(figmaUserId: string): void {
  for (const [code, entry] of pendingPairings.entries()) {
    if (entry.figmaUserId === figmaUserId) {
      pendingPairings.delete(code);
    }
  }
}

/**
 * Resolve the pairing code on an extension capture request to the figmaUserId
 * that issued it. Returns null when the code is missing, unknown, expired,
 * or locked out (too many failed attempts — see M-2).
 */
function resolvePairing(req: Request): string | null {
  const raw = (req.body as { pairingCode?: unknown } | undefined)?.pairingCode;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const code = raw.trim().toUpperCase();
  // M-2: short-circuit if this code has been brute-forced past the threshold.
  // Doing this BEFORE the lookup is critical — otherwise an attacker who
  // finally lands a correct guess after N failures still wins.
  if (isPairingCodeLocked(code)) return null;
  const entry = pendingPairings.get(code);
  if (!entry) {
    recordPairingFailure(code);
    return null;
  }
  if (entry.expires <= Date.now()) {
    pendingPairings.delete(code);
    recordPairingFailure(code);
    return null;
  }
  // Successful resolve — capture endpoints reuse the same code multiple
  // times within the TTL, so clear the failure counter so legitimate users
  // are never accidentally locked out by stale counter entries.
  clearPairingFailures(code);
  return entry.figmaUserId;
}

/**
 * POST /api/extension-pair
 *
 * Plugin → backend. Issues a short pairing code bound to the caller's
 * verified figmaUserId. The user types this code into the browser extension
 * so its captures land in *their* queue slot, not the global "latest" one.
 */
router.post(
  "/extension-pair",
  authRateLimiter,
  authenticatePlugin,
  (req: Request, res: Response) => {
    const figmaUserId = req.userId!;
    // A user calling /extension-pair repeatedly previously accumulated valid
    // codes, each independently alive for 10 min — widening the brute-force
    // surface for no operational benefit. Drop the older ones first.
    invalidatePriorCodesForUser(figmaUserId);
    const code = generatePairingCode();
    pendingPairings.set(code, {
      figmaUserId,
      expires: Date.now() + PAIRING_CODE_TTL_MS,
    });
    res.json({
      success: true,
      code,
      expiresInSeconds: Math.floor(PAIRING_CODE_TTL_MS / 1000),
    });
  },
);

/**
 * POST /api/import-cdp - Import from Browser Extension (CDP-captured data)
 *
 * Stores data in memory for the Plugin to fetch via GET /api/pending-import.
 * Scoped by pairing code — the extension has no plugin token.
 */
router.post("/import-cdp", importRateLimiter, async (req: Request, res: Response) => {
  try {
    const figmaUserId = resolvePairing(req);
    if (!figmaUserId) {
      return res.status(403).json({
        success: false,
        error: "Invalid or expired pairing code",
      });
    }

    const { captureData, cookies, webStorage, timestamp } = req.body;

    if (!captureData || !Array.isArray(captureData.frames)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid captureData (frames must be an array)",
      });
    }

    const frames = (captureData.frames || []).map((frame: {
      viewport: { width: number; height: number };
      tree: unknown;
      assets?: Record<string, string>;
      viewportMetadata?: unknown;
    }) => {
      return {
        viewportWidth: frame.viewport.width,
        viewportHeight: frame.viewport.height,
        tree: frame.tree,
        assets: frame.assets || {},
        viewportMetadata: frame.viewportMetadata || null,
      };
    });

    const viewports = frames.map((f: { viewportWidth: number }) => f.viewportWidth);

    const localStyles = createLocalStylesStructure(DEFAULT_PLUGIN_COLORS, {
      primary: "Montserrat",
    });

    const importId = `cdp-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const safeCookies = cookies || [];
    const safeWebStorage = webStorage || { localStorage: {}, sessionStorage: {} };

    const importData: Record<string, unknown> = {
      success: true,
      importId,
      sourceUrl: captureData.url,
      title: captureData.title,
      viewports,
      frameCount: frames.length,
      wireframeData: { frames },
      localStyles,
      fonts: captureData.fonts || [],
      cssVariables: captureData.cssVariables || [],
      stylesheets: captureData.stylesheets || [],
      cookies: safeCookies,
      webStorage: safeWebStorage,
      cdpMetadata: {
        captureTimestamp: timestamp,
        hasMatchedStyles: true,
        hasGradients: true,
        hasCookies: (safeCookies as unknown[]).length > 0,
        hasWebStorage: Object.keys((safeWebStorage as Record<string, Record<string, unknown>>).localStorage || {}).length > 0 ||
                       Object.keys((safeWebStorage as Record<string, Record<string, unknown>>).sessionStorage || {}).length > 0,
      },
    };

    setPendingImport(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      figmaUserId,
    });

    res.json({
      success: true,
      importId,
      message: "Data received. Open Figma plugin to import.",
    });
  } catch (error) {
    console.error("[CDP Import] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process capture",
      errorCode: "CDP_IMPORT_ERROR",
    });
  }
});

/**
 * POST /api/import-w2w — W2W content script capture import
 *
 * Receives W2WCaptureResult (single viewport, legacy) OR
 * W2WMultiCaptureResult (multi-viewport) from Browser Extension.
 * Pass-through storage — Figma plugin handles CSS→Figma conversion.
 *
 * Public (the extension has no plugin token) but scoped by pairing code so a
 * capture lands only in the issuing user's queue slot. The license gate fires
 * when the Plugin retrieves the capture via GET /api/pending-import.
 */
router.post("/import-w2w", importRateLimiter, async (req: Request, res: Response) => {
  try {
    const figmaUserId = resolvePairing(req);
    if (!figmaUserId) {
      return res.status(403).json({
        success: false,
        error: "Invalid or expired pairing code",
      });
    }

    const { capturedData, timestamp } = req.body;

    if (!capturedData) {
      return res.status(400).json({
        success: false,
        error: "Missing capturedData",
      });
    }

    // Detect multi-viewport payload (W2WMultiCaptureResult has frames[])
    // vs legacy single-viewport payload (W2WCaptureResult has frame + width).
    const isMulti = Array.isArray(capturedData.frames);
    const frameSlices: Array<{ width: number; frame: unknown; doc: { innerHeight?: number; title?: string } }> = isMulti
      ? capturedData.frames
      : [
          {
            width: capturedData.width,
            frame: capturedData.frame,
            doc: capturedData.doc,
          },
        ];

    if (frameSlices.length === 0 || !frameSlices[0].frame) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid capturedData (at least one frame is required)",
      });
    }

    const importId = `w2w-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const sharedAssets = capturedData.assets || {};

    const frames = frameSlices.map((fs) => ({
      viewportWidth: fs.width || 1440,
      viewportHeight: fs.doc?.innerHeight || 900,
      tree: {}, // Empty tree — plugin will use capturedData.frame for conversion
      capturedData: {
        frame: fs.frame,
        assets: sharedAssets,
        doc: fs.doc,
      },
    }));

    const viewports = frameSlices.map((fs) => fs.width || 1440);

    const localStyles = createLocalStylesStructure(DEFAULT_PLUGIN_COLORS, {
      primary: "Montserrat",
    });

    const title = frameSlices[0]?.doc?.title || capturedData.doc?.title || "Untitled";

    const importData: Record<string, unknown> = {
      success: true,
      importId,
      sourceUrl: capturedData.url || capturedData.name,
      title,
      viewports,
      frameCount: frames.length,
      wireframeData: { frames },
      localStyles,
      fonts: capturedData.fonts || [],
      cssVariables: capturedData.cssVariables || [],
      stylesheets: [],
      cdpMetadata: {
        captureTimestamp: timestamp || Date.now(),
        extractionMethod: "w2w-content-script",
        hasMatchedStyles: false,
        hasGradients: false,
        hasCookies: false,
        hasWebStorage: false,
      },
    };

    setPendingImport(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000,
      figmaUserId,
    });

    res.json({
      success: true,
      importId,
      message: "W2W data received. Open Figma plugin to import.",
    });
  } catch (error) {
    console.error("[W2W Import] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process capture",
      errorCode: "W2W_IMPORT_ERROR",
    });
  }
});

/**
 * POST /api/capture-with-auth - Capture URL with forwarded cookies (Layer #5)
 *
 * Receives cookies from Browser Extension and injects them into Puppeteer
 * before navigating, enabling authenticated page capture via the backend.
 * Scoped by pairing code.
 */
router.post("/capture-with-auth", importRateLimiter, async (req: Request, res: Response) => {
  try {
    const figmaUserId = resolvePairing(req);
    if (!figmaUserId) {
      return res.status(403).json({
        success: false,
        error: "Invalid or expired pairing code",
      });
    }

    const { url, viewports, cookies, webStorage } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "Missing url" });
    }

    // Validate URL (also rejects private/internal hosts — SSRF)
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return res.status(400).json({ success: false, error: urlValidation.error });
    }

    const targetViewports = (viewports && viewports.length > 0) ? viewports : [1440];

    const result = await createWireframeData(urlValidation.url!, targetViewports, {
      cookies: cookies || [],
      webStorage: webStorage || undefined,
    });

    const importId = `auth-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const localStyles = createLocalStylesStructure(DEFAULT_PLUGIN_COLORS, {
      primary: "Montserrat",
    });

    const importData: Record<string, unknown> = {
      success: true,
      importId,
      sourceUrl: urlValidation.url,
      title: urlValidation.url,
      viewports: targetViewports,
      frameCount: result.frames.length,
      wireframeData: { frames: result.frames },
      localStyles,
      fonts: result.fonts || [],
      cssVariables: result.cssVariables || [],
      stylesheets: result.stylesheets || [],
      cdpMetadata: {
        captureTimestamp: Date.now(),
        hasMatchedStyles: true,
        authForwarded: true,
      },
    };

    setPendingImport(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000,
      figmaUserId,
    });

    res.json({
      success: true,
      importId,
      message: "Authenticated capture complete. Open Figma plugin to import.",
    });
  } catch (error) {
    console.error("[Auth Capture] Error:", error);
    res.status(500).json({
      success: false,
      error: "Authenticated capture failed",
      errorCode: "AUTH_CAPTURE_ERROR",
    });
  }
});

/**
 * GET /api/pending-import - Check for the caller's pending capture.
 * Returns only an entry that belongs to the authenticated user, and removes
 * it from storage. Polling with nothing pending does NOT consume quota.
 */
router.get(
  "/pending-import",
  authenticatePlugin,
  async (req: Request, res: Response) => {
    const figmaUserId = req.userId!;
    const now = Date.now();

    // Most recent non-expired capture belonging to this user.
    let latestEntry: { data: Record<string, unknown>; timestamp: number } | null = null;
    let latestId: string | null = null;
    for (const [id, entry] of pendingCDPImports.entries()) {
      if (entry.expires <= now) {
        pendingCDPImports.delete(id);
        continue;
      }
      if (entry.figmaUserId !== figmaUserId) continue;
      if (!latestEntry || entry.timestamp > latestEntry.timestamp) {
        latestEntry = entry;
        latestId = id;
      }
    }

    if (!latestEntry) {
      return res.json({
        success: true,
        hasPending: false,
        message: "No pending imports from Browser Extension",
      });
    }

    // A real capture is ready — gate on the user's import quota.
    const { licenseService } = await import("../../services/licenseService.js");
    const gate = await licenseService.useImport(figmaUserId);
    if ("error" in gate) {
      return res.status(403).json({
        success: false,
        error: "limit_exceeded",
        upgradeUrl: "/api/checkout/create",
      });
    }

    // One-time fetch — delete only after the gate passes so a quota-exceeded
    // user can re-poll after upgrading.
    pendingCDPImports.delete(latestId!);

    // Convert AVIF/WebP assets to JPEG for Figma compatibility (sharp on server)
    try {
      const wireframeData = latestEntry.data.wireframeData as { frames: Array<{ capturedData?: { assets?: Record<string, { base64Encoded: boolean; content: string; mimeType: string }> } }> } | undefined;
      if (wireframeData?.frames) {
        for (const frame of wireframeData.frames) {
          if (frame.capturedData?.assets) {
            await convertAssetsForFigma(frame.capturedData.assets);
          }
        }
      }
    } catch (err) {
      console.warn("[API] Asset conversion warning:", err);
    }

    res.json({
      success: true,
      hasPending: true,
      ...latestEntry.data,
    });
  },
);

/**
 * DELETE /api/pending-import - Clear the caller's own pending imports.
 */
router.delete(
  "/pending-import",
  authenticatePlugin,
  (req: Request, res: Response) => {
    let count = 0;
    for (const [id, entry] of pendingCDPImports.entries()) {
      if (entry.figmaUserId === req.userId) {
        pendingCDPImports.delete(id);
        count += 1;
      }
    }
    res.json({
      success: true,
      message: `Cleared ${count} pending import(s)`,
    });
  },
);

export default router;
