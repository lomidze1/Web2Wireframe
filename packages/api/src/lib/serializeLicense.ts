// Shared license serializer. Used by both the plugin's /api/license/* routes
// and the browser extension's /api/extension-session/redeem route so that the
// wire shape stays identical across surfaces (the extension's Plan modal is a
// direct port of the plugin's Plan.tsx and depends on field-for-field parity).

import { type ILicense, PLAN_LIMITS } from "../models/License.js";

export interface SerializedLicense {
  figmaUserId: string;
  email: string | null;
  plan: "free" | "pro";
  status: "active" | "canceled" | "expired";
  cycleStartedAt: string;
  cycleEndsAt: string;
  usage: {
    imports: number;
    periodStartedAt: string;
  };
  limits: {
    // null over JSON for "unlimited" — Pro users see no cap.
    imports: number | null;
  };
  subscription: {
    flittOrderId: string;
    activatedAt: string;
    nextBillingAt: string;
    canceledAt: string | null;
    lastFailedAt: string | null;
    failureCount: number;
    /** true = native Flitt recurring subscription; false = one-time purchase. */
    autoRenew: boolean;
    /**
     * Tier of the most-recent one-time purchase. Lets the plugin / extension
     * decide whether to surface "Upgrade to Yearly" to a monthly Pro user.
     */
    lastDuration: "monthly" | "yearly";
  } | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeLicense(license: ILicense): SerializedLicense {
  const limit = PLAN_LIMITS[license.plan].imports;
  return {
    figmaUserId: license.figmaUserId,
    email: license.email,
    plan: license.plan,
    status: license.status,
    cycleStartedAt: license.cycleStartedAt.toISOString(),
    cycleEndsAt: license.cycleEndsAt.toISOString(),
    usage: {
      imports: license.usage.imports,
      periodStartedAt: license.usage.periodStartedAt.toISOString(),
    },
    limits: {
      imports: Number.isFinite(limit) ? limit : null,
    },
    subscription: license.subscription
      ? {
          flittOrderId: license.subscription.flittOrderId,
          activatedAt: license.subscription.activatedAt.toISOString(),
          nextBillingAt: license.subscription.nextBillingAt.toISOString(),
          canceledAt:
            license.subscription.canceledAt?.toISOString() ?? null,
          lastFailedAt:
            license.subscription.lastFailedAt?.toISOString() ?? null,
          failureCount: license.subscription.failureCount,
          autoRenew: license.subscription.autoRenew === true,
          lastDuration: license.subscription.lastDuration ?? "monthly",
        }
      : null,
    createdAt: license.createdAt.toISOString(),
    updatedAt: license.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public (non-admin) shape — M-3
// ---------------------------------------------------------------------------
// The plugin/extension never need `flittOrderId`. The webhook handler is the
// only path that issues cancel actions tied to that id, and the admin panel
// uses its own server-side `serialize()` (admin/license.ts) which keeps the
// field. Stripping it from public responses removes one piece of
// payment-system metadata from the attack surface — a leaked plugin token
// no longer exposes the user's Flitt order id to an attacker who could try
// to use it as a correlation key against future webhooks.

export type PublicSerializedLicense = Omit<SerializedLicense, "subscription"> & {
  subscription: Omit<
    NonNullable<SerializedLicense["subscription"]>,
    "flittOrderId"
  > | null;
};

export function serializeLicenseForPlugin(
  license: ILicense,
): PublicSerializedLicense {
  const full = serializeLicense(license);
  if (full.subscription == null) {
    return { ...full, subscription: null };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { flittOrderId: _omit, ...rest } = full.subscription;
  return { ...full, subscription: rest };
}
