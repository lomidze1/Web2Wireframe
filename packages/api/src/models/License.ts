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
  /**
   * Tier purchased on the most recent one-time charge. Used by the expiry
   * reminder to render the correct price/duration and to forward `plan=` to
   * the Renew page so yearly users are re-billed yearly instead of silently
   * downgraded to monthly. Defaults to "monthly" for legacy documents.
   */
  lastDuration: ProDuration;
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
export const CYCLE_DURATION_YEARLY_MS = 365 * MILLISECONDS_PER_DAY;

/**
 * Pro stacking renewal window (P2-#1).
 *
 * A user with active Pro can only purchase a renewal when their remaining
 * time has dropped to this window. Outside the window, `/api/checkout/create`
 * returns 400 with `{error: "already_pro", renewalOpensInDays: N}` so the
 * client can show "you already have Pro" rather than letting the user
 * stack arbitrary cycles.
 *
 * Defends against chargeback-stacking abuse where an attacker buys N cycles
 * for $16 each, then chargebacks N-1 of them — keeping all the stacked
 * Pro time minus the cost of the most-recent unrevoked order.
 */
export const RENEWAL_WINDOW_DAYS_MONTHLY = 7;
export const RENEWAL_WINDOW_DAYS_YEARLY = 10;
export const RENEWAL_WINDOW_MS_MONTHLY =
  RENEWAL_WINDOW_DAYS_MONTHLY * MILLISECONDS_PER_DAY;
export const RENEWAL_WINDOW_MS_YEARLY =
  RENEWAL_WINDOW_DAYS_YEARLY * MILLISECONDS_PER_DAY;

export function getRenewalWindowMs(duration: ProDuration): number {
  return duration === "yearly"
    ? RENEWAL_WINDOW_MS_YEARLY
    : RENEWAL_WINDOW_MS_MONTHLY;
}

/** Per-plan import limits. Pro is unlimited. */
export const PLAN_LIMITS = {
  free: { imports: 10 },
  pro: { imports: Number.POSITIVE_INFINITY },
} as const;

/**
 * Pro pricing — both Monthly and Yearly tiers. The flat `priceCents` /
 * `period` fields preserve the original single-tier shape so existing
 * callers keep compiling without changes; new code should prefer the
 * tier-aware helpers below.
 */
export const PLAN_PRICES = {
  pro: {
    priceCents: 1600, // legacy alias — equals monthly tier
    yearlyPriceCents: 14400, // 25% off vs 12× monthly (= $144 / yr)
    period: "month" as const,
    currency: "USD" as const,
  },
} as const;

export type ProDuration = "monthly" | "yearly";

/** Tier-aware price lookup. Monthly is the default for legacy payloads. */
export function getProPriceCents(duration: ProDuration): number {
  return duration === "yearly"
    ? PLAN_PRICES.pro.yearlyPriceCents
    : PLAN_PRICES.pro.priceCents;
}

/** Tier-aware duration in ms. Monthly is the default for legacy payloads. */
export function getProDurationMs(duration: ProDuration): number {
  return duration === "yearly" ? CYCLE_DURATION_YEARLY_MS : CYCLE_DURATION_MS;
}

/** Human-readable order description Flitt shows on the checkout page. */
export function getProOrderDescription(duration: ProDuration): string {
  return duration === "yearly"
    ? "Web2Wireframe Pro — 1 Year"
    : "Web2Wireframe Pro — 1 Month";
}

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
    lastDuration: {
      type: String,
      enum: ["monthly", "yearly"] as const,
      default: "monthly",
    },
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
