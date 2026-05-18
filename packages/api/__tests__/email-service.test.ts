import { describe, it, expect, vi } from "vitest";

// emailService imports `config` from env — mock it so the import is side-effect
// free (the reminder generators don't touch config anyway).
vi.mock("../src/config/env.js", () => ({
  config: { email: { resendApiKey: "", noreplyEmail: "noreply@test" } },
}));

const { generateExpiryReminderHtml, generateExpiryReminderText } = await import(
  "../src/services/emailService.js"
);

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
