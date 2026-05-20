import {
  License,
  PLAN_LIMITS,
  CYCLE_DURATION_MS,
  type ILicense,
} from "../models/License.js";

// ============================================================================
// Result types
// ============================================================================

export interface UseImportSuccess {
  ok: true;
  remaining: number; // Number.POSITIVE_INFINITY for Pro
}

export interface UseImportFailure {
  error: "limit_exceeded";
}

export type UseImportResult = UseImportSuccess | UseImportFailure;

// ============================================================================
// In-place state-machine helpers (mutate doc; caller persists)
// ============================================================================

/**
 * If a Free license's cycle has elapsed, advance it: reset usage and roll the
 * cycle dates forward. Returns true if the doc was modified.
 *
 * Only applies to Free licenses. An expired Pro license must NOT get a free
 * cycle reset — `downgradeExpiredOneTimePro` / `cleanupExpiredCancellation`
 * handle the downgrade for Pro.
 */
export function resetCycleIfElapsed(license: ILicense): boolean {
  if (license.plan !== "free") return false;
  const now = Date.now();
  if (now < license.cycleEndsAt.getTime()) return false;
  const nowDate = new Date(now);
  license.cycleStartedAt = nowDate;
  license.cycleEndsAt = new Date(now + CYCLE_DURATION_MS);
  license.usage.imports = 0;
  license.usage.periodStartedAt = nowDate;
  return true;
}

/**
 * If a one-time Pro purchase has expired (no auto-renewal), downgrade in place
 * to Free with a fresh cycle. Subscription Pro licenses (`autoRenew: true`)
 * are left untouched — Flitt's recurring charge / cancellation drives those.
 * Returns true if the doc was modified.
 */
export function downgradeExpiredOneTimePro(license: ILicense): boolean {
  if (license.plan !== "pro") return false;
  if (license.subscription?.autoRenew === true) return false;
  if (Date.now() < license.cycleEndsAt.getTime()) return false;

  const now = new Date();
  license.plan = "free";
  license.status = "active";
  license.subscription = null;
  license.cycleStartedAt = now;
  license.cycleEndsAt = new Date(now.getTime() + CYCLE_DURATION_MS);
  license.usage.imports = 0;
  license.usage.periodStartedAt = now;
  return true;
}

/**
 * If a Pro subscription was canceled and the access period has ended,
 * downgrade in place to Free with a fresh cycle. Returns true if modified.
 */
export function cleanupExpiredCancellation(license: ILicense): boolean {
  if (license.status !== "canceled") return false;
  if (Date.now() < license.cycleEndsAt.getTime()) return false;

  const now = new Date();
  license.plan = "free";
  license.status = "active";
  license.subscription = null;
  license.cycleStartedAt = now;
  license.cycleEndsAt = new Date(now.getTime() + CYCLE_DURATION_MS);
  license.usage.imports = 0;
  license.usage.periodStartedAt = now;
  return true;
}

// ============================================================================
// Service
// ============================================================================

