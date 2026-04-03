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
router.post("/import-cdp", async (req: Request, res: Response) => {
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
router.get("/pending-import", (req: Request, res: Response) => {
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

  // Remove from pending (one-time fetch)
  pendingCDPImports.delete(latestId!);

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
