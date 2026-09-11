import { API_BASE_URL } from "./apiConfig";
import { authHeader } from "./licenseClient";
import { isAuthExpired } from "./authEvents";
import { httpErrorMessage } from "./httpErrors";
import type { WarningCategory } from "../../types";

/**
 * "Report this to the developer" — the plugin side.
 *
 * Identity travels only as the bearer token: the server derives the user and
 * their reply address (the Figma email on their License) from it. Every
 * failure throws, so the report modal never thanks the user for a report that
 * was lost.
 */
export interface ImportReportPayload {
  sourceUrl: string;
  kind: "url" | "extension";
  viewports: number[];
  /** One entry per distinct issue — never layer names or node ids. */
  issues: { category: WarningCategory; message: string; count: number }[];
  overflow: number;
}

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (isAuthExpired(res)) throw new Error("Reconnecting…");
    throw new Error(httpErrorMessage(res.status));
  }
  return res;
}

/** Send the report; resolves to the id the optional follow-up note threads under. */
export async function sendImportReport(payload: ImportReportPayload): Promise<string> {
  const res = await post("/api/import-report", payload);
  const data = (await res.json()) as { reportId?: unknown };
  if (typeof data.reportId !== "string") {
    throw new Error("The report was not accepted");
  }
  return data.reportId;
}

/** The optional note a user adds after reporting. */
export async function sendImportReportNote(reportId: string, message: string): Promise<void> {
  await post(`/api/import-report/${encodeURIComponent(reportId)}/message`, { message });
}