export const licenseService = {
  /**
   * Read or auto-create a Free license. Runs lazy cancellation cleanup and
   * cycle reset on every call so callers see a current view without needing
   * a cron job.
   */
  async getOrCreate(figmaUserId: string): Promise<ILicense> {
    let license = await License.findOne({ figmaUserId });
    if (!license) {
      license = await License.create({ figmaUserId });
      return license;
    }

    // Downgrade-on-read takes precedence: a canceled subscription Pro or an
    // expired one-time Pro is downgraded to Free (which already rolls a fresh
    // cycle), so the redundant Free cycle reset is skipped.
    const downgradedCancel = cleanupExpiredCancellation(license);
    const downgradedOneTime = downgradedCancel
      ? false
      : downgradeExpiredOneTimePro(license);
    const cycled =
      downgradedCancel || downgradedOneTime
        ? false
        : resetCycleIfElapsed(license);
    if (downgradedCancel || downgradedOneTime || cycled) await license.save();
    return license;
  },

  /**
   * Atomically increment imports. Returns remaining count for the cycle, or
   * { error: "limit_exceeded" } when the Free quota is full.
   */
  async useImport(figmaUserId: string): Promise<UseImportResult> {
    // Ensure license exists and is fresh (handles new users + cycle reset).
    const license = await this.getOrCreate(figmaUserId);

    if (license.plan === "pro") {
      await License.findOneAndUpdate(
        { figmaUserId },
        { $inc: { "usage.imports": 1 } },
      );
      return { ok: true, remaining: Number.POSITIVE_INFINITY };
    }

    // Free: atomic conditional increment to avoid race conditions when the
    // user opens multiple tabs / triggers concurrent imports.
    const limit = PLAN_LIMITS.free.imports;
    const updated = await License.findOneAndUpdate(
      { figmaUserId, "usage.imports": { $lt: limit } },
      { $inc: { "usage.imports": 1 } },
      { new: true },
    );
    if (!updated) {
      return { error: "limit_exceeded" };
    }
    return { ok: true, remaining: limit - updated.usage.imports };
  },

  /**
   * Webhook: subscription approved (initial activation). Upserts so we tolerate
   * a missing license row (rare — getOrCreate is normally called first).
   */
  async applySubscriptionActivation(params: {
    figmaUserId: string;
    email: string | null;
    flittOrderId: string;
  }): Promise<ILicense> {
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + CYCLE_DURATION_MS);
    const updated = await License.findOneAndUpdate(
      { figmaUserId: params.figmaUserId },
      {
        $set: {
          email: params.email,
          plan: "pro",
          status: "active",
          cycleStartedAt: now,
          cycleEndsAt: cycleEnd,
          "usage.imports": 0,
          "usage.periodStartedAt": now,
          subscription: {
            flittOrderId: params.flittOrderId,
            activatedAt: now,
            nextBillingAt: cycleEnd,
            canceledAt: null,
            lastChargeAt: now,
            lastFailedAt: null,
            failureCount: 0,
            autoRenew: true,
            reminderSentAt: null,
          },
        },
      },
      { new: true, upsert: true },
    );
    // upsert:true with new:true guarantees a non-null result.
    return updated as ILicense;
  },

  /**
   * Webhook: one-time purchase approved. Grants 30 days of Pro. If the user is
   * already an active Pro, the new 30 days STACK onto the remaining time so an
   * early renewal loses no days; an expired Pro renews fresh from now.
   *
   * Read-modify-write: a concurrent second webhook for the same user within
   * milliseconds is effectively impossible (a user cannot complete two Flitt
   * checkouts at once), and webhook idempotency dedupes retries of the same
   * payment upstream.
   */
  async applyOneTimePurchase(params: {
    figmaUserId: string;
    email: string | null;
    flittOrderId: string;
  }): Promise<ILicense> {
    const now = new Date();
    const existing = await License.findOne({ figmaUserId: params.figmaUserId });
    const stillActivePro =
      existing != null &&
      existing.plan === "pro" &&
      existing.cycleEndsAt.getTime() > now.getTime();
    const base = stillActivePro
      ? existing.cycleEndsAt.getTime()
      : now.getTime();
    const cycleEnd = new Date(base + CYCLE_DURATION_MS);

    const updated = await License.findOneAndUpdate(
      { figmaUserId: params.figmaUserId },
      {
        $set: {
          email: params.email,
          plan: "pro",
          status: "active",
          cycleStartedAt: now,
          cycleEndsAt: cycleEnd,
          "usage.imports": 0,
          "usage.periodStartedAt": now,
          subscription: {
            flittOrderId: params.flittOrderId,
            activatedAt: now,
            nextBillingAt: cycleEnd,
            canceledAt: null,
            lastChargeAt: now,
            lastFailedAt: null,
            failureCount: 0,
            autoRenew: false,
            reminderSentAt: null,
          },
        },
      },
      { new: true, upsert: true },
    );
    // upsert:true with new:true guarantees a non-null result.
    return updated as ILicense;
  },

  /**
   * Webhook: recurring charge approved. Extend cycle, reset usage, clear
   * failureCount.
   */
  async applyRecurringCharge(params: {
    figmaUserId: string;
  }): Promise<ILicense | null> {
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + CYCLE_DURATION_MS);
    return await License.findOneAndUpdate(
      { figmaUserId: params.figmaUserId, plan: "pro" },
      {
        $set: {
          cycleStartedAt: now,
          cycleEndsAt: cycleEnd,
          "usage.imports": 0,
          "usage.periodStartedAt": now,
          "subscription.nextBillingAt": cycleEnd,
          "subscription.lastChargeAt": now,
          "subscription.failureCount": 0,
        },
      },
      { new: true },
    );
  },

  /**
   * Webhook: charge declined / expired. Bumps failureCount; Flitt's own
   * retry schedule (2s/60s/5min/10min/1h/24h) drives the next attempt.
   */
  async applyFailedCharge(params: {
    figmaUserId: string;
  }): Promise<ILicense | null> {
    return await License.findOneAndUpdate(
      { figmaUserId: params.figmaUserId },
      {
        $set: { "subscription.lastFailedAt": new Date() },
        $inc: { "subscription.failureCount": 1 },
      },
      { new: true },
    );
  },

  /**
   * Webhook: reversed (refund / chargeback). Atomically revokes Pro and
   * downgrades to Free **only if** the refunded `flittOrderId` matches the
   * user's current `subscription.flittOrderId`. A refund for an older order
   * (the user has since re-purchased) must not retro-punish their current
   * Pro access — the matched-filter prevents that.
   *
   * Returns:
   *   - revoked=true  → access was revoked; caller may notify the user
   *   - revoked=false → user wasn't Pro or order is stale; no-op
   *
   * `license` is the post-revocation document on revoked=true (so the email
   * is reachable), or the current document on revoked=false (best-effort
   * context for the caller's log line).
   */
  async applyRefund(params: {
    figmaUserId: string;
    flittOrderId: string;
  }): Promise<{ revoked: boolean; license: ILicense | null }> {
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + CYCLE_DURATION_MS);
    const updated = await License.findOneAndUpdate(
      {
        figmaUserId: params.figmaUserId,
        plan: "pro",
        "subscription.flittOrderId": params.flittOrderId,
      },
      {
        $set: {
          plan: "free",
          status: "active",
          cycleStartedAt: now,
          cycleEndsAt: cycleEnd,
          "usage.imports": 0,
          "usage.periodStartedAt": now,
          subscription: null,
        },
      },
      { new: true },
    );
    if (updated) {
      return { revoked: true, license: updated };
    }
    // Stale order or user already Free — fetch current state for logging only.
    const current = await License.findOne({
      figmaUserId: params.figmaUserId,
    });
    return { revoked: false, license: current };
  },

  /**
   * Cancel-from-plugin: status → canceled, plan stays "pro" until
   * cycleEndsAt. The lazy `cleanupExpiredCancellation` in `getOrCreate`
   * downgrades to Free after the period ends.
   */
  async applySubscriptionCancel(params: {
    figmaUserId: string;
  }): Promise<ILicense | null> {
    const now = new Date();
    return await License.findOneAndUpdate(
      { figmaUserId: params.figmaUserId, plan: "pro" },
      {
        $set: {
          status: "canceled",
          "subscription.canceledAt": now,
        },
      },
      { new: true },
    );
  },
};
