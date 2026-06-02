/**
 * Unit tests for `background/utils/report.ts` — submitIssueReport().
 *
 * Both `chrome.storage.local` (read by getSettings) and `globalThis.fetch`
 * are stubbed; no network and no real Chrome runtime. The report POSTs to
 * the existing /web/support endpoint, reusing the support-ticket schema.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { submitIssueReport } from "./report";
import { STORAGE_KEYS } from "../../shared/constants";

function installChromeStorage(settings?: Record<string, unknown>): void {
  const store = new Map<string, unknown>();
  if (settings) store.set(STORAGE_KEYS.SETTINGS, settings);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          const value = store.get(key);
          return value === undefined ? {} : { [key]: value };
        }),
      },
    },
  });
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  installChromeStorage({ backendUrl: "https://api.example.test" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("submitIssueReport", () => {
  it("POSTs to {backendUrl}/web/support with the support-ticket schema", async () => {
    const fetchSpy = mockFetchOnce(200, { success: true });

    await submitIssueReport({
      url: "https://broken.example/page",
      email: "user@example.com",
      description: "Layout is completely broken on capture",
      figmaUserId: "fig-123",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.example.test/web/support");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );

    const sent = JSON.parse(init?.body as string);
    expect(sent.name).toBe("Extension User");
    expect(sent.topic).toBe("Extension capture issue");
    expect(sent.email).toBe("user@example.com");
    expect(sent.figmaUserId).toBe("fig-123");
    // The captured URL and the user's description must both be in the message.
    expect(sent.message).toContain("https://broken.example/page");
    expect(sent.message).toContain("Layout is completely broken on capture");
  });

  it("includes the stats summary line when provided", async () => {
    const fetchSpy = mockFetchOnce(200, { success: true });

    await submitIssueReport({
      url: "https://x.example",
      email: "u@e.com",
      description: "Some images missing in the wireframe",
      statsSummary: "3 image(s) skipped",
    });

    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sent.message).toContain("Capture stats: 3 image(s) skipped");
  });

  it("omits the stats line when no summary is given", async () => {
    const fetchSpy = mockFetchOnce(200, { success: true });

    await submitIssueReport({
      url: "https://x.example",
      email: "u@e.com",
      description: "Wrong fonts everywhere",
    });

    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sent.message).not.toContain("Capture stats:");
  });

  it("falls back to (unknown) when the URL is empty", async () => {
    const fetchSpy = mockFetchOnce(200, { success: true });

    await submitIssueReport({
      url: "",
      email: "u@e.com",
      description: "No URL available for this capture",
    });

    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sent.message).toContain("Captured URL: (unknown)");
  });

  it("throws with the server-provided error on a non-OK response", async () => {
    mockFetchOnce(400, { error: "Please check the highlighted fields." });

    await expect(
      submitIssueReport({
        url: "https://x.example",
        email: "bad",
        description: "short",
      }),
    ).rejects.toThrow("Please check the highlighted fields.");
  });

  it("throws with the HTTP status when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("upstream exploded", { status: 502 }),
    );

    await expect(
      submitIssueReport({
        url: "https://x.example",
        email: "u@e.com",
        description: "Server error path",
      }),
    ).rejects.toThrow("HTTP 502");
  });
});
