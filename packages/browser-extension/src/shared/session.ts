/**
 * Extension session state — sole owner of the `STORAGE_KEYS.SESSION` slot in
 * chrome.storage.local. Centralizing every read/write here keeps logout
 * truly atomic (one `clearSession()` call wipes all auth state) and means
 * we never leak the session token into the SETTINGS object that the Options
 * page can write to.
 *
 * Runtime-context-agnostic: works in popup, options page, and the service
 * worker. No DOM dependencies, no Preact.
 */

import type { License, SessionState } from "./types";
import { STORAGE_KEYS } from "./constants";

/** Safety margin — treat a token as "expired" when it has less than this
 *  much life left. Stops a request from being signed with a token that
 *  expires in transit. Matches the plugin's TOKEN_SAFETY_MARGIN_MS
 *  (figma-plugin/src/ui/shared/licenseClient.ts). */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

/** Window in which the popup proactively rolls the token forward via
 *  `/api/extension-session/refresh`. 24h matches the master plan
 *  (EXTENSION-IDENTITY-PARITY §architecture). */
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Read the persisted session, or null when nothing is stored. */
export async function getSession(): Promise<SessionState | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
  const raw = result[STORAGE_KEYS.SESSION];
  if (!raw || typeof raw !== "object") return null;
  // Trust the shape we wrote ourselves; defensive narrowing is reserved
  // for cross-origin / cross-version migrations.
  return raw as SessionState;
}

/** Replace the entire session object. Called after redeem + refresh. */
export async function setSession(state: SessionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: state });
}

/** Drop the session entirely — used by logout and by any 401 response. */
export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.SESSION);
}

/** Patch the cached license without touching token/email fields. Used by
 *  `fetchMyLicense` to keep the snapshot fresh between full redeems. */
export async function updateCachedLicense(license: License): Promise<void> {
  const current = await getSession();
  if (!current) return; // no session = nothing to cache against
  await setSession({ ...current, cachedLicense: license });
}

/** Return the token only when a session exists AND the token has more than
 *  the safety margin of life left. Callers can use a `null` return as a
 *  signal to redirect to the unpaired UI. */
export async function getValidToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.expiresAt - TOKEN_SAFETY_MARGIN_MS <= Date.now()) return null;
  return session.sessionToken;
}

/** True when a session exists and the token expires within the refresh
 *  window. The popup checks this on open and fires `/refresh` in the
 *  background when it returns true. */
export async function shouldRefresh(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return session.expiresAt - Date.now() < REFRESH_WINDOW_MS;
}
