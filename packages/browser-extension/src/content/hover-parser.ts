/**
 * Hover selector parsing — local to browser-extension content script.
 *
 * NOTE: This file duplicates the logic of
 *   packages/shared/src/w2w-hover.ts → parseHoverSelectorsFromCssText + splitHoverSelector
 *
 * Duplication is intentional: the content script is bundled by Vite into a
 * single IIFE, and pulling functions from `@w2w/shared` triggers code-
 * splitting into chunks that Chrome content scripts cannot load (no ES
 * module imports at runtime). Keeping these tiny pure helpers local keeps
 * the content script self-contained.
 *
 * If you change either side, keep both in sync.
 */

/**
 * Parse a CSSStyleRule.selectorText and return the list of selectors that
 * contain `:hover`, excluding `:not(:hover)` and `::before`/`::after`
 * pseudo-element combinations.
 */
export function parseHoverSelectorsFromCssText(selectorText: string): string[] {
  const result: string[] = [];
  const selectors = splitTopLevel(selectorText, ",");

  for (const rawSel of selectors) {
    const sel = rawSel.trim();
    if (!sel) continue;
    if (findTopLevelHover(sel) < 0) continue;
    // Phase 2: pseudo-element combinations (::before, ::after) are KEPT.
    // splitHoverSelector strips the pseudo-element when forming the trigger.
    result.push(sel);
  }
  return result;
}

/**
 * Split a selector containing `:hover` into a trigger (for forcePseudoState)
 * and a target (where the hover effect manifests).
 *
 * Phase 2: pseudo-elements are STRIPPED from the trigger but preserved in the
 * target — forcing :hover on the host still fires attached `::before`/`::after`
 * transitions (Apple nav underline pattern).
 *
 * Examples:
 *   ".btn:hover"           → { trigger: ".btn",   target: ".btn" }
 *   ".nav:hover .icon"     → { trigger: ".nav",   target: ".nav .icon" }
 *   ".btn:hover::before"   → { trigger: ".btn",   target: ".btn::before" }
 *   ".foo::before:hover"   → { trigger: ".foo",   target: ".foo::before" }
 */
export function splitHoverSelector(
  selector: string,
): { trigger: string; target: string } | null {
  const hoverIdx = findTopLevelHover(selector);
  if (hoverIdx < 0) return null;

  let compoundStart = 0;
  for (let i = hoverIdx - 1; i >= 0; i--) {
    const c = selector[i];
    if (c === " " || c === ">" || c === "+" || c === "~") {
      compoundStart = i + 1;
      break;
    }
  }

  const hoverEnd = hoverIdx + ":hover".length;
  let compoundEnd = selector.length;
  for (let i = hoverEnd; i < selector.length; i++) {
    const c = selector[i];
    if (c === " " || c === ">" || c === "+" || c === "~") {
      compoundEnd = i;
      break;
    }
  }

  const compoundWithHover = selector.slice(compoundStart, compoundEnd);
  const compoundWithoutHover = compoundWithHover
    .replace(/:focus-visible|:focus-within|:hover|:focus|:active/g, "")
    .trim();
  const pseudoMatch = compoundWithoutHover.match(
    /::(?:before|after|first-line|first-letter|placeholder|backdrop|selection|marker)/,
  );
  const pseudoElement = pseudoMatch ? pseudoMatch[0] : "";
  const compoundClean = compoundWithoutHover
    .replace(
      /::(?:before|after|first-line|first-letter|placeholder|backdrop|selection|marker)/g,
      "",
    )
    .trim();
  if (!compoundClean) return null;

  const prefix = selector.slice(0, compoundStart);
  const suffix = selector.slice(compoundEnd);

  const trigger = (prefix + compoundClean).trim();
  const target = (prefix + compoundClean + pseudoElement + suffix).trim();

  if (!trigger) return null;
  return { trigger, target };
}

/**
 * Find the index of a top-level `:hover` token in a selector, ignoring any
 * occurrences inside parentheses (e.g. `:not(:hover)`).
 */
function findTopLevelHover(selector: string): number {
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && selector.slice(i, i + 6) === ":hover") {
      const next = selector[i + 6];
      if (next === undefined || /[ >+~:.#[\),]/.test(next)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Extract the rightmost compound selector from a full CSS selector.
 * Used as a FALLBACK trigger when the full trigger can't resolve due to
 * state-gated prefixes (e.g. `#globalnav.menu-open .link` where `.menu-open`
 * isn't present at capture time).
 */
export function extractRightmostCompound(selector: string): string {
  let depth = 0;
  let lastBreak = -1;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "\\") { i++; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[ >+~]/.test(c)) {
      lastBreak = i;
    }
  }
  return selector.slice(lastBreak + 1).trim();
}

/** Split a string on separator at top level (outside parens/brackets). */
function splitTopLevel(input: string, sep: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && c === sep) {
      result.push(input.slice(start, i));
      start = i + 1;
    }
  }
  result.push(input.slice(start));
  return result;
}
