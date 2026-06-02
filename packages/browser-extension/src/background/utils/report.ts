import { getSettings } from "./settings";

export interface IssueReportPayload {
  url: string;
  email: string;
  description: string;
  figmaUserId?: string;
  statsSummary?: string;
}

/**
 * Send a user-submitted problem report to the existing /web/support endpoint.
 *
 * Must run in the service worker (NOT the popup): the website CORS allowlist
 * rejects chrome-extension:// origins, but the SW sends no Origin header and
 * therefore passes the `!origin` branch of the website CORS check. We reuse
 * the support ticket schema (name/email/topic/message + optional figmaUserId).
 */
export async function submitIssueReport(
  payload: IssueReportPayload,
): Promise<void> {
  const settings = await getSettings();
  const message =
    `Reported problem:\n${payload.description}\n\n` +
    `Captured URL: ${payload.url || "(unknown)"}` +
    (payload.statsSummary ? `\n\nCapture stats: ${payload.statsSummary}` : "");

  const response = await fetch(`${settings.backendUrl}/web/support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Extension User",
      email: payload.email,
      topic: "Extension capture issue",
      message,
      figmaUserId: payload.figmaUserId,
    }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      // Non-JSON error body — keep the HTTP status as the detail.
    }
    throw new Error(detail);
  }
}
