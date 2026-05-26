import mongoose, { Schema, type Document } from "mongoose";

/**
 * Retention-analytics record for Flitt-side payment failures. Logged by the
 * `/api/checkout/cancel` bridge whenever Flitt redirects the user back after
 * a declined / expired / user-canceled checkout. Distinct from `WebhookEvent`
 * (which guards idempotency on the signed server-callback path) — this
 * collection is *informational only*: no state mutation depends on it, so
 * even spoofed records would only create noise in metrics dashboards.
 *
 * Phase 1 use: count cancel/decline rate, identify users for follow-up.
 * Phase 2 use: drive comeback-offer email (50% off within 24h).
 *
 * Records auto-expire after 90 days — long enough for monthly cohort
 * analysis without unbounded growth.
 */
export interface ICancellationEvent extends Document {
  /** Flitt `payment_id` if present, otherwise `order_id` fallback. */
  transactionId: string;
  orderId: string;
  /** "declined" | "expired" | "cancelled" | (other Flitt-reported value) */
  orderStatus: string;
  /** Parsed from `merchant_data` JSON; null if Flitt omitted or parse failed. */
  figmaUserId: string | null;
  /** Flitt's `sender_email` if collected at checkout; null otherwise. */
  email: string | null;
  amount: number | null;
  currency: string | null;
  /** True if the Flitt SHA1 signature on the redirect POST verified. */
  signatureValid: boolean;
  createdAt: Date;
}

const CancellationEventSchema = new Schema<ICancellationEvent>({
  // sparse so duplicate redirects on the same payment_id don't blow up writes —
  // analytics tolerates a small amount of dupe noise; we read with $group later.
  transactionId: { type: String, index: true, sparse: true },
  orderId: { type: String, required: true, index: true },
  orderStatus: { type: String, required: true },
  figmaUserId: { type: String, default: null, index: true },
  email: { type: String, default: null },
  amount: { type: Number, default: null },
  currency: { type: String, default: null },
  signatureValid: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
});

// 90-day TTL — auto-purge.
CancellationEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

// Anticipated query: "all cancellations for figmaUserId X in the last N days,
// sorted by recency" — drives the comeback-offer cron and admin dashboards.
CancellationEventSchema.index({ figmaUserId: 1, createdAt: -1 });

export const CancellationEvent = mongoose.model<ICancellationEvent>(
  "CancellationEvent",
  CancellationEventSchema,
);
