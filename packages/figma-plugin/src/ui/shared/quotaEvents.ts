const QUOTA_EXCEEDED_EVENT = "w2w:quota-exceeded";

/**
 * Returns `true` if the given fetch Response is a 403 limit_exceeded
 * (the backend's signal that the user is over their monthly quota).
 * Side effect: dispatches a window-level event so the App-level
 * QuotaExceededModal listener picks it up.
 *
 * Pattern at call site:
 *
 *   const res = await fetch("/api/import-...", { ... });
 *   if (await isQuotaExceeded(res)) return;
 *   if (!res.ok) { ... handle other errors ... }
 */
export async function isQuotaExceeded(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  let body: { error?: string } = {};
  try {
    body = (await response.clone().json()) as { error?: string };
  } catch {
    return false;
  }
  if (body.error !== "limit_exceeded") return false;
  window.dispatchEvent(new CustomEvent(QUOTA_EXCEEDED_EVENT));
  return true;
}

/**
 * Subscribe to quota-exceeded events. Returns an unsubscribe function.
 */
export function onQuotaExceeded(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(QUOTA_EXCEEDED_EVENT, listener);
  return () => window.removeEventListener(QUOTA_EXCEEDED_EVENT, listener);
}
