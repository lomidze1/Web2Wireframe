/**
 * Pseudo-state Capture (Layer #2)
 *
 * Forces :hover pseudo-state via CSS.forcePseudoState, captures matched styles,
 * diffs against normal state, and returns only changed properties.
 */

import type { CDPClientInterface, CDPMatchedStyles, PseudoStateStyles } from "./types";
import type { ParsedSnapshotNode } from "./snapshot";
import { getMatchedStylesForNode } from "./css";

// ============================================================================
// INTERACTIVE NODE DETECTION
// ============================================================================

/** Tags that are inherently interactive */
const INTERACTIVE_TAGS = new Set([
  "button", "a", "input", "select", "textarea",
]);

/** ARIA roles that imply interactivity */
const INTERACTIVE_ROLES = new Set([
  "button", "link", "tab", "menuitem",
]);

/**
 * Find interactive elements that likely have :hover/:focus styles.
 * Filters to visible elements only (bounds > 0).
 */
export function findInteractiveNodes(
  nodes: ParsedSnapshotNode[]
): ParsedSnapshotNode[] {
  return nodes.filter((node) => {
    // Must be an element node
    if (node.nodeType !== 1) return false;

    // Must be visible (has non-zero bounds)
    if (!node.bounds || (node.bounds.width <= 0 && node.bounds.height <= 0)) {
      return false;
    }

    const tag = node.nodeName.toLowerCase();

    // Interactive by tag
    if (INTERACTIVE_TAGS.has(tag)) return true;

    // Interactive by ARIA role
    const role = node.attributes.role;
    if (role && INTERACTIVE_ROLES.has(role)) return true;

    // Interactive by cursor style
    if (node.computedStyles.cursor === "pointer") return true;

    // Explicitly focusable
    if ("tabindex" in node.attributes) return true;

    return false;
  });
}

// ============================================================================
// MATCHED RULES FLATTENING
// ============================================================================

/**
 * Flatten CDPMatchedStyles into a flat property map.
 * Later rules override earlier ones (CSS specificity order — CDP returns low-to-high).
 * User-agent rules are excluded.
 * Inline styles override everything.
 */
export function flattenMatchedRules(
  matchedStyles: CDPMatchedStyles
): Record<string, string> {
  const result: Record<string, string> = {};

  // Matched CSS rules (in specificity order, low → high)
  for (const entry of matchedStyles.matchedCSSRules) {
    // Skip user-agent styles
    if (entry.rule.origin === "user-agent") continue;

    for (const prop of entry.rule.style.cssProperties) {
      if (prop.value && prop.value !== "initial" && !prop.disabled) {
        result[prop.name] = prop.value;
      }
    }
  }

  // Inline styles override matched rules
  if (matchedStyles.inlineStyle) {
    for (const prop of matchedStyles.inlineStyle.cssProperties) {
      if (prop.value && prop.value !== "initial" && !prop.disabled) {
        result[prop.name] = prop.value;
      }
    }
  }

  return result;
}

// Phase A2 (h2d-parity) — properties where the browser may serialize
// `prop.value` as the COMPUTED form (e.g. `matrix(...)` for transform,
// composed kernel for filter) while the SOURCE rule text is preserved
// in `prop.text`. Capturing both lets the renderer prefer the source
// form, sidestepping mid-transition matrix interpolation.
const SOURCE_TEXT_PROPS = new Set(["transform", "filter"]);

/**
 * Extract source-text values for SOURCE_TEXT_PROPS from matched rules.
 * Returns only properties where the source text differs from prop.value
 * (no point emitting transform2 if it equals transform). Preserves cascade
 * order: later rules override earlier ones; inline overrides matched.
 */
