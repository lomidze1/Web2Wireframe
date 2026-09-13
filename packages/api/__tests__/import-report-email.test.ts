import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// The import-report emails: they land in the owner's support inbox, Reply-To
// is the user (so answering "fixed!" is one click), and everything the plugin
// sent is escaped — the payload is user-controlled.
// ============================================================================

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    email: {
      resendApiKey: "re_test",
      noreplyEmail: "noreply@test",
      supportToEmail: "support@test",
    },
  },
}));

const {
  sendImportReportEmail,
  sendImportReportFollowUp,
  __setRetryDelaysForTests,
} = await import("../src/services/emailService.js");

let restoreDelays: () => void;

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  restoreDelays = __setRetryDelaysForTests([0, 0]);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  restoreDelays();
  vi.restoreAllMocks();
});

function reportData(overrides: Record<string, unknown> = {}) {
  return {
    reportId: "REPORT-MF0ABC12-X7Y8Z9",
    figmaUserId: "1082972835952103170",
    email: "user@figma.test" as string | null,
    sourceUrl: "https://stripe.com/",
    kind: "url" as const,
    viewports: [1440, 375],
    issues: [
      { category: "image", message: "Image couldn't be loaded — replaced with a placeholder", count: 7 },
      { category: "layout", message: "Hidden at capture time (opacity: 0) — skipped", count: 9 },
    ],
    overflow: 0,
    ...overrides,
  };
}

const sent = () => mockSend.mock.calls[0][0] as Record<string, string>;

describe("sendImportReportEmail", () => {
  it("goes to the support inbox, from noreply, replying to the user", async () => {
    const result = await sendImportReportEmail(reportData());
    expect(result).toEqual({ ok: true });
    expect(sent().to).toBe("support@test");
    expect(sent().from).toBe("noreply@test");
    expect(sent().replyTo).toBe("user@figma.test");
  });

  it("names the site, the issue count and the import kind in the subject", async () => {
    await sendImportReportEmail(reportData());
    expect(sent().subject).toBe("[Import report] stripe.com — 2 issues (url)");
  });

  it("singularises a lone issue", async () => {
    await sendImportReportEmail(reportData({ issues: [reportData().issues[0]], kind: "extension" }));
    expect(sent().subject).toBe("[Import report] stripe.com — 1 issue (extension)");
  });

  it("lists every issue with its layer count, the URL and the report id", async () => {
    await sendImportReportEmail(reportData());
    for (const body of [sent().html, sent().text]) {
      expect(body).toContain("https://stripe.com/");
      expect(body).toContain("REPORT-MF0ABC12-X7Y8Z9");
      expect(body).toContain("1082972835952103170");
      expect(body).toContain("1440, 375");
      expect(body).toContain("9");
      expect(body).toContain("7");
    }
    expect(sent().text).toContain("Hidden at capture time (opacity: 0) — skipped");
  });

  it("says so — and sets no Reply-To — when there is no email on file", async () => {
    await sendImportReportEmail(reportData({ email: null }));
    expect(sent().replyTo).toBeUndefined();
    expect(sent().text).toMatch(/no email on file/i);
  });

  it("escapes everything the plugin sent", async () => {
    await sendImportReportEmail(
      reportData({
        sourceUrl: "https://x.com/?q=<b>hi</b>",
        issues: [{ category: "other", message: "<script>alert(1)</script>", count: 1 }],
      }),
    );
    expect(sent().html).not.toContain("<script>");
    expect(sent().html).not.toContain("<b>hi</b>");
    expect(sent().html).toContain("&lt;script&gt;");
  });

  it("reports failure after the retries run out", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "resend down" } });
    const result = await sendImportReportEmail(reportData());
    expect(result.ok).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});

describe("sendImportReportFollowUp", () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    reportId: "REPORT-MF0ABC12-X7Y8Z9",
    figmaUserId: "1082972835952103170",
    email: "user@figma.test" as string | null,
    message: "The logo is missing in the header",
    ...overrides,
  });

  it("threads under the report id and replies to the user", async () => {
    const result = await sendImportReportFollowUp(note());
    expect(result).toEqual({ ok: true });
    expect(sent().to).toBe("support@test");
    expect(sent().replyTo).toBe("user@figma.test");
    expect(sent().subject).toBe("[Import report REPORT-MF0ABC12-X7Y8Z9] Follow-up note");
    expect(sent().text).toContain("The logo is missing in the header");
  });

  it("escapes the note", async () => {
    await sendImportReportFollowUp(note({ message: "<img src=x onerror=alert(1)>" }));
    expect(sent().html).not.toContain("<img src=x");
    expect(sent().html).toContain("&lt;img");
  });

  it("sets no Reply-To when there is no email on file", async () => {
    await sendImportReportFollowUp(note({ email: null }));
    expect(sent().replyTo).toBeUndefined();
  });
});
