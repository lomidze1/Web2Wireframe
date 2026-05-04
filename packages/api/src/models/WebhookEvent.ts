import mongoose, { Schema, type Document } from "mongoose";

/**
 * Idempotency tracker for Flitt webhook callbacks. Flitt retries failed
 * deliveries on a 2s/60s/5min/10min/1h/24h schedule, so the same event
 * can arrive multiple times. We dedup on `transactionId` (or
 * `orderId + orderStatus` when transaction_id is absent).
 *
 * Records auto-expire after 90 days via a TTL index — long enough to
 * cover Flitt's full retry window and any forensic debugging.
 */
export interface IWebhookEvent extends Document {
  transactionId: string;
  orderId: string;
  orderStatus: string;
  processedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>({
  transactionId: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, index: true },
  orderStatus: { type: String, required: true },
  processedAt: { type: Date, default: () => new Date() },
});

// 90-day TTL — auto-purge old idempotency records.
WebhookEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

export const WebhookEvent = mongoose.model<IWebhookEvent>(
  "WebhookEvent",
  WebhookEventSchema,
);
