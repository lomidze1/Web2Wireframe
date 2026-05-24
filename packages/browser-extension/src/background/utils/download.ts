/* eslint-disable no-console -- diagnostic traces for download / backend
 * failures; silenced in prod by gateConsoleInProduction(). */

import type { CaptureResult } from "@w2w/shared";
import { getSettings } from "./settings";

/**
 * Strip protocol + leading `www.` and replace dots with underscores so the
 * hostname can be embedded in a download filename without confusing the
 * browser's filename sanitizer.
 */
export function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").replace(/\./g, "_");
  } catch {
    return "website";
  }
}

/**
 * Trigger a JSON download of the capture result from the service worker.
 *
 * Primary path is the data-URL flow (works in service workers since Chrome
 * 116). If that fails — typically because the JSON is too large to fit in
 * a data URL — we fall back to injecting a Blob-based downloader into the
 * tab's page context, which has full `URL.createObjectURL` support.
 */
export async function autoDownloadResult(
  result: CaptureResult,
  tabId: number,
  captureType: "page" | "area" | "element",
): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const domain = getDomainFromUrl(tab.url || "");
    const viewportLabel = result.frames.map((f) => f.viewport.width).join("_");
    const filename = `${domain}_${viewportLabel}_wireframe.json`;

    const jsonString = JSON.stringify(result, null, 2);
    console.log(`[W2W] Auto-download: ${filename} (${(jsonString.length / 1024).toFixed(0)}KB)`);

    const blob = new Blob([jsonString], { type: "application/json" });
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
    });
    console.log("[W2W] Download triggered:", filename);
  } catch (err) {
    console.error("[W2W] Auto-download primary failed:", err);
    // Fallback: inject script into the tab to trigger download from page context
    // (page context has full DOM API support including URL.createObjectURL)
    try {
      const jsonString = JSON.stringify(result, null, 2);
      const domain = getDomainFromUrl(result.url || "");
      const fallbackName = `${domain}_${captureType}_wireframe.json`;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (json: string, name: string) => {
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          a.click();
          URL.revokeObjectURL(url);
        },
        args: [jsonString, fallbackName],
      });
      console.log("[W2W] Fallback download via page injection succeeded");
    } catch (fallbackErr) {
      console.error("[W2W] Fallback download also failed:", fallbackErr);
    }
  }
}

/**
 * POST a capture result to the legacy CDP-import endpoint. Only used by
 * the (currently unreachable) `handleCapturePage` legacy flow. The active
 * W2W flow posts to `/api/import-w2w` directly.
 */
export async function sendToBackend(data: CaptureResult): Promise<unknown> {
  const settings = await getSettings();

  const response = await fetch(settings.backendUrl + "/api/import-cdp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      captureData: data,
      pairingCode: settings.pairingCode,
      timestamp: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return response.json();
}
