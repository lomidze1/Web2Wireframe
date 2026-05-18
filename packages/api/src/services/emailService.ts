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
          <h2>[Support Ticket] ${data.topic}</h2>
          <p style="margin: 8px 0 0 0; color: #5a6072;">From: <strong>${
            data.name
          }</strong></p>
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
