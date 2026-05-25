/**
 * Browser-extension API client. Port of the Figma plugin's
 * `packages/figma-plugin/src/ui/shared/licenseClient.ts`, stripped of the
 * Figma-OAuth-specific code paths (`parent.postMessage`, `connectFigma`)
 * and rebased onto `chrome.storage.local` (via shared/session.ts) for token
 * persistence.
 *
 * Surfaces:
 *   - redeemPairingCode(code)  → POST /api/extension-session/redeem
 *   - refreshSession()         → POST /api/extension-session/refresh
 *   - revokeSession()          → POST /api/extension-session/revoke + clearSession()
 *   - fetchMyLicense()         → GET  /api/license/me
 *   - createCheckout(plan)     → POST /api/checkout/create
 *   - authHeader()             → helper for callers that hand-roll fetch
 *
 * Runtime-context-agnostic — uses only `fetch`, `chrome.storage`, and
 * primitives available in both the popup and the service worker.
 */

import { API_URL, STORAGE_KEYS } from "./constants";
import type {
  CheckoutPlan,
  CheckoutResponse,
  ExtensionSettings,
  License,
  RedeemResponse,
  SessionState,
} from "./types";
import {
  clearSession,
  getSession,
  getValidToken,
  setSession,
  updateCachedLicense,
} from "./session";

/**
 * Thrown when an authenticated request comes back 401. Callers should catch
 * this and drop straight into logout / unpaired UI — the plugin emits a
 * `w2w:auth-expired` window event for the same purpose, but the extension
 * popup is a single Preact tree so a thrown error is enough.
 */
export class AuthExpiredError extends Error {
  constructor() {
    super("Session expired or revoked");
    this.name = "AuthExpiredError";
  }
}

/** Resolve the API base URL — `settings.backendUrl` overrides the prod
 *  default. Reuses the existing storage layout owned by the SETTINGS key
 *  so the Options page is still the single source of truth for it. */
async function getBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = stored[STORAGE_KEYS.SETTINGS] as
    | Partial<ExtensionSettings>
    | undefined;
  return settings?.backendUrl ?? API_URL;
}

/**
 * Convenience: Authorization header for callers that build their own
 * fetch (e.g. the background capture upload in a future dual-write phase).
 * Throws when no valid session is held so callers see a clear failure
 * rather than sending an empty Bearer.
 */
export async function authHeader(): Promise<string> {
  const token = await getValidToken();
  if (!token) throw new AuthExpiredError();
  return `Bearer ${token}`;
}

/** Convert RedeemResponse.expiresAt (ISO string) into the epoch ms shape
 *  SessionState stores. Falling back to "now" guards against an
 *  unparseable string slipping through; downstream `getValidToken()`
 *  will treat the session as expired and force a re-pair. */
function isoToEpochMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

// ============================================================================
// POST /api/extension-session/redeem
// ============================================================================

/**
 * Trade a pairing code (issued by the Figma plugin via /api/extension-pair)
 * for a 30-day session token. On success the session is persisted to
 * chrome.storage.local before the function returns; callers can render
 * "Signed in as <email>" immediately.
 */
export async function redeemPairingCode(
  code: string,
  signal?: AbortSignal,
): Promise<RedeemResponse> {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    throw new Error("Pairing code is required");
  }

  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/extension-session/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: trimmed }),
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthExpiredError();
    }
    throw new Error(`Pairing failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as RedeemResponse;
  const state: SessionState = {
    sessionToken: data.sessionToken,
    expiresAt: isoToEpochMs(data.expiresAt),
    figmaUserId: data.figmaUserId,
    email: data.email,
    cachedLicense: data.license,
  };
  await setSession(state);
  return data;
}

// ============================================================================
// POST /api/extension-session/refresh
// ============================================================================

/**
 * Roll the held token's expiry forward. Returns `false` (and does nothing)
 * when no valid session is held. On 401 from the backend the local session
 * is cleared and `AuthExpiredError` is thrown.
 */
export async function refreshSession(signal?: AbortSignal): Promise<boolean> {
  const token = await getValidToken();
  if (!token) return false;

  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/extension-session/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (response.status === 401) {
    await clearSession();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    // Non-401 failure: keep the existing session, surface to caller.
    throw new Error(`Refresh failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    sessionToken: string;
    expiresAt: string;
  };
  const current = await getSession();
  if (!current) return false; // raced with logout — drop the new token

  await setSession({
    ...current,
    sessionToken: data.sessionToken,
    expiresAt: isoToEpochMs(data.expiresAt),
  });
  return true;
}

// ============================================================================
// POST /api/extension-session/revoke  +  local clear
// ============================================================================

/**
 * Best-effort backend revoke + unconditional local clear. The local clear
 * happens *after* the network call so that a backend hiccup doesn't leave
 * the client logged out while the token still works elsewhere — but if
 * the network call throws we still clear locally, because logout has to
 * always succeed from the user's perspective.
 */
export async function revokeSession(signal?: AbortSignal): Promise<void> {
  const token = await getValidToken();
  if (!token) {
    // Already logged out — make the local state match.
    await clearSession();
    return;
  }
  const baseUrl = await getBaseUrl();
  try {
    await fetch(`${baseUrl}/api/extension-session/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
  } catch {
    // Network failure during logout is not user-visible; the token will
    // still expire on its own at expiresAt.
  } finally {
    await clearSession();
  }
}

// ============================================================================
// GET /api/license/me
// ============================================================================

/**
 * Fetch the latest license for the held session. Updates the cached snapshot
 * on success so subsequent popup opens render without a network round-trip.
 * Throws AuthExpiredError on 401 — also wipes the local session in that
 * case so the UI bounces to the unpaired state on next read.
 */
export async function fetchMyLicense(signal?: AbortSignal): Promise<License> {
  const token = await getValidToken();
  if (!token) throw new AuthExpiredError();

  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/license/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (response.status === 401) {
    await clearSession();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    throw new Error(`License fetch failed (HTTP ${response.status})`);
  }
  const license = (await response.json()) as License;
  await updateCachedLicense(license);
  return license;
}

// ============================================================================
// POST /api/checkout/create
// ============================================================================

/**
 * Open a Flitt checkout for the held session. The plugin's `createCheckout`
 * supports both legacy (figmaUserId in body) and Bearer auth; the extension
 * always sends Bearer.
 */
export async function createCheckout(
  plan: CheckoutPlan,
  signal?: AbortSignal,
): Promise<CheckoutResponse> {
  const session = await getSession();
  if (!session) throw new AuthExpiredError();
  const token = await getValidToken();
  if (!token) throw new AuthExpiredError();

  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/checkout/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ figmaUserId: session.figmaUserId, plan }),
    signal,
  });
  if (response.status === 401) {
    await clearSession();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    throw new Error(`Checkout failed (HTTP ${response.status})`);
  }
  return (await response.json()) as CheckoutResponse;
}
