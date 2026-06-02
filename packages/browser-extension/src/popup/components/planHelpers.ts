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
 * Footer pill text. Mirrors the plugin's Footer.tsx `deriveLabel`
 * (packages/figma-plugin/src/ui/components/footer/Footer.tsx:23-44):
 *   - "Pro" for paid users
 *   - "N/10" for free
 *   - "0/10" placeholder when unpaired (no license loaded yet)
 */
export function usagePillText(license: License | null): string {
  if (!license) return "0/10 imports per month";
  if (license.plan === "pro") return "Pro";
  const limit = license.limits.imports ?? 10;
  return `${license.usage.imports}/${limit} imports per month`;
}


