/**
 * Locale-aware currency formatting helpers.
 *
 * `Intl.NumberFormat` adapts to the user's browser locale, so a US visitor
 * sees `$16.00` while an EU visitor sees `US$16.00` (or `$16.00 USD` in
 * some locales). We deliberately format USD-as-USD everywhere because:
 *
 *   1. Flitt actually charges in USD regardless of where the customer
 *      sits. Showing EUR equivalents would imply we charge in EUR, which
 *      we don't (and the customer's bank applies its own FX margin).
 *   2. A "$16" headline price stays compatible with the receipt email,
 *      Terms, and Privacy copy — no number drift across surfaces.
 */

const FALLBACK_LOCALE = "en-US";

function resolveLocale(): string {
  if (typeof navigator === "undefined") return FALLBACK_LOCALE;
  return navigator.language || FALLBACK_LOCALE;
}

/**
 * Format a cents-based USD amount for display. Returns e.g. "$16.00".
 *
 * Use this any time we render a price in the web UI — keeps the formatting
 * consistent if we ever change locale rules without hunting hard-coded
 * strings.
 */
export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat(resolveLocale(), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Compact integer-only USD ($16 not $16.00) — for hero headlines where
 * the decimals add visual noise. Same locale handling.
 */
export function formatUsdCentsShort(cents: number): string {
  return new Intl.NumberFormat(resolveLocale(), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Heuristic — `Intl.DateTimeFormat` is the most reliable EU signal. */
export function isLikelyEuVisitor(): boolean {
  if (typeof Intl === "undefined") return false;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return tz.startsWith("Europe/");
  } catch {
    return false;
  }
}
