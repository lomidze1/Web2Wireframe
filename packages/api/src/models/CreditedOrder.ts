import mongoose, { Schema, type Document } from "mongoose";

/**
 * Durable record of every one-time Flitt order that has granted Pro.
 *
 * WebhookEvent dedup rows expire after 90 days, so on their own they cannot
 * stop a signed "approved" callback from being replayed later and credited
 * again (security audit 2026-09-19, #1). This collection has NO TTL: the
 * unique `orderId` makes a second credit of the same order impossible.
 * One small row per sale.
 */
export interface ICreditedOrder extends Document {
  orderId: string;
  figmaUserId: string;
  creditedAt: Date;
}

const CreditedOrderSchema = new Schema<ICreditedOrder>({
  orderId: { type: String, required: true, unique: true },
  figmaUserId: { type: String, required: true, index: true },
  creditedAt: { type: Date, default: () => new Date() },
});

export const CreditedOrder = mongoose.model<ICreditedOrder>(
  "CreditedOrder",
  CreditedOrderSchema,
);
