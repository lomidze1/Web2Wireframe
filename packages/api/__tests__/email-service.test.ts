import { describe, it, expect, vi } from "vitest";

// emailService imports `config` from env — mock it so the import is side-effect
// free (the reminder generators don't touch config anyway).
vi.mock("../src/config/env.js", () => ({
  config: { email: { resendApiKey: "", noreplyEmail: "noreply@test" } },
}));

const {
  generateExpiryReminderHtml,
  generateExpiryReminderText,
  generateSupportEmailHtml,
} = await import("../src/services/emailService.js");

const data = {
  email: "user@example.com",
  expiresAt: "2026-06-15",
  renewUrl: "https://web2wireframe.test/renew?uid=u-1",
};

describe("generateExpiryReminderHtml", () => {
  it("includes the expiry date, the renew link, and the word 'expire'", () => {
    const html = generateExpiryReminderHtml(data);
    expect(html).toContain("2026-06-15");
    expect(html).toContain("https://web2wireframe.test/renew?uid=u-1");
    expect(html.toLowerCase()).toContain("expire");
  });

  it("does NOT use subscription / auto-renew language", () => {
    const html = generateExpiryReminderHtml(data).toLowerCase();
    expect(html).not.toContain("auto-renew");
    expect(html).not.toContain("subscription");
  });
});

describe("generateExpiryReminderText", () => {
  it("is plain text with the expiry date and renew link", () => {
    const text = generateExpiryReminderText(data);
    expect(text).toContain("2026-06-15");
    expect(text).toContain("https://web2wireframe.test/renew?uid=u-1");
    expect(text.toLowerCase()).toContain("expire");
    expect(text).not.toContain("<");
  });
});

describe("generateSupportEmailHtml — HTML injection (M1)", () => {
  const base = {
    name: "Jane Doe",
    email: "jane@example.com",
    topic: "Billing question",
    message: "Hello there",
    plan: "free",
    planVerified: true,
    timestamp: "2026-05-18T10:00:00Z",
    ipAddress: "1.2.3.4",
  };

  it("escapes a <script> payload in the topic field", () => {
    const html = generateSupportEmailHtml({
      ...base,
      topic: "<script>alert('xss')</script>",
    });
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the name field", () => {
    const html = generateSupportEmailHtml({
      ...base,
      name: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });
});
