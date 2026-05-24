/**
 * Background Service Worker — entry point.
 *
 * Thin shim: gate console output, wire cross-module state, and route
 * `chrome.runtime.onMessage` to the appropriate handler. The actual
 * capture pipelines live in:
 *
 *   capture/legacy.ts   — DOMSnapshot-only flow (unreachable from UI;
 *                          kept for /api/import-cdp parity)
 *   capture/w2w.ts      — active hybrid content-script + CDP flow
 *   capture/element.ts  — area-capture / inspect-mode subtree extraction
 *   inspect/index.ts    — CDP element-picker mode
 *   state.ts            — cross-handler mutable state
 *   utils/              — settings, downloads, helpers
 *
 * The `[W2W]` traces below are silenced in prod by
 * `gateConsoleInProduction()` (see ../shared/consoleGating).
 */
/* eslint-disable no-console */

import { gateConsoleInProduction } from "../shared/consoleGating";

// Service worker is its own JS context — gate console here too.
gateConsoleInProduction();

import type { ExtensionMessage, CaptureOptions } from "@/shared/types";

import { state } from "./state";
import { getSettings, updateSettings } from "./utils/settings";
import { autoDownloadResult, getDomainFromUrl, sendToBackend } from "./utils/download";
import {
  startInspectMode,
  cancelInspectMode,
  registerCaptureByBackendId,
} from "./inspect";
import { handleCapturePage } from "./capture/legacy";
import { handleCapturePageW2W, w2wCountNodes } from "./capture/w2w";
import {
  handleCaptureElement,
  handleCaptureElementByBackendId,
} from "./capture/element";

// Wire the element-capture callback for inspect mode. Registered eagerly
// so the first user click after install lands without races.
registerCaptureByBackendId((tabId, backendNodeId, options, client) =>
  handleCaptureElementByBackendId(tabId, backendNodeId, options, client),
);

/**
 * Dispatch messages from popup, options, and content scripts to the
 * appropriate handler. Returning `true` keeps the message channel open
 * so the handler can resolve the promise and call sendResponse later.
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    // Trust boundary: only handle messages from this extension's own
    // contexts (popup, options, content scripts). A message from any other
    // extension — or a web page — must never drive CDP attach or downloads.
    if (sender.id !== chrome.runtime.id) {
      return false;
    }

    if (message.type === "CAPTURE_PAGE") {
      console.log("[W2W] CAPTURE_PAGE received, tabId:", message.tabId);
      handleCapturePage(message.tabId, message.options)
        .then(async (result) => {
          console.log("[W2W] Capture complete, frames:", result.frames.length);
          // Always auto-download from background as fallback
          // (popup may have closed during the lengthy capture)
          await autoDownloadResult(result, message.tabId, "page").catch((e) =>
            console.error("[W2W] Auto-download fallback failed:", e),
          );
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error("[W2W] Capture failed:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
    }

    // W2W content script capture
    if (message.type === "CAPTURE_PAGE_W2W") {
      console.log("[W2W] CAPTURE_PAGE_W2W received, tabId:", message.tabId);
      handleCapturePageW2W(message.tabId, message.options)
        .then(async (result) => {
          const totalNodes = result.frames.reduce(
            (sum, f) => sum + w2wCountNodes(f.frame),
            0,
          );
          console.log(
            `[W2W] W2W capture complete: ${result.frames.length} viewport(s), ${totalNodes} total nodes`,
          );
          // Auto-download combined JSON — one file with all viewports
          try {
            const jsonString = JSON.stringify(result, null, 2);
            const domain = getDomainFromUrl(result.url || "");
            const widthLabel = result.frames.map((f) => f.width).join("_");
            const filename = `${domain}_${widthLabel}_w2w.json`;
            console.log(`[W2W] JSON size: ${(jsonString.length / 1024 / 1024).toFixed(1)} MB`);

            const jsonBlob = new Blob([jsonString], { type: "application/json" });
            const jsonReader = new FileReader();
            const jsonDataUrl = await new Promise<string>((resolve, reject) => {
              jsonReader.onload = () => resolve(jsonReader.result as string);
              jsonReader.onerror = reject;
              jsonReader.readAsDataURL(jsonBlob);
            });
            await chrome.downloads.download({ url: jsonDataUrl, filename, saveAs: false });
          } catch (e) {
            console.error("[W2W] Auto-download failed:", e);
          }
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error("[W2W] Capture failed:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === "SEND_TO_BACKEND") {
      sendToBackend(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    if (message.type === "GET_SETTINGS") {
      getSettings().then((settings) => sendResponse(settings));
      return true;
    }

    if (message.type === "UPDATE_SETTINGS") {
      updateSettings(message.settings).then(() =>
        sendResponse({ success: true }),
      );
      return true;
    }

    if (message.type === "GET_CAPTURE_STATUS") {
      sendResponse({ isCapturing: state.isCapturing, progress: state.captureProgress });
      return false;
    }

    // === CDP Inspect Mode Selection Handler ===

    if (message.type === "START_SELECTION") {
      const { tabId, options } = message as { tabId: number; options: CaptureOptions };
      startInspectMode(tabId, options)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message.type === "CANCEL_SELECTION") {
      cancelInspectMode()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    // Legacy handler - kept for compatibility
    if (message.type === "ELEMENT_PICKED") {
      handleCaptureElement(
        message.tabId,
        message.selector,
        message.bounds,
        message.options,
      )
        .then(async (result) => {
          // Auto-download since popup is closed
          await autoDownloadResult(result, message.tabId, "element");
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    return false;
  },
);
