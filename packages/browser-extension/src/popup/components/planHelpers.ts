/**
 * Pure derivation helpers for PlanModal. Byte-for-byte the same logic as
 * the plugin's inline helpers in
 * packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx:34-47
 * and lines 198-216 — extracted here so PlanModal.tsx stays readable and
 * the math has a unit-testable surface.
 */

import type { License } from "../../shared/types";

/** Whole days remaining until `iso`, never negative. Invalid ISO → 0. */
export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Countdown phrase mirroring the plugin's copy: "today" / "in 1 day" / "in N days". */
export function inDaysPhrase(iso: string): string {
  const d = daysUntil(iso);
  if (d <= 0) return "today";
  if (d === 1) return "in 1 day";
  return `in ${d} days`;
}

/**
 * Badge label. "FREE" for free; "PRO · MONTHLY" / "PRO · YEARLY" when we
 * know the duration; bare "PRO" when the subscription doc lacks
 * `lastDuration` (legacy licenses written before the field existed).
 */
export function planLabel(license: License): string {
  const base = license.plan.toUpperCase();
  if (license.plan !== "pro") return base;
  const tier = license.subscription?.lastDuration;
  if (tier === "yearly") return `${base} · YEARLY`;
  if (tier === "monthly") return `${base} · MONTHLY`;
  return base;
}

/**
 * Usage row text. Free: "3/10 imports this month". Pro (unlimited):
 * "N imports this cycle (unlimited)". Matches plugin Plan.tsx:211-216.
 */
export function limitText(license: License): string {
  if (license.limits.imports === null) {
    return `${license.usage.imports} imports this cycle (unlimited)`;
  }
  return `${license.usage.imports}/${license.limits.imports} imports this month`;
}

/**
 * Footer pill text, or `null` when there is nothing truthful to say — the
 * footer hides the slot entirely in that case.
 *
 * Deliberately diverges from the plugin's Footer.tsx `deriveLabel`, which
 * falls back to a "0/10" placeholder: the plugin is where imports are actually
 * spent, so a count belongs there. Capture needs no sign-in and never touches
 * the quota, so an unpaired extension user would only ever see a frozen zero.
 *   - "Pro" for paid users
 *   - "N/10 imports per month" for free
 *   - null when no license is loaded (signed out, or not fetched yet)
 */
export function usagePillText(license: License | null): string | null {
  if (!license) return null;
  if (license.plan === "pro") return "Pro";
  const limit = license.limits.imports ?? 10;
  return `${license.usage.imports}/${limit} imports per month`;
}


