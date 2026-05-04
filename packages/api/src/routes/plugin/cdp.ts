/**
 * CDP + auth capture routes
 * POST /api/import-cdp
 * POST /api/capture-with-auth
 * GET  /api/pending-import
 * DELETE /api/pending-import
 */

import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import { createWireframeData } from "../../lib/htmlExtractor.js";
import {
  DEFAULT_PLUGIN_COLORS,
  createLocalStylesStructure,
} from "../../utils/styleUtils.js";
import { validateUrl } from "../../utils/urlValidation.js";
import { pendingCDPImports } from "../../state.js";
import { convertAssetsForFigma } from "../../lib/cdp/convertImage.js";
import { requireImportAllowance } from "../../middleware/licenseGate.js";

const router = Router();

/**
 * POST /api/import-cdp - Import from Browser Extension (CDP-captured data)
 *
 * This endpoint receives pre-extracted data from the Browser Extension
 * which uses Chrome DevTools Protocol for higher quality extraction.
 * Stores data in memory for Plugin to fetch via GET /api/pending-import.
 *
 * Request body:
 * - captureData: CaptureResult from Browser Extension
 * - timestamp: number
 */
router.post("/import-cdp", requireImportAllowance, async (req: Request, res: Response) => {
  try {
    const { captureData, cookies, webStorage, timestamp } = req.body;

    if (!captureData || !Array.isArray(captureData.frames)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid captureData (frames must be an array)",
      });
    }

    // CDP data now contains frames array (multi-viewport support)
    // Each frame has { viewport: { width, height }, tree: ExtractedElement, assets?: Record<string,string> }
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

    // Extract viewport widths for response
    const viewports = frames.map((f: { viewportWidth: number }) => f.viewportWidth);

    // Create local styles structure
    const localStyles = createLocalStylesStructure(DEFAULT_PLUGIN_COLORS, {
      primary: "Montserrat",
    });

    // Generate unique import ID
    const importId = `cdp-${Date.now()}-${randomUUID().slice(0, 8)}`;

    // Store in pending imports (expires in 10 minutes)
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

    pendingCDPImports.set(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
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
      error: (error as Error).message,
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
 * Request body:
 * - capturedData: W2WCaptureResult | W2WMultiCaptureResult
 * - timestamp: number
 */
// /api/import-w2w is the Browser Extension's queue write — extension
// has no access to figmaUserId, so this endpoint stays public. The
// license gate fires when the Plugin retrieves the capture via
// GET /api/pending-import (which is figmaUserId-aware).
router.post("/import-w2w", async (req: Request, res: Response) => {
  try {
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

    // Shared assets live at top level on both legacy and multi payloads.
    const sharedAssets = capturedData.assets || {};

    // Convert each W2W frame to a WireframeFrame entry for the plugin.
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

    // Pick a title — multi payloads have per-frame doc.title; take the first.
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

    pendingCDPImports.set(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000,
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
      error: (error as Error).message,
      errorCode: "W2W_IMPORT_ERROR",
    });
  }
});

/**
 * POST /api/capture-with-auth - Capture URL with forwarded cookies (Layer #5)
 *
 * Receives cookies from Browser Extension and injects them into Puppeteer
 * before navigating, enabling authenticated page capture via the backend.
 *
 * Request body:
 * - url: string (target URL)
 * - viewports: number[] (viewport widths)
 * - cookies: Array<{ name, value, domain, path, secure, httpOnly, sameSite, expirationDate? }>
 */
router.post("/capture-with-auth", async (req: Request, res: Response) => {
  try {
    const { url, viewports, cookies, webStorage } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "Missing url" });
    }

    // Validate URL
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return res.status(400).json({ success: false, error: urlValidation.error });
    }

    const targetViewports = (viewports && viewports.length > 0) ? viewports : [1440];

    // Use createWireframeData with cookies + webStorage options (Layer #5)
    const result = await createWireframeData(urlValidation.url!, targetViewports, {
      cookies: cookies || [],
      webStorage: webStorage || undefined,
    });

    // Store in pending imports (same pattern as import-cdp)
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

    pendingCDPImports.set(importId, {
      data: importData,
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000,
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
      error: (error as Error).message,
      errorCode: "AUTH_CAPTURE_ERROR",
    });
  }
});

/**
 * GET /api/pending-import - Check for pending CDP imports
 * Returns the most recent pending import and removes it from storage.
 */
router.get("/pending-import", async (req: Request, res: Response) => {
  // Find the most recent pending import
  let latestEntry: { data: Record<string, unknown>; timestamp: number; expires: number } | null = null;
  let latestId: string | null = null;

  for (const [id, entry] of pendingCDPImports.entries()) {
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

  // We have a real capture to deliver — gate on the user's import quota.
  // Polling with no pending data does NOT increment usage; only the
  // consumption of an actual capture does.
  const fromQuery = req.query?.figmaUserId;
  const figmaUserId = typeof fromQuery === "string" ? fromQuery : null;
  if (!figmaUserId) {
    return res.status(400).json({
      success: false,
      error: "figmaUserId query parameter is required",
    });
  }
  const { licenseService } = await import("../../services/licenseService.js");
  const gate = await licenseService.useImport(figmaUserId);
  if ("error" in gate) {
    return res.status(403).json({
      success: false,
      error: "limit_exceeded",
      upgradeUrl: "/api/checkout/create",
    });
  }

  // Remove from pending (one-time fetch — only after the gate passes so
  // a quota-exceeded user can re-poll after upgrading).
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
});

/**
 * DELETE /api/pending-import - Clear all pending imports
 */
router.delete("/pending-import", (req: Request, res: Response) => {
  const count = pendingCDPImports.size;
  pendingCDPImports.clear();
  res.json({
    success: true,
    message: `Cleared ${count} pending import(s)`,
  });
});

export default router;
