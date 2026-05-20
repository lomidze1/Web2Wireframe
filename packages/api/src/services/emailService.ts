import { Resend } from "resend";
import { config } from "../config/env.js";
import type { EmailPayload } from "../config/website-types.js";

// Lazy init — avoid crash when RESEND_API_KEY is not set (e.g., in tests)
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(config.email.resendApiKey || "re_placeholder");
  }
  return resend;
}

/**
 * Configurable delay schedule used by `sendWithRetry`. Exposed for tests so
 * a long retry chain doesn't add real wall-clock seconds to the suite.
 */
let retryDelaysMs = [200, 800];

/** Test hook — restore defaults afterward. */
export function __setRetryDelaysForTests(delays: number[]): () => void {
  const prev = retryDelaysMs;
  retryDelaysMs = delays;
  return () => {
    retryDelaysMs = prev;
  };
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send a Resend email with bounded exponential-backoff retry. Webhook handlers
 * `await` these — the total budget (defaults `200ms + 800ms = 1s`) is chosen
 * so a single transient Resend blip can be absorbed without pushing the
 * webhook response over Flitt's ~5s timeout.
 *
 * Resend errors and thrown errors are both treated as transient; we don't
 * have a clean way to classify "permanent" failures (invalid email, etc.)
 * from the response shape, and retrying a permanent failure costs us ~1s
 * — cheap compared to silently losing a customer-facing receipt.
 *
 * Returns `{ ok: true }` on success, `{ ok: false, error }` after exhausting
 * retries. Best-effort callers ignore the return; this helper never throws.
 */
async function sendWithRetry(
  label: string,
  send: () => Promise<{ error?: { message?: string } | null }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const attempts = retryDelaysMs.length + 1;
  let lastError = "unknown";
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await send();
      if (!result.error) {
        if (i > 0) {
          console.info(`[Email/${label}] succeeded on attempt ${i + 1}`);
        }
        return { ok: true };
      }
      lastError = result.error.message || JSON.stringify(result.error);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (i < retryDelaysMs.length) {
      console.warn(
        `[Email/${label}] attempt ${i + 1} failed: ${lastError} — retrying in ${retryDelaysMs[i]}ms`,
      );
      await delay(retryDelaysMs[i]);
    }
  }
  console.error(
    `[Email/${label}] all ${attempts} attempts failed: ${lastError}`,
  );
  return { ok: false, error: lastError };
}

export const sendSupportEmail = async (payload: EmailPayload) => {
  try {
    const result = await getResend().emails.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.replyTo && { replyTo: payload.replyTo }),
    });

    if (result.error) {
      throw new Error(
        `Resend error: ${result.error.message || JSON.stringify(result.error)}`
      );
    }

    return { success: true, emailId: result.data?.id };
  } catch (error) {
    console.error("[Email] Failed to send support email:", error);
    throw error;
  }
};

