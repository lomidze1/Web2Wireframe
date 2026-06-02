/* eslint-disable no-console -- diagnostic traces for download / backend
 * failures; silenced in prod by gateConsoleInProduction(). */

import type { CaptureResult } from "@w2w/shared";
import { encodeW2W } from "@w2w/shared/w2w-codec";
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

/** Base64-encode bytes in the service worker (chunked to avoid call-stack limits). */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Trigger a file download of arbitrary bytes from the service worker.
 *
 * Primary path is the data-URL flow (works in service workers since Chrome
 * 116). If that fails — typically because the payload is too large to fit in
 * a data URL — we fall back to injecting a Blob-based downloader into the
 * tab's page context, which has full `URL.createObjectURL` support.
 */
async function downloadBytes(
  bytes: Uint8Array<ArrayBuffer>,
  filename: string,
  mime: string,
  tabId: number,
): Promise<void> {
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
    console.log("[W2W] Download triggered:", filename);
  } catch (err) {
    console.error(`[W2W] Download primary failed for ${filename}:`, err);
    // Page context has full DOM API support including URL.createObjectURL.
    // executeScript args must be JSON-serializable, so ship bytes as base64.
    const b64 = base64FromBytes(bytes);
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (data: string, name: string, type: string) => {
        const bin = atob(data);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      },
      args: [b64, filename, mime],
    });
    console.log("[W2W] Fallback download via page injection succeeded:", filename);
  }
}

/**
 * Export a capture result to disk as the hardened, opaque `.w2w` container —
 * the only format the extension ever writes. To read a `.w2w` as JSON for
 * debugging, decode it locally with `scripts/w2w-decode.mjs` (owner tooling,
 * not shipped).
 *
 * `filenameBase` is the name without extension (e.g. `example_com_1440_wireframe`).
 */
export async function exportCapture(
  result: unknown,
  tabId: number,
  filenameBase: string,
): Promise<void> {
  const packed = await encodeW2W(result);
  console.log(`[W2W] Export .w2w: ${filenameBase}.w2w (${(packed.length / 1024).toFixed(0)}KB)`);
  await downloadBytes(packed, `${filenameBase}.w2w`, "application/octet-stream", tabId);
}

/**
 * Export a legacy `CaptureResult` (page/element flows). Derives the filename
 * from the active tab's URL and per-viewport widths, then delegates to
 * {@link exportCapture}.
 */
export async function autoDownloadResult(
  result: CaptureResult,
  tabId: number,
): Promise<void> {
  let domain = "website";
  try {
    const tab = await chrome.tabs.get(tabId);
    domain = getDomainFromUrl(tab.url || result.url || "");
  } catch {
    domain = getDomainFromUrl(result.url || "");
  }
  const viewportLabel = result.frames.map((f) => f.viewport.width).join("_");
  await exportCapture(result, tabId, `${domain}_${viewportLabel}_wireframe`);
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
