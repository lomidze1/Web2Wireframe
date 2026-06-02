/**
 * Auto-reopen the action popup after Chrome closes it mid-capture.
 *
 * Attaching the debugger surfaces the "started debugging this browser" infobar,
 * which steals focus and closes the action popup. There is no event for "popup
 * is allowed to open again", so — like html.to.design — we poll
 * `chrome.action.openPopup()` on a short interval until it succeeds or the
 * window elapses.
 *
 * `chrome.action.openPopup()` resolves once the popup is actually shown and
 * rejects otherwise (no active window yet, or the popup is already open), so a
 * resolved call is our signal to stop polling — that way we don't keep
 * reopening the popup if the user closes it again within the window.
 */

/**
 * Start polling `chrome.action.openPopup()` every 100ms until it succeeds once
 * or `timeoutMs` elapses. Returns a canceller that stops the loop early.
 */
export function openPopupSoon({ timeoutMs }: { timeoutMs: number }): () => void {
  // openPopup is undefined on Chrome < 127 — nothing to poll, so no-op.
  if (typeof chrome.action.openPopup !== "function") {
    return () => undefined;
  }

  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const tick = () => {
    if (cancelled || Date.now() >= deadline) {
      timer = undefined;
      return;
    }
    timer = setTimeout(async () => {
      let opened = false;
      try {
        await chrome.action.openPopup();
        opened = true; // resolved → popup is now showing
      } catch {
        opened = false; // rejected → not yet, or already open
      }
      if (cancelled) return;
      if (opened) {
        timer = undefined; // success — stop polling
        return;
      }
      tick();
    }, 100);
  };
  tick();

  return () => {
    cancelled = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}
