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
 * Detection (Phase 2):
 *   - tags:   <a>, <button>, <input>, <select>, <textarea>
 *   - roles:  button, link, tab, menuitem, option
 *   - [tabindex] (not -1)
 *   - `cursor: pointer` — catches `<div onclick>` clickables
 *
 * Selector priority: #id > tag.class1.class2 > tag[href] > tag[role] > null
 *
 * @param frame Root W2WFrameNode to search
 * @param maxResults Maximum interactive nodes to return (default 500, Phase 2)
 * @returns Array of {node, selector} pairs
 */
export function w2wFindInteractiveNodes(
  frame: W2WFrameNode,
  maxResults = 500,
): Array<{ node: W2WFrameNode; selector: string | null }> {
  const results: Array<{ node: W2WFrameNode; selector: string | null }> = [];

  function walk(node: W2WNode): void {
    if (node.type === "FRAME") {
      const tag = node.tag;
      const role = node.attr?.role as string | undefined;
      const tabindex = node.attr?.tabindex;
      const cursor = node.styles?.cursor;
      const isInteractive =
        INTERACTIVE_TAGS.has(tag) ||
        (role != null && INTERACTIVE_ROLES.has(role)) ||
        (tabindex != null && String(tabindex) !== "-1") ||
        cursor === "pointer";

      if (isInteractive) {
        results.push({ node, selector: buildSelectorForNode(node) });
      }

      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(frame);

  if (results.length > maxResults) {
     
    console.warn(
      `[w2w-hover] Truncated interactive-node pool: found ${results.length}, cap=${maxResults}`,
    );
    return results.slice(0, maxResults);
  }

  return results;
}

// ===========================================================================
// Stylesheet-based hover discovery (FIX 1)
// ===========================================================================

/**
 * Split a selector containing `:hover` into a trigger (where forcePseudoState
 * should be applied) and a target (where the hover effect manifests).
 *
 * Examples:
 *   ".btn:hover"           → { trigger: ".btn",   target: ".btn" }
 *   ".nav:hover .icon"     → { trigger: ".nav",   target: ".nav .icon" }
 *   ".card:hover > span"   → { trigger: ".card",  target: ".card > span" }
 *   "a.link:hover"         → { trigger: "a.link", target: "a.link" }
 *   ".btn:hover::before"   → { trigger: ".btn",   target: ".btn::before" }
 *   ".foo::before:hover"   → { trigger: ".foo",   target: ".foo::before" }
 *
 * Pseudo-elements (`::before`, `::after`, …) are STRIPPED from the trigger
 * because `forcePseudoState :hover` on the host still fires the transition of
 * the attached pseudo-element (Apple nav uses exactly this pattern for the
 * underline sweep).
 */
export function splitHoverSelector(
  selector: string,
): { trigger: string; target: string } | null {

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

  // Trigger = prefix + compound with :hover, other interactive pseudo-classes,
  // AND pseudo-elements stripped, so the trigger is a usable querySelector
  // target. Target preserves the pseudo-element (for logging / debugging).
  const compoundWithHover = selector.slice(compoundStart, compoundEnd);
  const compoundWithoutHover = compoundWithHover
    .replace(/:focus-visible|:focus-within|:hover|:focus|:active/g, "")
    .trim();
  // Extract pseudo-element (if any) so we can reattach it in `target`.
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
      // Must not be :hover inside a larger token like :hover-foo — :hover
      // must end at a boundary (end-of-string, space, combinator, `:`, `.`,
      // `#`, `[`, or `)`).
      const next = selector[i + 6];
      if (
        next === undefined ||
        /[ >+~:.#[),]/.test(next)
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

    const topLevelHoverIdx = findTopLevelHover(sel);
    if (topLevelHoverIdx < 0) continue;

    // Pseudo-element combinations (::before, ::after, …) ARE kept. Apple-
    // style nav underlines use `.link:hover::before` and we strip the
    // pseudo-element inside `splitHoverSelector` when forming the trigger.
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
 * CSS selector.
 *
 * Supported (Phase 2):
 *   - compound: `tag`, `.class`, `#id`, `[attr]`, `[attr="val"]`, and any
 *     combination thereof (e.g. `a.link[href="/x"]`)
 *   - descendant, child, sibling combinators: ` `, `>`, `+`, `~`
 *
 * Matching rule for selectors with combinators: we match the **rightmost
 * compound** only. The prefix is treated as a hint — dropped if it would
 * exclude valid hover candidates (e.g. Apple's state-gated selectors like
 * `#globalnav.globalnav-with-menu-open .link` where the state class isn't
 * present at capture time).
 */
export function findNodeBySelector(
  frame: W2WFrameNode,
  selector: string,
): W2WFrameNode | null {
  // Extract rightmost compound. Combinators (` `, `>`, `+`, `~`) separate
  // compounds; we take the one furthest right.
  const rightmost = extractRightmostCompound(selector.trim());
  if (!rightmost) return null;

  const matcher = compileSimpleSelector(rightmost);
  if (!matcher) return null;

  function walk(node: W2WNode): W2WFrameNode | null {
    if (node.type !== "FRAME") return null;
    if (matcher!(node)) return node;
    for (const child of node.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }

  return walk(frame);
}

/**
 * Extract the rightmost compound selector from a full CSS selector,
 * respecting brackets/parens and escaped characters.
 *
 * Examples:
 *   ".nav-link"                    → ".nav-link"
 *   "#nav .link"                   → ".link"
 *   "ul > li.item"                 → "li.item"
 *   ".a + .b"                      → ".b"
 *   'a.link[href="/x"]'            → 'a.link[href="/x"]'
 *   '#globalnav .globalnav-link'   → '.globalnav-link'
 */
function extractRightmostCompound(selector: string): string {
  let depth = 0;
  let lastBreak = -1;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "\\") {
      i++; // skip next char
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[ >+~]/.test(c)) {
      lastBreak = i;
    }
  }
  return selector.slice(lastBreak + 1).trim();
}

interface AttrMatch {
  name: string;
  value: string | null; // null = presence only
}

/**
 * Compile a single compound CSS selector (no combinators) into a predicate.
 * Supports tag, #id, .class, [attr], [attr="value"]. Returns null for
 * unsupported syntax.
 */
function compileSimpleSelector(
  selector: string,
): ((node: W2WFrameNode) => boolean) | null {
  const s = selector.trim();
  if (!s) return null;

  // No combinators at this level — caller is expected to have split them.
  if (/(?:^|[^\\])\s|[>+~]/.test(s)) return null;
  // Reject pseudo-classes (unescaped `:`). Escaped `\:` allowed (Tailwind).
  // But `[attr="val"]` can contain `:` inside brackets — the walker below
  // handles brackets, so we only reject `:` OUTSIDE brackets.
  if (hasTopLevelPseudoClass(s)) return null;

  let tag: string | null = null;
  let id: string | null = null;
  const classes: string[] = [];
  const attrs: AttrMatch[] = [];

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
      const m = /^#([^.#[]+)/.exec(s.slice(i));
      if (!m) return null;
      id = unescapeCssIdentifier(m[1]);
      i += m[0].length;
    } else if (c === ".") {
      const m = /^\.([^.#[]+)/.exec(s.slice(i));
      if (!m) return null;
      classes.push(unescapeCssIdentifier(m[1]));
      i += m[0].length;
    } else if (c === "[") {
      const end = s.indexOf("]", i);
      if (end === -1) return null;
      const expr = s.slice(i + 1, end).trim();
      const eqIdx = expr.indexOf("=");
      if (eqIdx === -1) {
        attrs.push({ name: expr, value: null });
      } else {
        const name = expr.slice(0, eqIdx).trim();
        // Strip matcher suffix chars (`^`, `$`, `*`, `|`, `~`) — Phase 2 treats
        // them all as equality for simplicity.
        const cleanName = name.replace(/[\^$*|~]$/, "");
        let value = expr.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        attrs.push({ name: cleanName, value });
      }
      i = end + 1;
    } else {
      return null;
    }
  }

  return (node: W2WFrameNode) => {
    if (tag && node.tag !== tag) return false;
    if (id && String(node.attr?.id ?? "") !== id) return false;
    for (const cls of classes) {
      if (!node.classList.includes(cls)) return false;
    }
    for (const attr of attrs) {
      const actual = node.attr?.[attr.name];
      if (attr.value === null) {
        if (actual === undefined || actual === null) return false;
      } else {
        if (String(actual) !== attr.value) return false;
      }
    }
    return true;
  };
}

/** True if the selector contains an unescaped `:` OUTSIDE any `[...]`. */
function hasTopLevelPseudoClass(s: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (depth === 0 && c === ":") return true;
  }
  return false;
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
  maxResults = 500,
): Array<{ node: W2WFrameNode; selector: string | null }> {
  const base = w2wFindInteractiveNodes(frame, maxResults);
  const results: Array<{ node: W2WFrameNode; selector: string | null }> = [...base];
  const seen = new Set<W2WFrameNode>(base.map((r) => r.node));
  let truncatedExtras = 0;

  for (const sel of extraSelectors) {
    if (results.length >= maxResults) {
      truncatedExtras++;
      continue;
    }
    const node = findNodeBySelector(frame, sel);
    if (!node) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    results.push({ node, selector: buildSelectorForNode(node) });
  }

  if (truncatedExtras > 0) {
     
    console.warn(
      `[w2w-hover] Truncated ${truncatedExtras} extra selectors past cap=${maxResults}`,
    );
  }

  return results;
}
