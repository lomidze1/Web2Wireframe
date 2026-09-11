/**
 * importReportClient — the plugin side of "Report this to the developer".
 *
 * Identity travels only as the bearer token (the server derives the user and
 * their reply address from it), and every failure throws, so the report modal
 * can never say "Thanks — we read every report" for a report that was lost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../ui/shared/licenseClient", () => ({
  authHeader: () => "Bearer test-token",
}));

import { sendImportReport, sendImportReportNote } from "../ui/shared/importReportClient";
import { API_BASE_URL } from "../ui/shared/apiConfig";

const PAYLOAD = {
  sourceUrl: "https://stripe.com/",
  kind: "url" as const,
  viewports: [1440],
  issues: [
    {
      category: "image" as const,
      message: "Image couldn't be loaded — replaced with a placeholder",
      count: 7,
    },
  ],
  overflow: 0,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("sendImportReport", () => {
  it("POSTs the report with the bearer token and returns the report id", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, reportId: "REPORT-A1-B2" }));

    await expect(sendImportReport(PAYLOAD)).resolves.toBe("REPORT-A1-B2");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/import-report`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
  });

  it("throws when the server could not send it", async () => {
    fetchMock.mockResolvedValue(json(502, { success: false, error: "send_failed" }));
    await expect(sendImportReport(PAYLOAD)).rejects.toThrow();
  });

  it("throws when a 200 carries no report id", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));
    await expect(sendImportReport(PAYLOAD)).rejects.toThrow();
  });

  it("throws on a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(sendImportReport(PAYLOAD)).rejects.toThrow();
  });
});

describe("sendImportReportNote", () => {
  it("POSTs the note under the report id", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));

    await sendImportReportNote("REPORT-A1-B2", "The logo is missing");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/import-report/REPORT-A1-B2/message`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({ message: "The logo is missing" });
  });

  it("throws when the note could not be sent", async () => {
    fetchMock.mockResolvedValue(json(502, { success: false }));
    await expect(sendImportReportNote("REPORT-A1-B2", "x")).rejects.toThrow();
  });
});
