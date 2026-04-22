/**
 * Pseudo-state dedup — content-signature cache for hover ComponentSets.
 *
 * Adopts html.to.design's approach: elements that share the same visual
 * pattern + same hover diff collapse into a single ComponentSet with
 * instances, rather than minting a new ComponentSet per DOM node.
 */

export type HoverCacheEntry = {
  componentSet: ComponentSetNode;
  defaultComponent: ComponentNode;
};

export type HoverComponentCache = Map<string, HoverCacheEntry>;

export interface PseudoStateDiffs {
  hover?: Record<string, string>;
  focus?: Record<string, string>;
  active?: Record<string, string>;
  focusVisible?: Record<string, string>;
}

/**
 * Stable JSON for a nested diff map: sorts keys at every level so the
 * signature is invariant to insertion order.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Serialize a frame's visual properties into a deterministic string.
 *
 * Deliberately excludes width/height — elements sharing the same visual
 * style (fills, strokes, effects, radius) should dedupe into one
 * ComponentSet, with per-instance resize() handling size variance. This
 * matches html.to.design's behaviour on pages with multiple buttons of
 * identical appearance but different text widths.
 */
function frameVisualSignature(frame: FrameNode | ComponentNode): string {
  const f = frame as unknown as {
    fills?: unknown;
    strokes?: unknown;
    effects?: unknown;
    opacity?: number;
    cornerRadius?: number;
    strokeWeight?: number;
    strokeAlign?: string;
    children?: { length?: number } | unknown[];
  };

  const childCount = Array.isArray(f.children)
    ? f.children.length
    : (f.children as { length?: number } | undefined)?.length ?? 0;

  return [
    stableStringify(f.fills ?? []),
    stableStringify(f.strokes ?? []),
    stableStringify(f.effects ?? []),
    String(f.opacity ?? 1),
    String(f.cornerRadius ?? 0),
    String(f.strokeWeight ?? 0),
    f.strokeAlign ?? "INSIDE",
    `children:${childCount}`,
  ].join("|");
}

/**
 * Compute a canonical signature string for a frame + its pseudo-state diff.
 * Same visual pattern + same hover diff → same signature → cache hit.
 */
export function computeHoverSignature(
  frame: FrameNode,
  pseudoStates: PseudoStateDiffs,
): string {
  const visual = frameVisualSignature(frame);
  // Normalize to plain object so stableStringify sorts keys consistently
  // regardless of whether the caller passed a typed struct or a dict.
  const diffPart = stableStringify({ ...pseudoStates });
  return `${visual}::${diffPart}`;
}
