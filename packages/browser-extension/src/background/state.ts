/**
 * Cross-handler mutable state for the background service worker.
 *
 * The service-worker JS context is a single isolate, so a plain module-
 * scoped binding works fine — but exporting it from a dedicated file
 * keeps the entry (`index.ts`) free of state plumbing and lets each
 * handler import only what it touches.
 *
 * Service workers are *not* persistent: Chrome can recycle this isolate
 * at any time when no message is in flight. Anything that must survive
 * a recycle belongs in `chrome.storage`, not here.
 */

import type { CDPClient } from "./cdp/client";
import type { CaptureOptions } from "@w2w/shared";
import { DEFAULT_CAPTURE_OPTIONS } from "@w2w/shared";

interface BackgroundState {
  isCapturing: boolean;
  /** 0–100 progress for the in-flight capture. */
  captureProgress: number;
  /** CDP client backing the in-page element picker; null when not active. */
  inspectModeClient: CDPClient | null;
  inspectModeTabId: number | null;
  inspectModeOptions: CaptureOptions;
}

export const state: BackgroundState = {
  isCapturing: false,
  captureProgress: 0,
  inspectModeClient: null,
  inspectModeTabId: null,
  inspectModeOptions: DEFAULT_CAPTURE_OPTIONS,
};

/**
 * Push a progress update to the popup. Failures are swallowed because
 * the popup may have closed mid-capture, and a missing receiver is the
 * expected steady state once the user navigates away.
 */
export function updateProgress(progress: number, status: string): void {
  state.captureProgress = progress;
  chrome.runtime
    .sendMessage({
      type: "CAPTURE_PROGRESS",
      progress,
      status,
    })
    .catch(() => undefined);
}
