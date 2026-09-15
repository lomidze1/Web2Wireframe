import type { License } from "./licenseClient";

/** What the UI may say about the free import allowance. */
export type QuotaInfo =
  | { unlimited: true }
  | { unlimited: false; remaining: number; limit: number; nearLimit: boolean };

/** Same threshold as the footer pill's warning state. */
const NEAR_LIMIT = 2;

/**
 * Reduce a license to what the allowance copy needs. `null` means "unknown" —
 * callers show no count rather than a guessed one; the server's 403 stays the
 * real gate either way.
 */
export function deriveQuota(license: License | null): QuotaInfo | null {
  if (!license) return null;
  const limit = license.limits.imports;
  if (license.plan === "pro" || limit === null) return { unlimited: true };
  const remaining = Math.max(0, limit - license.usage.imports);
  return { unlimited: false, remaining, limit, nearLimit: remaining <= NEAR_LIMIT };
}
