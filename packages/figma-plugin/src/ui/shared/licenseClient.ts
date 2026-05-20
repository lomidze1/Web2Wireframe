import { API_BASE_URL, withFigmaUserId } from "./apiConfig";
import { httpErrorMessage } from "./httpErrors";

export type Plan = "free" | "pro";
export type Status = "active" | "canceled" | "expired";

export interface LicenseSubscription {
  flittOrderId: string;
  activatedAt: string;
  nextBillingAt: string;
  canceledAt: string | null;
  lastFailedAt: string | null;
  failureCount: number;
  /** true = recurring subscription; false = one-time purchase. */
  autoRenew: boolean;
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

// ============================================================================
// Auth token state (Figma OAuth)
// ============================================================================
// Plugin → API auth uses a backend-issued HMAC token bound to the caller's
// *verified* Figma identity. The token is obtained through the Figma OAuth
// flow (connectFigma) and persisted in figma.clientStorage via the sandbox.
//
// This replaces the old `/api/auth/init`, which minted a token for any
// `figmaUserId` posted in the request body — with no proof the caller owned
// that account — and so let anyone impersonate any Figma user.

interface AuthState {
  token: string;
  expiresAt: number; // epoch ms
}

let authState: AuthState | null = null;

const TOKEN_SAFETY_MARGIN_MS = 60_000;

/** Apply a token to in-memory state only (used when loading from storage). */
export function applyAuthToken(token: string, expiresAt: number): void {
  authState = { token, expiresAt };
}

/** Apply a token AND persist it to clientStorage via the sandbox. */
export function setAuthToken(token: string, expiresAt: number): void {
  applyAuthToken(token, expiresAt);
  parent.postMessage(
    { pluginMessage: { type: "save-auth-token", data: { token, expiresAt } } },
    "*",
  );
}

/** Clear the token from memory and clientStorage. */
export function clearAuthToken(): void {
  authState = null;
  parent.postMessage({ pluginMessage: { type: "clear-auth-token" } }, "*");
}

/** The current token if held and not within the safety margin of expiry. */
export function getValidToken(): string | null {
  if (!authState) return null;
  if (authState.expiresAt - TOKEN_SAFETY_MARGIN_MS <= Date.now()) return null;
  return authState.token;
}

/** Authorization header value. Throws if no valid token is held. */
export function authHeader(): string {
  const token = getValidToken();
  if (!token) {
    throw new Error("Not connected to Figma");
  }
  return `Bearer ${token}`;
}

const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Run the Figma OAuth flow: open the backend login URL in a browser tab and
 * poll the exchange endpoint until the verified token is parked. Resolves
 * once the token is in memory + persisted; rejects on timeout/cancel.
 */
export async function connectFigma(signal?: AbortSignal): Promise<void> {
  const nonce = generateNonce();
  const loginUrl = `${API_BASE_URL}/auth/figma/login?plugin_nonce=${encodeURIComponent(
    nonce,
  )}`;
  window.open(loginUrl, "_blank", "noopener");

  const deadline = Date.now() + 3 * 60 * 1000; // 3 minutes
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Connection cancelled");
    await delay(2000);
    let res: Response;
    try {
      res = await fetch(
        `${API_BASE_URL}/api/auth/figma-exchange?nonce=${encodeURIComponent(
          nonce,
        )}`,
        { signal },
      );
    } catch {
      continue; // transient network error — keep polling
    }
    if (!res.ok) continue;
    const data = (await res.json().catch(() => null)) as {
      pending?: boolean;
      token?: string;
      expiresAt?: string;
    } | null;
    if (data && data.pending === false && data.token && data.expiresAt) {
      setAuthToken(data.token, new Date(data.expiresAt).getTime());
      return;
    }
  }
  throw new Error("Figma connection timed out — please try again");
}

/** Roll the token's expiry while it is still valid. Best-effort. */
export async function refreshAuthToken(): Promise<void> {
  const token = getValidToken();
  if (!token) return;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return;
  }
  if (!res.ok) return;
  const data = (await res.json().catch(() => null)) as {
    token?: string;
    expiresAt?: string;
  } | null;
  if (data && data.token && data.expiresAt) {
    setAuthToken(data.token, new Date(data.expiresAt).getTime());
  }
}

/** Test helper — resets cached auth state so unit tests start clean. */
export function __resetAuthForTests(): void {
  authState = null;
}

// ============================================================================
// /api/extension-pair
// ============================================================================

/**
 * Request a short pairing code bound to this verified user. The user types
 * it into the browser extension so its captures land in their own queue
 * slot rather than a shared global one.
 */
export async function requestPairingCode(
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/extension-pair`, {
    method: "POST",
    headers: { Authorization: authHeader() },
    signal,
  });
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status));
  }
  const data = (await response.json()) as { code?: string };
  if (!data.code) {
    throw new Error("Pairing response missing code");
  }
  return data.code;
}

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
    headers: { Authorization: authHeader() },
    signal,
  });
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status));
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
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({ figmaUserId }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof (body as { error?: string }).error === "string"
        ? (body as { error: string }).error
        : httpErrorMessage(response.status),
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
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({ figmaUserId }),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status));
  }
  return (await response.json()) as { token: string; expiresInSeconds: number };
}
