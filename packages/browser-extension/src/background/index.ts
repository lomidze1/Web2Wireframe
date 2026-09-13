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
import { installSwDevLog } from "../shared/devLog";

// Service worker is its own JS context — gate console here too.
gateConsoleInProduction();
// Dev-log build only (W2W_DEV_LOG=1): mirror SW console to 127.0.0.1:3999.
installSwDevLog();

import type { ExtensionMessage, CaptureOptions } from "@/shared/types";

import { state, setCaptureState } from "./state";
import { getSettings, updateSettings } from "./utils/settings";
import { autoDownloadResult, exportCapture, getDomainFromUrl, sendToBackend } from "./utils/download";
import { connectFigma } from "../shared/licenseClient";
import { submitIssueReport } from "./utils/report";

/**
 * One OAuth flow at a time. The popup closes the moment the OAuth tab
 * takes focus, so a second click can't deliver the message until the
 * popup is reopened — but a fresh service-worker invocation (cold start
 * after an idle period) would otherwise be able to fire a second tab in
 * parallel. Guard with this module-level flag.
 */
let oauthInFlight = false;
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
          await autoDownloadResult(result, message.tabId).catch((e) =>
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
      // Persist lifecycle so a reopened popup restores it — Chrome closes the
      // action popup once the debugger infobar takes focus.
      setCaptureState({ status: "capturing", progress: 0, message: "Starting capture..." });
      handleCapturePageW2W(message.tabId, message.options)
        .then(async (result) => {
          const totalNodes = result.frames.reduce(
            (sum, f) => sum + w2wCountNodes(f.frame),
            0,
          );
          console.log(
            `[W2W] W2W capture complete: ${result.frames.length} viewport(s), ${totalNodes} total nodes`,
          );
          setCaptureState({
            status: "success",
            progress: 100,
            message: "Capture complete!",
            stats: result.captureStats,
          });
          // Auto-export combined capture — one hardened .w2w file with all
          // viewports. (Read it back as JSON via scripts/w2w-decode.mjs.)
          try {
            const domain = getDomainFromUrl(result.url || "");
            const widthLabel = result.frames.map((f) => f.width).join("_");
            await exportCapture(result, message.tabId, `${domain}_${widthLabel}_wireframe`);
          } catch (e) {
            console.error("[W2W] Auto-export failed:", e);
          }
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error("[W2W] Capture failed:", error);
          setCaptureState({ status: "error", progress: 0, message: "", error: error.message });
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

    // === Figma OAuth (background-owned polling) ===
    //
    // The popup closes when the OAuth tab takes focus, so we run the
    // 3-minute poll loop in the service worker instead. Active fetches
    // keep the worker alive; once the backend parks the token,
    // connectFigma persists the session to chrome.storage.local and the
    // popup's onStorageChange listener flips the UI on next open.
    if (message.type === "START_FIGMA_OAUTH") {
      // Visible in `chrome://extensions → Inspect views: service worker`
      // even in production builds (consoleGating only silences `log/debug/
      // info/trace`). Lets us confirm the popup message actually arrived
      // at the service worker.
      console.warn("[Background] START_FIGMA_OAUTH received");
      if (oauthInFlight) {
        sendResponse({ success: false, reason: "in_flight" });
        return false;
      }
      oauthInFlight = true;
      connectFigma()
        .then(() => console.warn("[Background] OAuth succeeded — session persisted"))
        .catch((err) => console.warn("[Background] OAuth failed:", err))
        .finally(() => {
          oauthInFlight = false;
        });
      sendResponse({ success: true });
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
          await autoDownloadResult(result, message.tabId);
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === "REPORT_ISSUE") {
      submitIssueReport(message.payload)
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    return false;
  },
);
