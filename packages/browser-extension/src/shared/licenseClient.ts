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
 *   - authHeader()             → helper for callers that hand-roll fetch
 *
 * Runtime-context-agnostic — uses only `fetch`, `chrome.storage`, and
 * primitives available in both the popup and the service worker.
 */

import { API_URL, STORAGE_KEYS } from "./constants";
import type {
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

/** OAuth polling cadence — mirrors plugin licenseClient.ts:125-128. */
const OAUTH_POLL_INTERVAL_MS = 2_000;
const OAUTH_TIMEOUT_MS = 3 * 60 * 1000;
/** Reading time on the "Connected to Figma" page before we close its tab.
 *  Without it the tab vanishes the instant the poll returns, which reads as a
 *  glitch rather than a confirmation. */
const TAB_CLOSE_DELAY_MS = 2_500;

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
// Figma OAuth (extension-side) — port of plugin's connectFigma
// ============================================================================

/**
 * Decode the HMAC token's payload (`base64url(payload).signature`) and
 * return the `userId` field. Pure parsing — does NOT verify the signature
 * (verification is the backend's responsibility on every request); we just
 * need the userId to seed the session record before the first /license/me
 * fetch returns.
 */
export function decodeTokenUserId(token: string): string {
  if (typeof token !== "string" || !token.includes(".")) {
    throw new Error("decodeTokenUserId: malformed token");
  }
  const [payloadB64] = token.split(".");
  let decoded: unknown;
  try {
    // atob in browsers can't handle base64url's "-"/"_" alphabet directly,
    // so swap back to standard base64 before decoding. Padding (`=`) is
    // optional in atob but tolerated.
    const std = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    decoded = JSON.parse(atob(std));
  } catch {
    throw new Error("decodeTokenUserId: payload is not valid base64-JSON");
  }
  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof (decoded as { userId?: unknown }).userId !== "string"
  ) {
    throw new Error("decodeTokenUserId: payload missing userId");
  }
  return (decoded as { userId: string }).userId;
}

/** Cryptographically random hex nonce — same format as the plugin's
 *  `generateNonce()` (figma-plugin/src/ui/shared/licenseClient.ts:103-111). */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("Aborted"));
    });
  });

/**
 * Open a Figma OAuth tab and poll the backend until the freshly minted
 * HMAC token is parked. On success: persist the session (decoded
 * figmaUserId, no email yet) and immediately fetchMyLicense to fill in
 * the email + cachedLicense.
 *
 * Verbatim port of the plugin's `connectFigma`
 * (packages/figma-plugin/src/ui/shared/licenseClient.ts:118-152) with two
 * differences:
 *   - window.open → chrome.tabs.create (popup-blocker exempt).
 *   - figmaUserId decoded from the token (plugin gets it from
 *     ConfigContext; the extension has no such bridge).
 */
export async function connectFigma(signal?: AbortSignal): Promise<License> {
  const nonce = generateNonce();
  const baseUrl = await getBaseUrl();
  // Keep the tab id: the callback page's own window.close() is a no-op on a
  // tab the page didn't open, so the tab we created is ours to clean up.
  const tab = await chrome.tabs.create({
    url: `${baseUrl}/auth/figma/login?plugin_nonce=${encodeURIComponent(nonce)}`,
    active: true,
  });

  const deadline = Date.now() + OAUTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Figma connection cancelled");
    await delay(OAUTH_POLL_INTERVAL_MS, signal);

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/api/auth/figma-exchange?nonce=${encodeURIComponent(nonce)}`,
        { signal },
      );
    } catch {
      // Transient network error — keep polling until the deadline.
      continue;
    }
    if (!response.ok) continue;

    const data = (await response.json().catch(() => null)) as {
      pending?: boolean;
      token?: string;
      expiresAt?: string;
    } | null;
    if (!data || data.pending !== false || !data.token || !data.expiresAt) {
      // Token not parked yet — keep waiting.
      continue;
    }

    // Got a token. Decode it to learn the figmaUserId, seed the session,
    // then fetchMyLicense to fill in email + cachedLicense.
    const figmaUserId = decodeTokenUserId(data.token);
    await setSession({
      sessionToken: data.token,
      expiresAt: new Date(data.expiresAt).getTime(),
      figmaUserId,
      email: null,
      cachedLicense: null,
    });
    // fetchMyLicense updates the cachedLicense field in storage and returns
    // the license doc — its email becomes the session's email implicitly
    // (next read picks up the cachedLicense.email).
    const license = await fetchMyLicense(signal);
    // Patch the session's top-level email to match the license's, since
    // the email line in the Options-page paired card reads from session.
    const session = await getSession();
    if (session && license.email !== session.email) {
      await setSession({ ...session, email: license.email });
    }
    // Success only. On timeout or cancellation the tab is left alone — it may
    // be showing the OAuth error page, and closing it would take away the only
    // explanation the user gets. Swallow failures: the user may have closed it.
    //
    // The pause is deliberate and NOT signal-aware: we already have the
    // license, so letting an abort reject here would fail a connection that
    // actually succeeded. Awaiting (rather than a bare setTimeout) also keeps
    // the service worker alive through it — the START_FIGMA_OAUTH message
    // channel stays open until this promise settles.
    if (tab.id != null) {
      await delay(TAB_CLOSE_DELAY_MS);
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
    return license;
  }
  throw new Error("Figma connection timed out — please try again");
}
