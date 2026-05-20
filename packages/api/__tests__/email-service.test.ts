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

// ============================================================================
// Refund notification (B2)
// ============================================================================

const {
  generateRefundNotificationHtml,
  generateRefundNotificationText,
} = await import("../src/services/emailService.js");

describe("generateRefundNotificationHtml", () => {
  it("mentions refund + Free plan + contact email", () => {
    const html = generateRefundNotificationHtml({ email: "u@x.com" });
    expect(html.toLowerCase()).toContain("refund");
    expect(html).toContain("Free plan");
    expect(html).toContain("billing@web2wireframe.design");
  });

  it("escapes the user's email when rendering HTML", () => {
    const html = generateRefundNotificationHtml({
      email: "<script>alert(1)</script>@evil.com",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("generateRefundNotificationText", () => {
  it("is plain text (no HTML tags) with email mention", () => {
    const text = generateRefundNotificationText({ email: "u@x.com" });
    expect(text).not.toContain("<");
    expect(text).toContain("u@x.com");
  });
});

// ============================================================================
// Payment-failed notification (B9)
// ============================================================================

const {
  generatePaymentFailedHtml,
  generatePaymentFailedText,
} = await import("../src/services/emailService.js");

describe("generatePaymentFailedHtml", () => {
  const data = {
    email: "u@x.com",
    renewUrl: "https://web2wireframe.test/renew?uid=u-1",
  };

  it("includes the retry link as a CTA", () => {
    const html = generatePaymentFailedHtml(data);
    expect(html).toContain("https://web2wireframe.test/renew?uid=u-1");
    expect(html.toLowerCase()).toMatch(/retry|try again/);
  });

  it("explains common decline causes", () => {
    const html = generatePaymentFailedHtml(data).toLowerCase();
    expect(html).toMatch(/bank|fraud|3d secure/);
  });

  it("escapes the renewUrl when rendering", () => {
    const html = generatePaymentFailedHtml({
      email: "u@x.com",
      renewUrl: "https://x.com/?q=<script>x</script>",
    });
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("generatePaymentFailedText", () => {
  it("includes the retry URL on its own line (terminal-friendly)", () => {
    const text = generatePaymentFailedText({
      email: "u@x.com",
      renewUrl: "https://web2wireframe.test/renew?uid=u-1",
    });
    expect(text).toContain("https://web2wireframe.test/renew?uid=u-1");
    expect(text).not.toContain("<");
  });
});

// ============================================================================
// Receipt email (C3)
// ============================================================================

const {
  generateReceiptHtml,
  generateReceiptText,
} = await import("../src/services/emailService.js");

describe("generateReceiptHtml", () => {
  const receiptData = {
    email: "u@x.com",
    amountCents: 1600,
    currency: "USD",
    orderId: "w2w_pro_u-1_1715000000000",
    paymentId: null as string | null,
    purchasedAt: new Date("2026-05-20T10:00:00Z"),
    proExpiresAt: new Date("2026-06-19T10:00:00Z"),
  };

  it("renders the price as dollars with two decimals", () => {
    const html = generateReceiptHtml(receiptData);
    expect(html).toContain("$16.00");
  });

  it("includes the orderId, currency, and statement hint", () => {
    const html = generateReceiptHtml(receiptData);
    expect(html).toContain("w2w_pro_u-1_1715000000000");
    expect(html).toContain("USD");
    expect(html).toContain("FLITT*WEB2WIREFRAME");
  });

  it("renders both dates in long form (no raw ISO)", () => {
    const html = generateReceiptHtml(receiptData);
    expect(html).toMatch(/May (19|20),? 2026/);
    expect(html).toMatch(/June (18|19),? 2026/);
    // No raw ISO timestamps surfaced to the customer.
    expect(html).not.toContain("2026-05-20T10:00:00.000Z");
  });

  it("escapes the orderId in case Flitt ever returns HTML-y content", () => {
    const html = generateReceiptHtml({
      ...receiptData,
      orderId: "w2w_pro<script>x</script>",
    });
    expect(html).not.toContain("<script>x</script>");
  });

  it("reassures: no auto-renewal", () => {
    const html = generateReceiptHtml(receiptData).toLowerCase();
    expect(html).toMatch(/no auto-renewal|only be charged again/);
  });

  it("includes the Flitt payment_id when provided (support lookup hint)", () => {
    const html = generateReceiptHtml({
      ...receiptData,
      paymentId: "pay_flitt_98765",
    });
    expect(html).toContain("pay_flitt_98765");
    expect(html).toContain("Payment ID");
    expect(html).toMatch(/quote Payment ID/i);
  });

  it("omits the Payment ID row entirely when paymentId is null", () => {
    const html = generateReceiptHtml({ ...receiptData, paymentId: null });
    expect(html).not.toContain("Payment ID");
    expect(html).not.toMatch(/quote Payment ID/i);
  });

  it("escapes a malicious payment_id (defense-in-depth)", () => {
    const html = generateReceiptHtml({
      ...receiptData,
      paymentId: "<script>x</script>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});

describe("generateReceiptText", () => {
  it("plain text, $X.XX format, no HTML", () => {
    const text = generateReceiptText({
      email: "u@x.com",
      amountCents: 1600,
      currency: "USD",
      orderId: "ord_1",
      paymentId: null,
      purchasedAt: new Date("2026-05-20T10:00:00Z"),
      proExpiresAt: new Date("2026-06-19T10:00:00Z"),
    });
    expect(text).toContain("$16.00");
    expect(text).toContain("USD");
    expect(text).toContain("ord_1");
    expect(text).not.toContain("<");
  });

  it("renders Payment ID as its own row when provided", () => {
    const text = generateReceiptText({
      email: "u@x.com",
      amountCents: 1600,
      currency: "USD",
      orderId: "ord_3",
      paymentId: "pay_flitt_42",
      purchasedAt: new Date("2026-05-20T10:00:00Z"),
      proExpiresAt: new Date("2026-06-19T10:00:00Z"),
    });
    expect(text).toContain("Payment ID:");
    expect(text).toContain("pay_flitt_42");
  });

  it("formats amounts other than $16 correctly", () => {
    const text = generateReceiptText({
      email: "u@x.com",
      amountCents: 12345,
      currency: "USD",
      orderId: "ord_2",
      paymentId: null,
      purchasedAt: new Date("2026-05-20T10:00:00Z"),
      proExpiresAt: new Date("2026-06-19T10:00:00Z"),
    });
    expect(text).toContain("$123.45");
  });
});
