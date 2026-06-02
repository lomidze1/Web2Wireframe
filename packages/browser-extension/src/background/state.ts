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
import type { PersistedCaptureState } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/constants";

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
 * Persist the capture lifecycle to chrome.storage.session (or clear it with
 * null). Chrome closes the action popup mid-capture, so this is the durable
 * source the popup restores from when reopened. A failed write just means the
 * popup falls back to idle. Returns the write promise (already error-swallowed)
 * so callers that reopen the popup can await the persisted state first,
 * avoiding a race where the popup reads stale storage on open.
 */
export function setCaptureState(s: PersistedCaptureState | null): Promise<void> {
  const op = s
    ? chrome.storage.session.set({ [STORAGE_KEYS.LAST_CAPTURE]: s })
    : chrome.storage.session.remove(STORAGE_KEYS.LAST_CAPTURE);
  return op.catch(() => undefined);
}

/**
 * Push a progress update to the popup. Failures are swallowed because
 * the popup may have closed mid-capture, and a missing receiver is the
 * expected steady state once the user navigates away. Also mirrored to
 * session storage so a reopened popup picks up live progress.
 */
export function updateProgress(progress: number, status: string): void {
  state.captureProgress = progress;
  setCaptureState({ status: "capturing", progress, message: status });
  chrome.runtime
    .sendMessage({
      type: "CAPTURE_PROGRESS",
      progress,
      status,
    })
    .catch(() => undefined);
}
