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
 * Retention: 7 years. Financial-record retention rules drive this — Georgia
 * Tax Code (6 years), EU VAT MOSS (10 years if we ever cross the
 * registration threshold), US IRS (7 years for audit defense). 7y is the
 * intersection most jurisdictions accept; if regulatory scope changes,
 * drop the TTL entirely and rely on the backup script's S3 archive for
 * longer retention.
 *
 * Card-dispute statutes alone would justify only 6 months; the longer
 * retention here is about being able to answer "show me the charge log
 * for this account in 2027" if a customer asks for tax purposes.
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
  // No `index: true` here — the compound index below (figmaUserId, at desc)
  // covers single-key lookups too via Mongo's prefix-match. A standalone
  // index would be redundant write overhead on every audit insert.
  figmaUserId: { type: String, required: true },
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

// 7-year TTL — financial records retention (see header comment).
LicenseAuditSchema.index(
  { at: 1 },
  { expireAfterSeconds: 7 * 365 * 24 * 60 * 60 },
);

// Compound index: per-user history queries are the most common access
// pattern (admin lookup, support investigations). Supersedes the single
// `figmaUserId` index declared on the field (Mongo uses prefix-match).
LicenseAuditSchema.index({ figmaUserId: 1, at: -1 });

export const LicenseAudit = mongoose.model<ILicenseAudit>(
  "LicenseAudit",
  LicenseAuditSchema,
);
