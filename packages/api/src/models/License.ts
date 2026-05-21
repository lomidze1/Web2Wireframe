import mongoose, { Schema, type Document } from "mongoose";

// ============================================================================
// Types
// ============================================================================

export type LicensePlan = "free" | "pro";
export type LicenseStatus = "active" | "canceled" | "expired";

export interface ISubscription {
  flittOrderId: string;
  activatedAt: Date;
  nextBillingAt: Date;
  canceledAt: Date | null;
  lastChargeAt: Date | null;
  lastFailedAt: Date | null;
  failureCount: number;
  /** true = native Flitt subscription; false = one-time purchase. */
  autoRenew: boolean;
  /** Set when an expiry reminder email has been sent for the current cycle. */
  reminderSentAt: Date | null;
}

export interface IUsage {
  imports: number;
  periodStartedAt: Date;
}

export interface ILicense extends Document {
  createdAt: Date;
  updatedAt: Date;
  figmaUserId: string;
  email: string | null;
  plan: LicensePlan;
  status: LicenseStatus;
  cycleStartedAt: Date;
  cycleEndsAt: Date;
  usage: IUsage;
  subscription: ISubscription | null;
}

// ============================================================================
// Constants
// ============================================================================

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const CYCLE_DURATION_MS = 30 * MILLISECONDS_PER_DAY;

/** Per-plan import limits. Pro is unlimited. */
export const PLAN_LIMITS = {
  free: { imports: 10 },
  pro: { imports: Number.POSITIVE_INFINITY },
} as const;

/** Pro pricing — single tier at launch. */
export const PLAN_PRICES = {
  pro: { priceCents: 1600, period: "month" as const, currency: "USD" as const },
} as const;

// ============================================================================
// Schemas
// ============================================================================

const SubscriptionSchema = new Schema<ISubscription>(
  {
    flittOrderId: { type: String, required: true },
    activatedAt: { type: Date, required: true },
    nextBillingAt: { type: Date, required: true },
    canceledAt: { type: Date, default: null },
    lastChargeAt: { type: Date, default: null },
    lastFailedAt: { type: Date, default: null },
    failureCount: { type: Number, default: 0 },
    autoRenew: { type: Boolean, default: false },
    reminderSentAt: { type: Date, default: null },
  },
  { _id: false },
);

const UsageSchema = new Schema<IUsage>(
  {
    imports: { type: Number, default: 0 },
    periodStartedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const LicenseSchema = new Schema<ILicense>(
  {
    figmaUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: { type: String, default: null, index: true },
    plan: {
      type: String,
      enum: ["free", "pro"] as const,
      default: "free",
    },
    status: {
      type: String,
      enum: ["active", "canceled", "expired"] as const,
      default: "active",
    },
    cycleStartedAt: { type: Date, default: () => new Date() },
    cycleEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + CYCLE_DURATION_MS),
    },
    usage: {
      type: UsageSchema,
      default: () => ({ imports: 0, periodStartedAt: new Date() }),
    },
    subscription: { type: SubscriptionSchema, default: null },
  },
  { timestamps: true },
);

LicenseSchema.index({ "subscription.nextBillingAt": 1 });
LicenseSchema.index({ cycleEndsAt: 1 });
LicenseSchema.index({ "subscription.reminderSentAt": 1, cycleEndsAt: 1 });
// `timestamps: true` adds the field but NOT an index. /api/admin/license/recent
// sorts by updatedAt desc; without this index every admin page-load
// collscans the entire licenses collection then sorts in memory.
LicenseSchema.index({ updatedAt: -1 });

export const License = mongoose.model<ILicense>("License", LicenseSchema);
