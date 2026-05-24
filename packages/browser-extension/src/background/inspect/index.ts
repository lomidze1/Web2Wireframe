/* eslint-disable no-console -- inspect-mode tracing; silenced in prod by
 * gateConsoleInProduction(). */

/**
 * CDP-driven inspect-mode element picker.
 *
 * Uses Chrome's built-in element inspector via the Overlay domain (same
 * mechanism DevTools' "Inspect" arrow uses) so the user sees real-time
 * highlighting as they hover, with no in-page selection UI to maintain.
 * On click → captures the picked element's subtree as a wireframe.
 */

import { CDPClient } from "../cdp/client";
import {
  type CaptureOptions,
  DEFAULT_CAPTURE_OPTIONS,
  type CaptureResult,
} from "@w2w/shared";
import { state } from "../state";
import { autoDownloadResult } from "../utils/download";

/**
 * Callback that turns a CDP-resolved backendNodeId into a CaptureResult.
 * Wired in by index.ts during init so this module doesn't have to import
 * the full element-capture pipeline.
 */
export type CaptureByBackendId = (
  tabId: number,
  backendNodeId: number,
  options: CaptureOptions,
  client: CDPClient,
) => Promise<CaptureResult>;

let captureByBackendId: CaptureByBackendId | null = null;

/**
 * Register the element-capture callback. Must be called exactly once at
 * extension startup (see index.ts). Throwing here would crash the service
 * worker silently, so we just no-op subsequent registrations.
 */
export function registerCaptureByBackendId(fn: CaptureByBackendId): void {
  captureByBackendId = fn;
}

/**
 * Start CDP Inspect Mode for element selection.
 * Uses Chrome's built-in element inspector (like DevTools).
 */
export async function startInspectMode(
  tabId: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<void> {
  // Cancel any existing inspect mode
  await cancelInspectMode();

  try {
    // Create CDP client with Overlay domain
    const client = new CDPClient(tabId);
    await client.attach();
    await client.enableDomains("DOM", "Overlay", "CSS", "DOMSnapshot");

    state.inspectModeClient = client;
    state.inspectModeTabId = tabId;
    state.inspectModeOptions = options;

    // Highlight configuration (similar to DevTools)
    const highlightConfig = {
      showInfo: true,
      showStyles: false,
      showAccessibilityInfo: false,
      showExtensionLines: false,
      contentColor: { r: 111, g: 168, b: 220, a: 0.66 },  // Blue fill
      paddingColor: { r: 147, g: 196, b: 125, a: 0.55 }, // Green padding
      borderColor: { r: 255, g: 229, b: 153, a: 0.66 },  // Yellow border
      marginColor: { r: 246, g: 178, b: 107, a: 0.66 },  // Orange margin
    };

    // Listen for element selection
    client.on("Overlay.inspectNodeRequested", async (params: unknown) => {
      const { backendNodeId } = params as { backendNodeId: number };

      // Disable inspect mode first
      await client.send("Overlay.setInspectMode", {
        mode: "none",
        highlightConfig: {},
      });

      // Capture the selected element
      try {
        console.log("[W2W] Element selected, backendNodeId:", backendNodeId);
        if (!captureByBackendId) {
          throw new Error(
            "captureByBackendId callback not registered — call registerCaptureByBackendId() at startup",
          );
        }
        const result = await captureByBackendId(
          tabId,
          backendNodeId,
          state.inspectModeOptions,
          client,
        );
        console.log("[W2W] Element capture complete, downloading...");
        await autoDownloadResult(result, tabId, "element");
      } catch (err) {
        console.error("[W2W] Element capture/download failed:", err);
      } finally {
        // Cleanup inspect mode
        await cancelInspectMode();
      }
    });

    // Listen for inspect mode cancelled (user pressed ESC or clicked outside)
    client.on("Overlay.inspectModeCanceled", async () => {
      await cancelInspectMode();
    });

    // Start inspect mode
    await client.send("Overlay.setInspectMode", {
      mode: "searchForNode",
      highlightConfig,
    });

    // Inject a small UI for cancel button (in content script)
    await injectSelectionUI(tabId);
  } catch (error) {
    await cancelInspectMode();
    throw error;
  }
}

/**
 * Cancel CDP Inspect Mode and tear down all associated state.
 */
export async function cancelInspectMode(): Promise<void> {
  if (state.inspectModeClient) {
    try {
      // Disable inspect mode
      await state.inspectModeClient.send("Overlay.setInspectMode", {
        mode: "none",
        highlightConfig: {},
      }).catch(() => undefined);

      // Destroy client
      await state.inspectModeClient.destroy();
    } catch {
      // Ignore cleanup errors
    }
    state.inspectModeClient = null;
  }

  // Remove UI from page
  if (state.inspectModeTabId) {
    try {
      await chrome.tabs.sendMessage(state.inspectModeTabId, {
        type: "HIDE_SELECTION_UI",
      });
    } catch {
      // Content script might not be ready
    }
  }

  state.inspectModeTabId = null;
  state.inspectModeOptions = DEFAULT_CAPTURE_OPTIONS;
}

/**
 * Inject the in-page selection overlay (cancel button + ESC handler).
 * Tries messaging the existing content script first; if that fails the
 * script hasn't been injected yet, so push the overlay directly via
 * chrome.scripting.
 */
async function injectSelectionUI(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SHOW_SELECTION_UI" });
  } catch {
    // Content script might not be ready, inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showSelectionOverlay,
    });
  }
}

/**
 * Renders the cancel button and wires the ESC handler. Runs in the
 * page's main world (injected via chrome.scripting.executeScript), so
 * it must be self-contained — no closure over background-side state.
 */
function showSelectionOverlay() {
  // Remove existing overlay
  const existing = document.getElementById("w2w-selection-overlay");
  if (existing) existing.remove();

  // Create overlay container
  const overlay = document.createElement("div");
  overlay.id = "w2w-selection-overlay";
  overlay.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      color: white;
      font-size: 14px;
    ">
      <span>Click an element to capture</span>
      <button id="w2w-cancel-btn" style="
        background: #444;
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s;
      ">Cancel (ESC)</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cancel button handler
  const cancelBtn = document.getElementById("w2w-cancel-btn");
  cancelBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CANCEL_SELECTION" });
    overlay.remove();
  });

  // ESC key handler
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      chrome.runtime.sendMessage({ type: "CANCEL_SELECTION" });
      overlay.remove();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}
