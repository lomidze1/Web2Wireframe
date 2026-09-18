import type { License } from "./licenseClient";

/**
 * Bump this for the next news item — everyone then sees the modal once more.
 * The value is stored per user in clientStorage (sandbox key `w2w_news_seen`).
 */
export const NEWS_ID = `legibly-2026-09-test-${Date.now()}`; // TEMP (owner test): new id on every plugin open = modal every time. Revert to "legibly-2026-09" before commit

/** Tracking parameters tell us how many visits this modal actually sends. */
export const LEGIBLY_URL =
  "https://legibly.design/?utm_source=web2wireframe&utm_medium=plugin&utm_campaign=whats-new";

interface NewsDecisionInput {
  /** Last news id this user dismissed, or null if none. */
  seenId: string | null;
  license: License | null;
  /** Another modal is already on screen. */
  blocked: boolean;
}

/**
 * Whether to show the "What's new" modal on this plugin open. Deliberately not
 * shown to a user who has never imported: activation is the one funnel step
 * that works today, and a first-session promo is not worth risking it.
 */
export function shouldShowNews({ seenId, license, blocked }: NewsDecisionInput): boolean {
  if (blocked) return false;
  if (seenId === NEWS_ID) return false;
  if (!license) return false;
  return license.plan === "pro" || license.usage.imports >= 1;
}
