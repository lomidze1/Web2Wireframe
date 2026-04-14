/**
 * W2W Hover Capture Utilities
 *
 * Shared logic for finding interactive elements in a W2WFrameNode tree
 * and building CSS selectors for hover state re-extraction.
 *
 * Used by:
 * - Browser Extension (background/index.ts) — hover capture in live browser
 * - API backend (w2w-extraction.ts) — hover capture in Puppeteer headless
 */

import type { W2WFrameNode, W2WNode } from "./w2w-types";

/** Tags that are inherently interactive */
const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

/** ARIA roles that indicate interactive elements */
const INTERACTIVE_ROLES = new Set(["button", "link", "tab", "menuitem", "option"]);

/**
 * Escape a CSS class name for use in a selector (handle special chars).
 */
export function escapeCssClass(cls: string): string {
  return cls.replace(/[^a-zA-Z0-9_-]/g, (m: string) => "\\" + m);
}

/**
 * Unescape a CSS-escaped class name back to its raw form.
 * Inverse of escapeCssClass. Used when matching a selector against a tree
 * node's classList (which stores raw, unescaped class names).
 */
function unescapeCssIdentifier(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/**
 * Build the canonical CSS selector for a W2WFrameNode, using the same priority
 * as w2wFindInteractiveNodes: #id > tag.class1.class2 > tag[href] > tag[role] > null.
 */
function buildSelectorForNode(node: W2WFrameNode): string | null {
  const tag = node.tag;
  const id = node.attr?.id;
  if (id) {
    return `#${escapeCssClass(String(id))}`;
  }
  if (node.classList.length > 0) {
    const classes = node.classList
      .map((c: string) => escapeCssClass(c))
      .join(".");
    return `${tag}.${classes}`;
  }
  if (node.attr?.href) {
    return `${tag}[href="${String(node.attr.href).replace(/"/g, '\\"')}"]`;
  }
  const role = node.attr?.role as string | undefined;
  if (role) {
    return `${tag}[role="${role}"]`;
  }
  return null;
}

/**
 * Find interactive elements in a W2WFrameNode tree that could have hover states.
 * Returns nodes with CSS selectors for re-querying in the DOM.
 *
 * Detection: <a>, <button>, <input>, <select>, <textarea>,
 * [role=button|link|tab|menuitem|option], [tabindex] (not -1).
 *
 * Selector priority: #id > tag.class1.class2 > tag[href] > tag[role] > null
 *
 * @param frame Root W2WFrameNode to search
 * @param maxResults Maximum interactive nodes to return (default 100)
 * @returns Array of {node, selector} pairs
 */
export function w2wFindInteractiveNodes(
  frame: W2WFrameNode,
  maxResults = 100,
): Array<{ node: W2WFrameNode; selector: string | null }> {
  const results: Array<{ node: W2WFrameNode; selector: string | null }> = [];

  function walk(node: W2WNode): void {
    if (node.type === "FRAME") {
      const tag = node.tag;
      const role = node.attr?.role as string | undefined;
      const isInteractive =
        INTERACTIVE_TAGS.has(tag) ||
        (role != null && INTERACTIVE_ROLES.has(role)) ||
        (node.attr?.tabindex != null && String(node.attr.tabindex) !== "-1");

      if (isInteractive) {
        results.push({ node, selector: buildSelectorForNode(node) });
      }

      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(frame);

  // Limit to avoid excessive CDP calls
  return results.slice(0, maxResults);
}

// ===========================================================================
// Stylesheet-based hover discovery (FIX 1)
// ===========================================================================

/**
 * Split a selector containing `:hover` into a trigger (where forcePseudoState
 * should be applied) and a target (where the hover effect manifests).
 *
 * Examples:
 *   ".btn:hover"           → { trigger: ".btn", target: ".btn" }
 *   ".nav:hover .icon"     → { trigger: ".nav", target: ".nav .icon" }
 *   ".card:hover > span"   → { trigger: ".card", target: ".card > span" }
 *   "a.link:hover"         → { trigger: "a.link", target: "a.link" }
 *   ".btn:hover::before"   → null  (pseudo-element, skip — forcePseudoState on ::before not supported)
 *
 * Returns `null` if the selector contains pseudo-element (::before/::after)
 * combined with :hover, as those cannot be captured via forcePseudoState.
 */
export function splitHoverSelector(
  selector: string,
): { trigger: string; target: string } | null {
  // Reject pseudo-element combinations (::before, ::after, etc.)
  if (/::/.test(selector)) return null;

  // Split selector into "parts" by top-level whitespace or combinators.
  // The `:hover` appears on some compound at position i; everything before
  // i (inclusive, minus :hover) is the trigger, and we strip :hover from the
  // compound to build the target.
  //
  // Simpler approach: find the LAST `:hover` occurrence (outside brackets),
  // walk left to find the start of its compound, then the trigger = prefix
  // up to and including that compound (minus `:hover` token).

  // Work char-by-char to respect parentheses (for :not(:hover) etc.).
  // But we already filter :not(:hover) upstream, so we can keep this simple.
  const hoverIdx = findTopLevelHover(selector);
  if (hoverIdx < 0) return null;

  // Find the start of the compound containing :hover.
  // A compound is bounded on the left by whitespace or a combinator (>, +, ~).
  let compoundStart = 0;
  for (let i = hoverIdx - 1; i >= 0; i--) {
    const c = selector[i];
    if (c === " " || c === ">" || c === "+" || c === "~") {
      compoundStart = i + 1;
      break;
    }
  }

  // Find end of the :hover token (advance past ":hover")
  const hoverEnd = hoverIdx + ":hover".length;

  // Find end of compound (next whitespace/combinator, or end of string).
  let compoundEnd = selector.length;
  for (let i = hoverEnd; i < selector.length; i++) {
    const c = selector[i];
    if (c === " " || c === ">" || c === "+" || c === "~") {
      compoundEnd = i;
      break;
    }
  }

  // Trigger = prefix + compound (with :hover and other interactive pseudo-
  // classes stripped, so the trigger is a usable querySelector target).
  const compoundWithHover = selector.slice(compoundStart, compoundEnd);
  const compoundWithoutHover = compoundWithHover
    .replace(/:focus-visible|:focus-within|:hover|:focus|:active/g, "")
    .trim();
  if (!compoundWithoutHover) return null;

  const prefix = selector.slice(0, compoundStart);
  const suffix = selector.slice(compoundEnd);

  const trigger = (prefix + compoundWithoutHover).trim();
  const target = (prefix + compoundWithoutHover + suffix).trim();

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
      // Must not be :hover inside a larger token like :hover-foo — :hover
      // must end at a boundary (end-of-string, space, combinator, `:`, `.`,
      // `#`, `[`, or `)`).
      const next = selector[i + 6];
      if (
        next === undefined ||
        /[ >+~:.#\[\),]/.test(next)
      ) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parse a CSSStyleRule.selectorText (which may contain multiple comma-
 * separated selectors) and return the list of selectors that contain
 * `:hover`, filtering out:
 *   - `:not(:hover)`
 *   - `::before` / `::after` combined with `:hover`
 *
 * @example
 *   parseHoverSelectorsFromCssText(".a:hover, .b:hover, .c")
 *   // → [".a:hover", ".b:hover"]
 */
export function parseHoverSelectorsFromCssText(selectorText: string): string[] {
  const result: string[] = [];
  const selectors = splitTopLevel(selectorText, ",");

  for (const rawSel of selectors) {
    const sel = rawSel.trim();
    if (!sel) continue;

    // Quick filters
    const topLevelHoverIdx = findTopLevelHover(sel);
    if (topLevelHoverIdx < 0) continue;

    // Reject pseudo-element combinations (::before, ::after, etc.)
    if (/::/.test(sel)) continue;

    result.push(sel);
  }

  return result;
}

/**
 * Split a string on a separator, ignoring occurrences inside parentheses or
 * brackets. Used for comma-splitting CSS selector lists.
 */
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

/**
 * Walk a W2WFrameNode tree (DFS) and return the first FRAME node matching a
 * simple CSS selector.
 *
 * Supported selectors:
 *   - `#id`
 *   - `.class1.class2` (one or more classes)
 *   - `tag`
 *   - `tag.class1.class2`
 *   - `tag#id`
 *
 * NOT supported:
 *   - descendant/child combinators (` `, `>`, `+`, `~`)
 *   - attribute selectors (`[attr=val]`)
 *   - pseudo-classes (`:hover`, etc.)
 *
 * The intent is to match a selector that comes from stylesheet hover parsing
 * (where the trigger is a single compound selector) against the in-memory
 * W2W tree. For more complex selectors, the caller should fall back to
 * DOM.querySelector via CDP.
 */
export function findNodeBySelector(
  frame: W2WFrameNode,
  selector: string,
): W2WFrameNode | null {
  const matcher = compileSimpleSelector(selector);
  if (!matcher) return null;

  const predicate = matcher;
  function walk(node: W2WNode): W2WFrameNode | null {
    if (node.type !== "FRAME") return null;
    if (predicate(node)) return node;
    for (const child of node.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }

  return walk(frame);
}

/**
 * Compile a simple compound CSS selector into a predicate function.
 * Returns null for unsupported selectors.
 */
function compileSimpleSelector(
  selector: string,
): ((node: W2WFrameNode) => boolean) | null {
  const s = selector.trim();
  if (!s) return null;

  // Reject combinators and unsupported syntax — this function only handles
  // compound selectors.
  if (/[ >+~]/.test(s)) return null;
  if (s.includes("[")) return null;
  // Reject pseudo-classes (unescaped `:`). Escaped `\:` inside a class name
  // (e.g. Tailwind `md\:hidden`) is allowed.
  if (/(?:^|[^\\]):/.test(s)) return null;

  // Parse tokens: tag? (#id | .class)*
  let tag: string | null = null;
  let id: string | null = null;
  const classes: string[] = [];

  let i = 0;
  // Optional leading tag
  if (/[a-zA-Z]/.test(s[0] ?? "")) {
    const m = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s);
    if (m) {
      tag = m[0];
      i = m[0].length;
    }
  }

  while (i < s.length) {
    const c = s[i];
    if (c === "#") {
      const m = /^#([^.#]+)/.exec(s.slice(i));
      if (!m) return null;
      id = unescapeCssIdentifier(m[1]);
      i += m[0].length;
    } else if (c === ".") {
      const m = /^\.([^.#]+)/.exec(s.slice(i));
      if (!m) return null;
      classes.push(unescapeCssIdentifier(m[1]));
      i += m[0].length;
    } else {
      return null; // unexpected char
    }
  }

  return (node: W2WFrameNode) => {
    if (tag && node.tag !== tag) return false;
    if (id && String(node.attr?.id ?? "") !== id) return false;
    for (const cls of classes) {
      if (!node.classList.includes(cls)) return false;
    }
    return true;
  };
}

// ===========================================================================
// FIX 4 — Descendant hover propagation (parent-hover → child-visible case)
// ===========================================================================

/**
 * Recursively propagate the hover subtree down to matching descendants.
 *
 * After CDP `forcePseudoState` + re-extraction, only the ROOT node has
 * `.hover` set. This helper walks both trees in parallel and assigns the
 * corresponding hover subtree to each matching `normalChild.hover`, so
 * `computeHoverDiff` in the plugin can detect per-descendant style changes.
 *
 * Use case: `.globalnav-item:hover #globalnav-curtain` — the curtain child
 * becomes visible on parent hover. After this call, curtain's
 * `normal.hover` points to its hover-state sibling, so the plugin creates
 * a proper hover variant for the curtain even though the nav-item's own
 * styles didn't change.
 *
 * Matching rule: by child INDEX + tag equality. Pairs with differing tags
 * are skipped (common if hover adds/removes elements via display changes).
 * TEXT/SVG children are skipped (hover doesn't apply to leaves).
 *
 * The root's own `.hover` must already be set by the caller — this helper
 * only propagates into descendants.
 */
export function attachHoverToDescendants(
  normal: W2WFrameNode,
  hover: W2WFrameNode,
): void {
  const normalChildren = normal.children;
  const hoverChildren = hover.children;
  const pairCount = Math.min(normalChildren.length, hoverChildren.length);

  for (let i = 0; i < pairCount; i++) {
    const nc = normalChildren[i];
    const hc = hoverChildren[i];
    // Only recurse into FRAME ↔ FRAME pairs.
    if (nc.type !== "FRAME" || hc.type !== "FRAME") continue;
    // Require tag equality so we don't mismatch when hover restructures DOM.
    if (nc.tag !== hc.tag) continue;

    nc.hover = hc;
    attachHoverToDescendants(nc, hc);
  }
}

/**
 * Extended hover-candidate finder.
 *
 * Returns ALL nodes that should be probed with `CSS.forcePseudoState`, by
 * combining two discovery strategies:
 *   1. Interactive tag/role detection (via `w2wFindInteractiveNodes`)
 *   2. Stylesheet-derived selectors (passed in as `extraSelectors`)
 *
 * The extra selectors come from the content script's `collectHoverSelectors()`
 * — they are the "trigger" half of each `:hover` selector parsed from
 * document.styleSheets. For each extra selector, we walk the tree to find
 * the matching W2WFrameNode and add it to the result (deduped by node ref).
 *
 * @param frame Root W2WFrameNode to search
 * @param extraSelectors Additional CSS selectors from stylesheet parsing
 * @param maxResults Maximum nodes to return (default 200)
 */
export function w2wFindHoverCandidates(
  frame: W2WFrameNode,
  extraSelectors: string[] = [],
  maxResults = 200,
): Array<{ node: W2WFrameNode; selector: string | null }> {
  // Start with interactive tag discovery (unchanged from legacy behavior).
  // Use a high cap here — final capping happens below against maxResults.
  const base = w2wFindInteractiveNodes(frame, maxResults);
  const results: Array<{ node: W2WFrameNode; selector: string | null }> = [...base];
  const seen = new Set<W2WFrameNode>(base.map((r) => r.node));

  for (const sel of extraSelectors) {
    if (results.length >= maxResults) break;
    const node = findNodeBySelector(frame, sel);
    if (!node) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    results.push({ node, selector: buildSelectorForNode(node) });
  }

  return results.slice(0, maxResults);
}
