import { API_BASE_URL } from "./apiConfig";

/**
 * Subscribe an already-known email to the newsletter Resend Audience.
 *
 * The plugin never asks the user to type an email — it passes the address the
 * backend already has (backfilled from Figma OAuth onto the License doc and
 * surfaced to the UI as `license.email`). The endpoint is public and
 * dedupe-safe (Resend "already in audience" is mapped to success server-side),
 * so repeat clicks are harmless.
 *
 * Throws on any non-2xx response so callers can show an error state.
 */
export async function subscribeNewsletter(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`subscribe_failed_${res.status}`);
}
