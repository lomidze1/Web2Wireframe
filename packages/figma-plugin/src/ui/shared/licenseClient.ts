import { API_BASE_URL, withFigmaUserId } from "./apiConfig";

export type Plan = "free" | "pro";
export type Status = "active" | "canceled" | "expired";

export interface LicenseSubscription {
  flittOrderId: string;
  activatedAt: string;
  nextBillingAt: string;
  canceledAt: string | null;
  lastFailedAt: string | null;
  failureCount: number;
}

export interface License {
  figmaUserId: string;
  email: string | null;
  plan: Plan;
  status: Status;
  cycleStartedAt: string;
  cycleEndsAt: string;
  usage: {
    imports: number;
    periodStartedAt: string;
  };
  limits: {
    // null over JSON for "unlimited" (Pro plan)
    imports: number | null;
  };
  subscription: LicenseSubscription | null;
  createdAt: string;
  updatedAt: string;
}

// Plugin → API auth. Phase 4+ should swap this for an HMAC-signed
// per-install plugin token. For now this is a shared dev/staging fallback.
const DEV_TOKEN = "dev-token";

// ============================================================================
// /api/license/me
// ============================================================================

export async function fetchMyLicense(
  figmaUserId: string,
  signal?: AbortSignal,
): Promise<License> {
  if (!figmaUserId) {
    throw new Error("fetchMyLicense: figmaUserId is required");
  }
  const url = withFigmaUserId(`${API_BASE_URL}/api/license/me`, figmaUserId);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`License request failed (${response.status})`);
  }
  return (await response.json()) as License;
}

// ============================================================================
// /api/checkout/create
// ============================================================================

export interface CheckoutResponse {
  checkoutUrl: string;
  orderId: string;
}

export async function createCheckout(
  figmaUserId: string,
  signal?: AbortSignal,
): Promise<CheckoutResponse> {
  if (!figmaUserId) {
    throw new Error("createCheckout: figmaUserId is required");
  }
  const response = await fetch(`${API_BASE_URL}/api/checkout/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ figmaUserId }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof (body as { error?: string }).error === "string"
        ? (body as { error: string }).error
        : `Checkout request failed (${response.status})`,
    );
  }
  return (await response.json()) as CheckoutResponse;
}

// ============================================================================
// /api/auth/issue-cancel-token
// ============================================================================

/**
 * Request a short-lived HMAC token to embed in the Account page URL when
 * the user opens "Manage Subscription". The token proves to the website
 * that this cancel intent originated from a Figma plugin instance for
 * the same figmaUserId.
 */
export async function issueCancelToken(
  figmaUserId: string,
  signal?: AbortSignal,
): Promise<{ token: string; expiresInSeconds: number }> {
  if (!figmaUserId) {
    throw new Error("issueCancelToken: figmaUserId is required");
  }
  const response = await fetch(
    `${API_BASE_URL}/api/auth/issue-cancel-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUserId }),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Cancel token request failed (${response.status})`);
  }
  return (await response.json()) as { token: string; expiresInSeconds: number };
}