function extractSourceTextProps(
  matchedStyles: CDPMatchedStyles
): Record<string, string> {
  const result: Record<string, string> = {};

  const captureFrom = (props: Array<{ name: string; value: string; text?: string; disabled?: boolean }>) => {
    for (const prop of props) {
      if (!SOURCE_TEXT_PROPS.has(prop.name) || prop.disabled) continue;
      if (!prop.value || prop.value === "initial") continue;

      // Strip "name:" prefix and trailing ";"/"!important" from prop.text.
      let sourceValue = prop.value;
      if (prop.text) {
        const colonIdx = prop.text.indexOf(":");
        if (colonIdx >= 0) {
          sourceValue = prop.text
            .substring(colonIdx + 1)
            .trim()
            .replace(/;$/, "")
            .replace(/\s*!important\s*$/, "")
            .trim();
        }
      }
      result[prop.name] = sourceValue;
    }
  };

  for (const entry of matchedStyles.matchedCSSRules) {
    if (entry.rule.origin === "user-agent") continue;
    captureFrom(entry.rule.style.cssProperties);
  }
  if (matchedStyles.inlineStyle) {
    captureFrom(matchedStyles.inlineStyle.cssProperties);
  }

  return result;
}

// ============================================================================
// FORCED PSEUDO-STATE STYLE CAPTURE (GENERIC)
// ============================================================================

/** Supported CSS pseudo-classes for forced state capture */
export type ForcedPseudoClass = "hover" | "focus" | "active" | "focus-visible";

/**
 * Force a pseudo-state on a node, fetch matched styles, diff against normal state.
 * ALWAYS clears forced state in finally block.
 *
 * @param client - CDP client
 * @param nodeId - DOM nodeId
 * @param normalMatchedStyles - Normal (non-forced) matched styles for diffing
 * @param pseudoClass - Which pseudo-class to force ("hover", "focus", "active", "focus-visible")
 * @returns Changed properties only, or null if no difference.
 */