export const generateSupportEmailHtml = (data: {
  name: string;
  email: string;
  topic: string;
  message: string;
  plan: string;
  planVerified: boolean;
  figmaUserId?: string;
  timestamp: string;
  ipAddress: string;
}): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px; }
        .header h2 { margin: 0; color: #0c0d12; }
        .section { margin-bottom: 20px; }
        .section-label { font-weight: 700; color: #0c0d12; text-transform: uppercase; font-size: 0.85rem; margin-bottom: 8px; }
        .field { margin-bottom: 15px; }
        .field-label { font-weight: 600; color: #5a6072; font-size: 0.9rem; }
        .field-value { margin-top: 4px; color: #0c0d12; padding: 8px 12px; background: #fff; border-left: 3px solid #3b82f6; border-radius: 4px; }
        .message-box { background: #fff; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb; white-space: pre-wrap; word-wrap: break-word; }
        .meta { background: #f0f4f8; padding: 12px; border-radius: 6px; font-size: 0.85rem; color: #5a6072; margin-top: 15px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
        .badge-verified { background: #d1fae5; color: #065f46; }
        .badge-unverified { background: #fee2e2; color: #991b1b; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #5a6072; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>[Support Ticket] ${escapeHtml(data.topic)}</h2>
          <p style="margin: 8px 0 0 0; color: #5a6072;">From: <strong>${escapeHtml(
            data.name,
          )}</strong></p>
        </div>

        <div class="section">
          <div class="section-label">Customer Information</div>
          <div class="field">
            <div class="field-label">Name</div>
            <div class="field-value">${escapeHtml(data.name)}</div>
          </div>
          <div class="field">
            <div class="field-label">Email</div>
            <div class="field-value">
              <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(
    data.email
  )}</a>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-label">Plan Information</div>
          <div class="field">
            <div class="field-label">Subscription Tier</div>
            <div class="field-value">
              <strong>${data.plan}</strong>
              <span class="badge ${
                data.planVerified ? "badge-verified" : "badge-unverified"
              }" style="margin-left: 8px;">
                ${data.planVerified ? "✓ Verified" : "⚠ Unverified"}
              </span>
            </div>
          </div>
          ${
            data.figmaUserId
              ? `<div class="field">
            <div class="field-label">Figma User ID</div>
            <div class="field-value">${escapeHtml(data.figmaUserId)}</div>
          </div>`
              : ""
          }
        </div>

        <div class="section">
          <div class="section-label">Topic</div>
          <div class="field-value">${escapeHtml(data.topic)}</div>
        </div>

        <div class="section">
          <div class="section-label">Message</div>
          <div class="message-box">${escapeHtml(data.message)}</div>
        </div>

        <div class="meta">
          <div><strong>Timestamp:</strong> ${data.timestamp}</div>
          <div><strong>IP Address:</strong> ${data.ipAddress}</div>
        </div>

        <div class="footer">
          <p>This is an automated support ticket. Do not reply to this email directly. Use the Web2Wireframe dashboard to respond to the customer.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateSupportEmailText = (data: {
  name: string;
  email: string;
  topic: string;
  message: string;
  plan: string;
  planVerified: boolean;
  figmaUserId?: string;
  timestamp: string;
  ipAddress: string;
}): string => {
  return `
SUPPORT TICKET: ${data.topic}

FROM: ${data.name} <${data.email}>

CUSTOMER INFORMATION
--------------------
Name: ${data.name}
Email: ${data.email}

PLAN INFORMATION
----------------
Subscription Tier: ${data.plan} (${
    data.planVerified ? "Verified" : "Unverified"
  })
${data.figmaUserId ? `Figma User ID: ${data.figmaUserId}` : ""}

TOPIC
-----
${data.topic}

MESSAGE
-------
${data.message}

METADATA
--------
Timestamp: ${data.timestamp}
IP Address: ${data.ipAddress}
`;
};

export const generateCustomerConfirmationHtml = (data: {
  name: string;
  topic: string;
  ticketId: string;
  plan: string;
  planVerified: boolean;
}): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 16px; }
        .header h2 { margin: 0; color: #0c0d12; }
        .ticket { font-size: 1.05rem; font-weight: 700; color: #0c0d12; padding: 8px 12px; background: #fff; border-radius: 6px; border: 1px solid #e5e7eb; display: inline-block; }
        .meta { margin-top: 12px; color: #5a6072; font-size: 0.95rem; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #5a6072; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>We received your support request</h2>
          <p style="margin: 6px 0 0 0; color: #5a6072;">Hi ${
            data.name
          }, thanks for reaching out.</p>
        </div>

        <p><strong>Topic:</strong> ${escapeHtml(data.topic)}</p>
        <p class="meta">We usually reply within 1–2 business days.</p>

        <p><strong>Ticket ID:</strong></p>
        <div class="ticket">${escapeHtml(data.ticketId)}</div>
        <p class="meta">Keep this Ticket ID for follow-ups.</p>

        <p class="meta">
          Detected plan: ${escapeHtml(data.plan)} (${
    data.planVerified ? "verified" : "unverified"
  })
        </p>

        <div class="footer">
          <p>If you need to update your request, reply to this email or contact support with your Ticket ID.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateCustomerConfirmationText = (data: {
  name: string;
  topic: string;
  ticketId: string;
  plan: string;
  planVerified: boolean;
}): string => {
  return `
Hi ${data.name},

We received your support request.

Topic: ${data.topic}
We usually reply within 1–2 business days.

Ticket ID: ${data.ticketId}
Keep this Ticket ID for follow-ups.

Detected plan: ${data.plan} (${data.planVerified ? "verified" : "unverified"})
`;
};

export const generateExpiryReminderHtml = (data: {
  email: string;
  expiresAt: string;
  renewUrl: string;
}): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 16px; }
        .header h2 { margin: 0; color: #0c0d12; }
        .cta { display: inline-block; margin: 16px 0; padding: 12px 24px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .meta { margin-top: 12px; color: #5a6072; font-size: 0.95rem; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #5a6072; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Your Web2Wireframe Pro access is about to expire</h2>
        </div>
        <p>Your Pro access ends on <strong>${escapeHtml(
          data.expiresAt,
        )}</strong>. After that your account returns to the Free plan (10 imports per month).</p>
        <p>Renew for $16 to keep unlimited imports for another 30 days.</p>
        <p><a class="cta" href="${escapeHtml(data.renewUrl)}">Renew Pro — $16</a></p>
        <p class="meta">One-time payment — you're only charged when you choose to renew.</p>
        <div class="footer">
          <p>You're receiving this because Pro access is linked to ${escapeHtml(
            data.email,
          )}. If you didn't expect this email, you can ignore it.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateExpiryReminderText = (data: {
  email: string;
  expiresAt: string;
  renewUrl: string;
}): string => {
  return `
Your Web2Wireframe Pro access is about to expire.

Your Pro access ends on ${data.expiresAt}. After that your account returns to the Free plan (10 imports per month).

Renew for $16 to keep unlimited imports for another 30 days:
${data.renewUrl}

One-time payment — you're only charged when you choose to renew.

You're receiving this because Pro access is linked to ${data.email}.
`;
};

/**
 * Send a receipt for a successful Pro purchase. Sent from the Flitt webhook
 * handler when `order_status="approved"` AND a sender_email was collected.
 * Best-effort — failures are logged, never thrown.
 *
 * The receipt doubles as a record-keeping artifact for the customer (no
 * formal invoice yet — see billing-faq.md Q5) and an "expect this charge
 * on your statement" confirmation that reduces dispute risk.
 */
export const sendReceiptEmail = async (params: {
  email: string;
  amountCents: number;
  currency: string;
  orderId: string;
  paymentId: string | null;
  purchasedAt: Date;
  proExpiresAt: Date;
}): Promise<void> => {
  await sendWithRetry("receipt", () =>
    getResend().emails.send({
      from: config.email.noreplyEmail,
      to: params.email,
      subject: `Receipt for your Web2Wireframe Pro purchase ($${formatAmount(params.amountCents)})`,
      html: generateReceiptHtml(params),
      text: generateReceiptText(params),
    }),
  );
};

function formatAmount(cents: number): string {
  const dollars = cents / 100;
  return dollars.toFixed(2);
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const generateReceiptHtml = (data: {
  email: string;
  amountCents: number;
  currency: string;
  orderId: string;
  paymentId: string | null;
  purchasedAt: Date;
  proExpiresAt: Date;
}): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 16px; }
        .header h2 { margin: 0; color: #0c0d12; }
        .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .receipt-row:last-child { border-bottom: none; }
        .receipt-label { color: #5a6072; }
        .receipt-value { color: #0c0d12; font-weight: 600; }
        .receipt-total { padding: 12px 0; margin-top: 8px; border-top: 2px solid #0c0d12; font-size: 1.1rem; }
        .meta { margin-top: 16px; color: #5a6072; font-size: 0.9rem; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #5a6072; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Thanks for your purchase!</h2>
          <p style="margin: 6px 0 0 0; color: #5a6072;">Your Web2Wireframe Pro is active. Here's your receipt.</p>
        </div>

        <div class="receipt-row">
          <span class="receipt-label">Product</span>
          <span class="receipt-value">Web2Wireframe Pro · 30 days</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Order ID</span>
          <span class="receipt-value">${escapeHtml(data.orderId)}</span>
        </div>
        ${
          data.paymentId
            ? `<div class="receipt-row">
          <span class="receipt-label">Payment ID</span>
          <span class="receipt-value">${escapeHtml(data.paymentId)}</span>
        </div>`
            : ""
        }
        <div class="receipt-row">
          <span class="receipt-label">Purchased</span>
          <span class="receipt-value">${formatDateLong(data.purchasedAt)}</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Pro access until</span>
          <span class="receipt-value">${formatDateLong(data.proExpiresAt)}</span>
        </div>
        <div class="receipt-row receipt-total">
          <span class="receipt-label">Total charged</span>
          <span class="receipt-value">$${escapeHtml(formatAmount(data.amountCents))} ${escapeHtml(data.currency)}</span>
        </div>

        <p class="meta">Your card statement will show "FLITT*WEB2WIREFRAME" or similar. Payments processed by Flitt (PCI-DSS Level 1).</p>

        <p class="meta">No auto-renewal — you'll only be charged again if you decide to buy more days from the plugin.</p>

        <div class="footer">
          <p>Need a formal invoice with your business details? Reply to this email with your business name + tax ID.</p>
          <p>Questions? <a href="mailto:billing@web2wireframe.design">billing@web2wireframe.design</a>${
            data.paymentId
              ? ` — quote Payment ID <strong>${escapeHtml(data.paymentId)}</strong> for fastest lookup.`
              : ""
          }</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateReceiptText = (data: {
  email: string;
  amountCents: number;
  currency: string;
  orderId: string;
  paymentId: string | null;
  purchasedAt: Date;
  proExpiresAt: Date;
}): string => {
  return `
Thanks for your purchase!

Your Web2Wireframe Pro is active. Here's your receipt.

Product:           Web2Wireframe Pro · 30 days
Order ID:          ${data.orderId}${
    data.paymentId ? `\nPayment ID:        ${data.paymentId}` : ""
  }
Purchased:         ${formatDateLong(data.purchasedAt)}
Pro access until:  ${formatDateLong(data.proExpiresAt)}
Total charged:     $${formatAmount(data.amountCents)} ${data.currency}

Your card statement will show "FLITT*WEB2WIREFRAME" or similar. Payments processed by Flitt (PCI-DSS Level 1).

No auto-renewal — you'll only be charged again if you decide to buy more days from the plugin.

Need a formal invoice with your business details? Reply to this email with your business name + tax ID.

Questions? billing@web2wireframe.design${
    data.paymentId ? ` — quote Payment ID ${data.paymentId} for fastest lookup.` : ""
  }
`;
};

/**
 * Notify a user that their card was declined / expired during checkout.
 * Sent from the Flitt webhook handler when order_status is "declined" or
 * "expired" AND sender_email is present in the payload (Flitt collects it
 * on the checkout form). Best-effort — errors are logged, never thrown.
 *
 * The renewUrl points to /renew?uid=<figmaUserId>, which auto-creates a
 * fresh Flitt checkout, so the user can retry with one click.
 */
export const sendPaymentFailedNotification = async (params: {
  email: string;
  figmaUserId: string;
}): Promise<void> => {
  const renewUrl = buildRenewUrl(params.figmaUserId);
  await sendWithRetry("payment-failed", () =>
    getResend().emails.send({
      from: config.email.noreplyEmail,
      to: params.email,
      subject: "Your Web2Wireframe payment didn't go through",
      html: generatePaymentFailedHtml({ email: params.email, renewUrl }),
      text: generatePaymentFailedText({ email: params.email, renewUrl }),
    }),
  );
};

export const generatePaymentFailedHtml = (data: {
  email: string;
  renewUrl: string;
}): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 16px; }
        .header h2 { margin: 0; color: #0c0d12; }
        .cta { display: inline-block; margin: 16px 0; padding: 12px 24px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .meta { margin-top: 12px; color: #5a6072; font-size: 0.95rem; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #5a6072; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Your payment didn't go through</h2>
        </div>
        <p>Your recent attempt to purchase Web2Wireframe Pro was declined by your bank or expired before completion. No charge was made.</p>
        <p>Common causes:</p>
        <ul>
          <li>Your bank's fraud filter blocked an international charge — call them to approve "FLITT" or "web2wireframe.design"</li>
          <li>Insufficient funds, or expired card</li>
          <li>The 3D Secure (3-D Secure) challenge timed out</li>
        </ul>
        <p>You can try again with one click:</p>
        <p><a class="cta" href="${escapeHtml(data.renewUrl)}">Retry payment — $16</a></p>
        <p class="meta">If you keep hitting issues, reply to this email or contact <a href="mailto:billing@web2wireframe.design">billing@web2wireframe.design</a>.</p>
        <div class="footer">
          <p>You're receiving this because this email was entered on the checkout page (${escapeHtml(
            data.email,
          )}).</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generatePaymentFailedText = (data: {
  email: string;
  renewUrl: string;
}): string => {
  return `
Your Web2Wireframe payment didn't go through.

Your recent attempt to purchase Pro was declined by your bank or expired before completion. No charge was made.

Common causes:
- Your bank's fraud filter blocked an international charge (call them to approve "FLITT" or "web2wireframe.design")
- Insufficient funds, or expired card
- The 3D Secure challenge timed out

Retry payment ($16):
${data.renewUrl}

If you keep hitting issues, reply to this email or contact billing@web2wireframe.design.

You're receiving this because this email was entered on the checkout page (${data.email}).
`;
};

function buildRenewUrl(figmaUserId: string): string {
  const base =
    process.env.WEBSITE_BASE_URL ?? "https://www.web2wireframe.design";
  // Trim trailing slash to keep the URL canonical.
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/renew?uid=${encodeURIComponent(figmaUserId)}`;
}

/**
 * Notify a user that their Pro purchase was refunded / reversed. Sent from
 * the Flitt webhook handler when `order_status="reversed"` revokes access.
 * Best-effort — failures are logged, never thrown back to the webhook
 * (which must always 200 to avoid Flitt's retry storm).
 */
export const sendRefundNotification = async (params: {
  email: string;
}): Promise<void> => {
  await sendWithRetry("refund", () =>
    getResend().emails.send({
      from: config.email.noreplyEmail,
      to: params.email,
      subject: "Your Web2Wireframe Pro purchase was refunded",
      html: generateRefundNotificationHtml({ email: params.email }),
      text: generateRefundNotificationText({ email: params.email }),
    }),
  );
};

export const generateRefundNotificationHtml = (data: {
  email: string;
}): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 16px; }
        .header h2 { margin: 0; color: #0c0d12; }
        .meta { margin-top: 12px; color: #5a6072; font-size: 0.95rem; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #5a6072; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Your Pro purchase was refunded</h2>
        </div>
        <p>Your Web2Wireframe Pro purchase has been refunded by your bank or by Flitt. Your account is now on the Free plan (10 imports per month).</p>
        <p>If you didn't request this refund, it may have been issued automatically due to a chargeback. Please reach out to <a href="mailto:billing@web2wireframe.design">billing@web2wireframe.design</a> if you have questions or want to re-subscribe.</p>
        <div class="footer">
          <p>You're receiving this because Pro access was linked to ${escapeHtml(
            data.email,
          )}.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateRefundNotificationText = (data: {
  email: string;
}): string => {
  return `
Your Web2Wireframe Pro purchase has been refunded.

Your account is now on the Free plan (10 imports per month).

If you didn't request this refund, it may have been issued automatically due to a chargeback. Please reach out to billing@web2wireframe.design if you have questions or want to re-subscribe.

You're receiving this because Pro access was linked to ${data.email}.
`;
};

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
