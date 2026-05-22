const AUTH_EXPIRED_EVENT = "w2w:auth-expired";

/**
 * Returns `true` if the given fetch Response is a 401 (auth expired or
 * invalid). Side effect: dispatches a window-level event so ConnectionGate
 * clears the stored token and flips to the disconnected state, which
 * renders ConnectFigma and gives the user a path back in.
 *
 * Mirrors shared/quotaEvents.ts. Pattern at call site:
 *
 *   const res = await fetch("/api/...", { ... });
 *   if (isAuthExpired(res)) return;
 *   if (await isQuotaExceeded(res)) return;
 *   if (!res.ok) { ... other errors ... }
 */
export function isAuthExpired(response: Response): boolean {
  if (response.status !== 401) return false;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  return true;
}

/**
 * Manually dispatch the same auth-expired event a 401 would. Used by recovery
 * UI (e.g. Plan modal's "Reconnect Figma" button shown for a 403 response
 * whose `httpErrorMessage` advises reconnecting but where `isAuthExpired`
 * itself didn't fire). The ConnectionGate handler will clear the stored token
 * and render ConnectFigma — same code path as a real 401.
 */
export function dispatchAuthExpired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

/**
 * Subscribe to auth-expired events. Returns an unsubscribe function.
 */
export function onAuthExpired(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(AUTH_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
}