export async function captureForcedPseudoStyles(
  client: CDPClientInterface,
  nodeId: number,
  normalMatchedStyles: CDPMatchedStyles,
  pseudoClass: ForcedPseudoClass
): Promise<Record<string, string> | null> {
  try {
    // 1. Force pseudo-state
    await client.send("CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: [pseudoClass],
    });

    // 2. Fetch matched styles while state is forced
    const forcedStyles = await getMatchedStylesForNode(client, nodeId);
    if (!forcedStyles) return null;

    // 3. Diff: only properties that changed
    const normalProps = flattenMatchedRules(normalMatchedStyles);
    const forcedProps = flattenMatchedRules(forcedStyles);

    const diff: Record<string, string> = {};
    // Properties changed or added in forced state
    for (const [key, value] of Object.entries(forcedProps)) {
      if (normalProps[key] !== value) {
        diff[key] = value;
      }
    }
    // Properties removed in forced state (present in normal, absent in forced)
    for (const key of Object.keys(normalProps)) {
      if (!(key in forcedProps)) {
        diff[key] = "__removed__";
      }
    }

    // Phase A2 (h2d-parity): for each source-text prop that changed, emit
    // a `<name>2` field with the source rule text. The renderer prefers it
    // over the computed form when both are present.
    const forcedSource = extractSourceTextProps(forcedStyles);
    for (const propName of SOURCE_TEXT_PROPS) {
      if (!(propName in diff)) continue;       // only when prop changed
      if (diff[propName] === "__removed__") continue;
      const sourceText = forcedSource[propName];
      if (sourceText && sourceText !== diff[propName]) {
        diff[`${propName}2`] = sourceText;
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  } catch {
    // Node may have been detached or removed — skip gracefully
    return null;
  } finally {
    // ALWAYS clear forced state
    try {
      await client.send("CSS.forcePseudoState", {
        nodeId,
        forcedPseudoClasses: [],
      });
    } catch {
      // Cleanup failure is non-fatal (node may already be gone)
    }
  }
}

/**
 * Force :hover on a node, fetch matched styles, diff against normal state.
 * Convenience wrapper around captureForcedPseudoStyles for backward compatibility.
 */
export async function captureForcedHoverStyles(
  client: CDPClientInterface,
  nodeId: number,
  normalMatchedStyles: CDPMatchedStyles
): Promise<Record<string, string> | null> {
  return captureForcedPseudoStyles(client, nodeId, normalMatchedStyles, "hover");
}

// ============================================================================
// TRANSITION DISABLE — kill CSS transitions/animations during capture so
// `CSS.forcePseudoState` followed by `CSS.getMatchedStylesForNode` reads
// the STABLE post-force computed style instead of a mid-transition
// interpolant. Without this, transforms like `translateY(-2px)` sample as
// mid-animation matrix values (e.g. `matrix(1,0,0,1,0,-0.184126)`) which
// (a) fail our MIN_SHIFT=0.25 threshold in the render layer, and (b)
// produce per-element jitter that defeats content-signature dedup.
// ============================================================================

const TRANSITION_KILLER_STYLE_ID = "w2w-pseudo-capture-disable-transitions";

async function disableTransitions(client: CDPClientInterface): Promise<void> {
  const expression = `
    (() => {
      if (document.getElementById('${TRANSITION_KILLER_STYLE_ID}')) return;
      const s = document.createElement('style');
      s.id = '${TRANSITION_KILLER_STYLE_ID}';
      s.textContent = \`
        *, *::before, *::after {
          transition: none !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          animation-duration: 0s !important;
          animation-delay: 0s !important;
        }
      \`;
      (document.head || document.documentElement).appendChild(s);
    })();
  `;
  try {
    await client.send("Runtime.evaluate", { expression, returnByValue: true });
  } catch {
    // Non-fatal — capture proceeds; values may be slightly jittery.
  }
}

async function restoreTransitions(client: CDPClientInterface): Promise<void> {
  const expression = `
    (() => {
      const el = document.getElementById('${TRANSITION_KILLER_STYLE_ID}');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    })();
  `;
  try {
    await client.send("Runtime.evaluate", { expression, returnByValue: true });
  } catch {
    // Non-fatal — a stale <style> tag is harmless.
  }
}

// ============================================================================
// BATCH PSEUDO-STATE CAPTURE
// ============================================================================

/**
 * Capture pseudo-state styles for multiple nodes with concurrency limiting.
 *
 * @param client - CDP client
 * @param nodes - Array of { backendNodeId, nodeId } for interactive nodes
 * @param normalStylesMap - Map from backendNodeId to normal CDPMatchedStyles
 * @param options - { concurrency: max parallel CDP operations }
 * @returns Map from backendNodeId to PseudoStateStyles
 */
export async function capturePseudoStatesForNodes(
  client: CDPClientInterface,
  nodes: Array<{ backendNodeId: number; nodeId: number }>,
  normalStylesMap: Map<number, CDPMatchedStyles>,
  options: { concurrency?: number } = {}
): Promise<Map<number, PseudoStateStyles>> {
  const { concurrency = 5 } = options;
  const result = new Map<number, PseudoStateStyles>();

  if (nodes.length === 0) return result;

  /** All pseudo-classes to capture */
  const PSEUDO_CLASSES: ForcedPseudoClass[] = ["hover", "focus", "active", "focus-visible"];

  // Disable CSS transitions/animations so forced-pseudo-state captures
  // read the final target value instead of a mid-transition interpolant.
  // Best-effort — capture proceeds even if injection fails.
  await disableTransitions(client);

  try {
    // Process in batches to limit concurrency
    for (let i = 0; i < nodes.length; i += concurrency) {
      const batch = nodes.slice(i, i + concurrency);

      await Promise.all(
        batch.map(async ({ backendNodeId, nodeId }) => {
          try {
            // Get normal styles — use existing map or fetch fresh
            let normalStyles = normalStylesMap.get(backendNodeId);
            if (!normalStyles) {
              const fetched = await getMatchedStylesForNode(client, nodeId);
              if (!fetched) return;
              normalStyles = fetched;
            }

            // Capture diffs for all pseudo-classes
            const states: PseudoStateStyles = {};

            for (const pseudoClass of PSEUDO_CLASSES) {
              const diff = await captureForcedPseudoStyles(
                client,
                nodeId,
                normalStyles,
                pseudoClass
              );
              if (diff) {
                // Map "focus-visible" → "focusVisible"
                const key = pseudoClass === "focus-visible" ? "focusVisible" : pseudoClass;
                states[key] = diff;
              }
            }

            // Only store if at least one state had diffs
            if (Object.keys(states).length > 0) {
              result.set(backendNodeId, states);
            }
          } catch {
            // Skip node on any error — don't break the batch
          }
        })
      );
    }

    return result;
  } finally {
    // Always restore — leaves the page clean for subsequent capture steps
    // (screenshot, asset pipeline) even if something threw above.
    await restoreTransitions(client);
  }
}
