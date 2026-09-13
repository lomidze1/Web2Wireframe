/**
 * Global memoization for figma.loadFontAsync.
 *
 * Why: Pass 2 profiling on stripe.com measured 18,627 loadFontAsync calls
 * across 697 text nodes — 158.6s, 73% of the whole import. The per-node
 * candidate loops in text.ts re-probe the same family/style cuts (successes
 * AND failures) on every node, and each probe is a real round-trip into
 * Figma's font system (~8.5ms avg). One shared cache answers all repeats.
 *
 * Contract:
 *  - success → cached for the whole plugin session. Figma keeps a loaded font
 *    loaded, so a second loadFontAsync for the same cut can never change the
 *    answer — only waste time.
 *  - failure → cached too (the bulk of the 18,627 calls were repeated
 *    failures), but cleared by resetFontFailures() at the moments fonts may
 *    have just been installed: the start of a new import, and the
 *    font-fallback-choice flow after the user downloads the font ZIP.
 *  - concurrent callers of the same cut share ONE underlying promise.
 *  - loadFontCached never throws — a rejection becomes `false`. Callers that
 *    need throw semantics branch on the boolean.
 *
 * Deliberately NOT used by rebindFonts.ts (Re-apply flow): its whole purpose
 * is re-trying fonts the user installed after the import, so it stays uncached.
 */

/** family/style → shared in-flight-or-settled load attempt. */
const cache = new Map<string, Promise<boolean>>();
/** Keys whose attempt settled as a failure — the part resets can forget. */
const failedKeys = new Set<string>();

/** "\x1f" (unit separator) cannot appear in real font names. */
function keyOf(family: string, style: string): string {
  return family + "\x1f" + style;
}

/**
 * Memoized figma.loadFontAsync. Resolves true when the cut is loaded,
 * false when Figma rejected the load. Never throws.
 */
export function loadFontCached(family: string, style: string): Promise<boolean> {
  const key = keyOf(family, style);
  let attempt = cache.get(key);
  if (!attempt) {
    attempt = figma.loadFontAsync({ family, style }).then(
      () => true,
      () => {
        failedKeys.add(key);
        return false;
      }
    );
    cache.set(key, attempt);
  }
  return attempt;
}

/**
 * Allow failed cuts to be probed again — successes stay cached. Call when
 * fonts may have just been installed (new import, font-fallback-choice).
 *
 * An in-flight attempt that later fails keeps its failedKeys entry for the
 * NEXT reset; deleting only already-settled failures keeps this synchronous.
 */
export function resetFontFailures(): void {
  failedKeys.forEach((key) => cache.delete(key));
  failedKeys.clear();
}

/** Full wipe — for tests only, so module-level state can't leak between them. */
export function resetFontCacheForTests(): void {
  cache.clear();
  failedKeys.clear();
}
