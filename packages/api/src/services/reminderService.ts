import { config } from "../config/env.js";
import { License } from "../models/License.js";
import {
  sendSupportEmail,
  generateExpiryReminderHtml,
  generateExpiryReminderText,
} from "./emailService.js";

/** Send the reminder this many ms before a one-time Pro cycle ends. */
const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Email one-time Pro users whose access ends within the next 3 days and who
 * have not yet been reminded for the current cycle.
 *
 * The query has NO `$gt: now` lower bound on `cycleEndsAt` — if the server was
 * down through a user's reminder window, they still get a (late) nudge instead
 * of silently lapsing. `applyOneTimePurchase` clears `reminderSentAt` each
 * cycle, and an atomic claim (`findOneAndUpdate` on `reminderSentAt: null`)
 * makes the send safe even if the job runs concurrently.
 */
export async function runExpiryReminders(): Promise<{
  sent: number;
  failed: number;
}> {
  const cutoff = new Date(Date.now() + REMINDER_WINDOW_MS);
  const candidates = await License.find({
    plan: "pro",
    "subscription.autoRenew": { $ne: true },
    "subscription.reminderSentAt": null,
    email: { $ne: null },
    cycleEndsAt: { $lt: cutoff },
  });

  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    // Atomic claim — only one runner sends per cycle. If the claim is lost
    // (another runner / instance got it first), skip silently.
    const claimed = await License.findOneAndUpdate(
      { _id: candidate._id, "subscription.reminderSentAt": null },
      { $set: { "subscription.reminderSentAt": new Date() } },
      { new: true },
    );
    if (!claimed || !claimed.email) continue;

    const renewUrl = `${config.website.baseUrl}/renew?uid=${encodeURIComponent(
      claimed.figmaUserId,
    )}`;
    const expiresAt = claimed.cycleEndsAt.toISOString().slice(0, 10);

    try {
      await sendSupportEmail({
        to: claimed.email,
        from: config.email.noreplyEmail,
        subject: "Your Web2Wireframe Pro access expires soon",
        html: generateExpiryReminderHtml({
          email: claimed.email,
          expiresAt,
          renewUrl,
        }),
        text: generateExpiryReminderText({
          email: claimed.email,
          expiresAt,
          renewUrl,
        }),
      });
      sent += 1;
    } catch (err) {
      // `reminderSentAt` stays set — a reminder is non-critical, no retry.
      console.error(`[Reminders] failed to send to ${claimed.email}:`, err);
      failed += 1;
    }
  }

  return { sent, failed };
}
