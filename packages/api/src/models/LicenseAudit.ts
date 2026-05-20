import mongoose, { Schema, type Document } from "mongoose";

/**
 * Forensic + accounting trail for license state changes. Every webhook-driven
 * mutation (`applySubscriptionActivation`, `applyOneTimePurchase`,
 * `applyRecurringCharge`, `applyFailedCharge`, `applySubscriptionCancel`,
 * `applyRefund`) writes one row. Admin-initiated `override` calls also log
 * here.
 *
 * Why we keep it:
 *   - Dispute resolution: "we charged you because <approved webhook at T1>"
 *   - Refund forensics: confirm sequence of approved → reversed
 *   - Pattern detection: a user with 5 refunds in 60 days is a chargeback risk
 *
 * Retention: 18 months. Long enough to cover statute-of-limitations on most
 * card disputes (typically 6 months) plus a buffer for tax-year accounting.
 */
export type LicenseAuditAction =
  | "subscription_activation"
  | "one_time_purchase"
  | "recurring_charge"
  | "failed_charge"
  | "subscription_cancel"
  | "refund"
  | "admin_override";

export interface ILicenseAudit extends Document {
  figmaUserId: string;
  action: LicenseAuditAction;
  /** Hash-style summary of what changed: { plan: ["pro","free"], ... } */
  changes: Record<string, [unknown, unknown]>;
  /** Free-form context: orderId, payment_id, amount, override-author note. */
  context: Record<string, unknown>;
  at: Date;
}

const LicenseAuditSchema = new Schema<ILicenseAudit>({
  figmaUserId: { type: String, required: true, index: true },
  action: {
    type: String,
    required: true,
    enum: [
      "subscription_activation",
      "one_time_purchase",
      "recurring_charge",
      "failed_charge",
      "subscription_cancel",
      "refund",
      "admin_override",
    ],
  },
  // `Mixed` because the value pairs are heterogeneous (Date|string|null).
  changes: { type: Schema.Types.Mixed, default: {} },
  context: { type: Schema.Types.Mixed, default: {} },
  at: { type: Date, default: () => new Date(), index: true },
});

// 18-month TTL — auto-purge old audit rows. Card-dispute statutes generally
// run 6 months; we keep extra headroom for tax-year reviews.
LicenseAuditSchema.index(
  { at: 1 },
  { expireAfterSeconds: 18 * 30 * 24 * 60 * 60 },
);

// Compound index: per-user history queries are the most common access
// pattern (admin lookup, support investigations).
LicenseAuditSchema.index({ figmaUserId: 1, at: -1 });

export const LicenseAudit = mongoose.model<ILicenseAudit>(
  "LicenseAudit",
  LicenseAuditSchema,
);
