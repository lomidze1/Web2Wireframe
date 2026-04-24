/**
 * Hover ComponentSet consolidation — h2d-aligned 2D variants (Pass 1).
 *
 * Walks the WireframeNode tree once, collects hoverables, groups them by
 * children-structure signature (category), then by visual signature
 * (variant index within category). For each category, creates ONE master
 * ComponentSet with N × 2 variants (variant=N × :hover=true/false), TEXT
 * component properties for each text child, and ON_HOVER reactions on
 * every `:hover=false` variant pointing to its `:hover=true` sibling.
 *
 * PASS 2 lives in nodes.ts: `createNodeInFigma` calls `lookupHoverMaster`
 * and, on a hit, creates an instance of the master with the right variant
 * property + TEXT overrides, instead of minting a fresh ComponentSet.
 */

import type { RenderContext, WireframeFrame, WireframeNode } from "../types";
import { shiftLightness } from "./colors";

// Plugin-colors hover treatment: when colorMode === "plugin", the captured
// CSS hover color would be overwritten by the palette anyway, so we strip
// it from the diff and instead darken the rest variant's plugin fill by
// this amount. Guarantees a visible rest↔hover delta in wireframe mode.
const PLUGIN_HOVER_DARKEN = 0.12;
const PLUGIN_HOVER_COLOR_KEYS = new Set([
  "background-color",
  "background",
  "color",
  "border-color",
  "outline-color",
]);

function filterPluginColorKeys(
  diff: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(diff)) {
    if (!PLUGIN_HOVER_COLOR_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Darken the first SOLID paint on the hover variant's root. Used only in
 * plugin-colors mode to force a visible rest↔hover delta. Falls back to
 * the first SOLID stroke if no SOLID fill exists (transparent root).
 */
export function darkenRootSolidPaint(
  frame: FrameNode | ComponentNode,
  amount: number,
): void {
  const shift = -Math.abs(amount);
  const fills = Array.isArray(frame.fills) ? [...frame.fills] : [];
  const fillIdx = fills.findIndex(
    (p) => (p as Paint).type === "SOLID" && (p as Paint).visible !== false,
  );
  if (fillIdx >= 0) {
    const p = fills[fillIdx] as SolidPaint;
    fills[fillIdx] = { ...p, color: shiftLightness(p.color, shift) };
    frame.fills = fills;
    return;
  }
  const strokes = Array.isArray(frame.strokes) ? [...frame.strokes] : [];
  const strokeIdx = strokes.findIndex(
    (p) => (p as Paint).type === "SOLID" && (p as Paint).visible !== false,
  );
  if (strokeIdx >= 0) {
    const p = strokes[strokeIdx] as SolidPaint;
    strokes[strokeIdx] = { ...p, color: shiftLightness(p.color, shift) };
    frame.strokes = strokes;
  }
}

// ============================================================================
// Public types
// ============================================================================

export interface HoverMasterEntry {
  componentSet: ComponentSetNode;
  /**
   * h2d-style "Component N" wrapper FRAME containing the ComponentSet plus
   * x-axis-legend + y-axis-legend documentation children. main.ts appends
   * THIS to the Components section (not the bare ComponentSet).
   */
  wrapper: FrameNode;
  /** Sequential 1-based index used in `Component N` naming. */
  componentIndex: number;
  /** Map from visual signature → assigned variant number (1-based). */
  variantByVisualSig: Map<string, number>;
  /** Array of TEXT property IDs in DFS order over the representative's text children. */
  textPropIds: string[];
}

export type HoverMasterRegistry = Map<string /* categoryKey */, HoverMasterEntry>;

export interface HoverMasterLookup {
  categoryKey: string;
  variantIndex: number;
  /** DFS-collected text values from the current node (aligned with master's textPropIds). */
  textValues: string[];
  entry: HoverMasterEntry;
}

// ============================================================================
// Internal helpers — exported for unit tests
// ============================================================================

export function collectHoverables(frames: WireframeFrame[]): WireframeNode[] {
  const result: WireframeNode[] = [];
  const walk = (node: WireframeNode): void => {
    if (node.pseudoStateStyles?.hover) result.push(node);
    if (node.children) for (const c of node.children) walk(c);
  };
  for (const frame of frames) {
    if (frame?.tree) walk(frame.tree);
  }
  return result;
}

/**
 * Structure-hash mode. Phase B (h2d-parity): default is `role` — collapses
 * by semantic role (link-text, button-icon, etc.) so apple.com produces ~7
 * ComponentSets instead of 21. `structural` (Phase 3 fine-grained) and
 * `legacy` (2-bucket) remain available for rollback.
 */
type StructureHashMode = "structural" | "legacy" | "role";
let structureHashMode: StructureHashMode = "role";

export function setStructureHashMode(mode: StructureHashMode): void {
  structureHashMode = mode;
}

const STRUCTURE_DEPTH_CAP = 5;

/**
 * Signature for ComponentSet grouping. Mode-dispatched:
 *
 *   role        — h2d-parity. Bucket by `tag + media-presence + text-presence`.
 *                 e.g. `link-text`, `link-icon`, `link-icon-text`,
 *                 `button-icon`, `button-text`, `input`, `<tag>-other`.
 *                 Collapses inner DOM differences (intermediate <span>s)
 *                 that h2d ignores.
 *   structural  — Phase 3 fine-grained `tag:(child1,…)`. Distinguishes by
 *                 full DOM topology. Useful for debugging or when role mode
 *                 over-collapses.
 *   legacy      — 2 buckets: `text-only` | `has-image`.
 */
export function childrenStructureSignature(node: WireframeNode): string {
  if (structureHashMode === "legacy") {
    return hasImageDescendant(node) ? "has-image" : "text-only";
  }
  if (structureHashMode === "role") {
    return roleSignature(node);
  }
  return structuralSig(node, 0);
}

// Phase B (h2d-parity): subtree presence checks for role classification.
// Both `text` (real text node) and `placeholder/img|svg` (media node) are
// the relevant signals — visual styling, geometry, and class names are
// ignored at this layer (visualStyleSignature handles those).
function subtreeHasMedia(node: WireframeNode, depth = 0): boolean {
  if (depth > STRUCTURE_DEPTH_CAP) return false;
  if (node.type === "placeholder" && (node.tag === "img" || node.tag === "svg")) return true;
  for (const c of node.children ?? []) {
    if (subtreeHasMedia(c, depth + 1)) return true;
  }
  return false;
}

function subtreeHasText(node: WireframeNode, depth = 0): boolean {
  if (depth > STRUCTURE_DEPTH_CAP) return false;
  if (node.type === "text" && (node.textContent ?? "").length > 0) return true;
  for (const c of node.children ?? []) {
    if (subtreeHasText(c, depth + 1)) return true;
  }
  return false;
}

/**
 * Phase B (h2d-parity): role-based signature. Fixed bucket per
 * `tag + media-presence + text-presence` so similar interactive elements
 * collapse into one ComponentSet regardless of intermediate DOM nesting.
 *
 * Bucket grammar:
 *   <a>      → link-text | link-icon | link-icon-text
 *   <button> → button-text | button-icon | button-icon-text
 *   <input>  → input
 *   other    → <tag>-text | <tag>-icon | <tag>-icon-text
 *
 * Discrimination by media/text is preserved for ALL tags (not just a/button)
 * so that e.g. `<div>` brand cells (img+text) and `<div>` CTA pills (text)
 * still split into separate ComponentSets.
 */
export function roleSignature(node: WireframeNode): string {
  const tag = (node.tag || "div").toLowerCase();
  if (tag === "input") return "input";
  const hasMedia = subtreeHasMedia(node);
  const hasText = subtreeHasText(node);
  const role = tag === "a" ? "link" : tag === "button" ? "button" : tag;
  const flavor = hasMedia && hasText ? "icon-text" : hasMedia ? "icon" : "text";
  return `${role}-${flavor}`;
}

function structuralSig(node: WireframeNode, depth: number): string {
  if (depth > STRUCTURE_DEPTH_CAP) return "…";
  if (node.type === "text") return "text";
  if (node.type === "placeholder") {
    return `p-${node.tag || "?"}`;
  }
  // frame
  const tag = node.tag || "div";
  const children = node.children ?? [];
  if (children.length === 0) return tag;
  const parts = children.map((c) => structuralSig(c, depth + 1));
  return `${tag}:(${parts.join(",")})`;
}

/**
 * Legacy helper — retained for `setStructureHashMode("legacy")` rollback.
 * DFS with depth cap 3.
 */
function hasImageDescendant(node: WireframeNode, depth = 0): boolean {
  if (depth > 3) return false;
  const children = node.children ?? [];
  for (const c of children) {
    if (c.type === "placeholder" && (c.tag === "img" || c.tag === "svg")) {
      return true;
    }
    if (hasImageDescendant(c, depth + 1)) return true;
  }
  return false;
}

/**
 * DFS traversal returning text values of all descendants (and self if the
 * node itself is a text node).
 */
export function collectTextValues(node: WireframeNode): string[] {
  const result: string[] = [];
  const walk = (n: WireframeNode): void => {
    if (n.type === "text" && (n.textContent ?? "").length > 0) {
      result.push(n.textContent);
    }
    if (n.children) for (const c of n.children) walk(c);
  };
  walk(node);
  return result;
}

// ============================================================================
// Signature for visual variant within a category
// ============================================================================

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`,
  );
  return `{${parts.join(",")}}`;
}

/**
 * Normalize jittery matrix transform values so elements caught at slightly
 * different mid-transition moments still dedupe. Phase 4: tx/ty rounded to
 * the nearest 0.1 px (was 1 px) — with Phase 1's transition-disable the
 * captured transforms are stable enough to preserve sub-pixel intent
 * (e.g. `translateY(-2px)` stays distinct from `translateY(-1.8px)` while
 * `-1.82px` and `-1.85px` dedupe).
 */
function normalizeTransformValue(value: string): string {
  const m = value.match(
    /^matrix\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/,
  );
  if (!m) return value;
  const a = m[1].trim();
  const b = m[2].trim();
  const c = m[3].trim();
  const d = m[4].trim();
  const quantum = visualSigMode === "legacy" ? 1 : 10; // legacy=nearest 1px, expanded=nearest 0.1px
  const tx = Math.round(parseFloat(m[5]) * quantum) / quantum;
  const ty = Math.round(parseFloat(m[6]) * quantum) / quantum;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`;
}

/**
 * Quantize rgba alpha. Phase 4: nearest 0.01 step (1% granularity) — tighter
 * than the legacy 0.05 now that Phase 1 removes mid-transition jitter at the
 * capture layer. Legacy mode restores the 0.05 bucket for rollback.
 */
function quantizeRgbaAlpha(value: string): string {
  const rgba = value.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i,
  );
  if (rgba) {
    const [, r, g, b, a] = rgba;
    const quantum = visualSigMode === "legacy" ? 20 : 100; // legacy=0.05, expanded=0.01
    const quantA = Math.round(parseFloat(a) * quantum) / quantum;
    return `rgba(${r}, ${g}, ${b}, ${quantA})`;
  }
  return value;
}

/**
 * Whitelist of CSS properties whose values should pass through
 * `quantizeRgbaAlpha`. Transform is handled separately above.
 */
function isColorLikeProperty(name: string): boolean {
  return (
    name === "color" ||
    name === "background-color" ||
    name === "background" ||
    name === "border-color" ||
    name === "border-top-color" ||
    name === "border-right-color" ||
    name === "border-bottom-color" ||
    name === "border-left-color" ||
    name === "outline-color"
  );
}

function normalizeHoverDiff(
  diff: Record<string, string> | undefined,
): Record<string, string> {
  if (!diff) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(diff)) {
    if (k === "transform") {
      out[k] = normalizeTransformValue(v);
    } else if (isColorLikeProperty(k)) {
      out[k] = quantizeRgbaAlpha(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Visual-sig mode. Default is Phase 4 expanded mode that includes recursive
 * TEXT descendants (fontFamily, fontWeight, fontSize, textColor) so pills
 * with identical box styling but different type collapse correctly into one
 * variant. Legacy mode retained for rollback.
 */
type VisualSigMode = "expanded" | "legacy";
let visualSigMode: VisualSigMode = "expanded";

export function setVisualSigMode(mode: VisualSigMode): void {
  visualSigMode = mode;
}

/**
 * Recursively collect TEXT descendants' typography fields for inclusion in
 * the visual signature. Phase 4: identical box + different text color or
 * font-weight must produce different visual sigs so they render as separate
 * variants.
 *
 * Excludes `textContent` (the characters themselves vary per-variant — the
 * TEXT component property handles that) and geometry (width/height/x/y).
 */
function collectTextTypographyFingerprint(node: WireframeNode, depth = 0): unknown[] {
  if (depth > 6) return [];
  const out: unknown[] = [];
  if (node.type === "text") {
    // Text-decoration lives on per-segment TextSegment, not WireframeNode,
    // so we skip it here; font-size/weight/family/color are the primary
    // variant differentiators anyway.
    out.push({
      fs: node.fontSize ?? null,
      fw: node.fontWeight ?? null,
      ff: node.fontFamily ?? null,
      tc: node.textColor ?? null,
      ta: node.textAlign ?? null,
    });
  }
  for (const c of node.children ?? []) {
    const sub = collectTextTypographyFingerprint(c, depth + 1);
    if (sub.length) out.push(...sub);
  }
  return out;
}

/**
 * Visual signature within a category: node's fills+strokes+effects+radius
 * combined with the normalized hover diff AND — Phase 4 — TEXT descendants'
 * typography. Size is deliberately excluded (different text widths → same
 * signature).
 */
export function visualStyleSignature(node: WireframeNode): string {
  const visualParts = [
    stableStringify(node.fills ?? []),
    stableStringify(node.strokes ?? []),
    stableStringify(node.effects ?? []),
    String(node.opacity ?? 1),
    stableStringify(node.borderRadius ?? 0),
    String(node.borderWidth ?? 0),
    node.backgroundColor ?? "",
    node.backgroundGradient ?? "",
  ];
  if (visualSigMode === "expanded") {
    visualParts.push(stableStringify(collectTextTypographyFingerprint(node)));
  }
  const hover = normalizeHoverDiff(node.pseudoStateStyles?.hover);
  const hoverPart = stableStringify(hover);
  return `${visualParts.join("|")}::${hoverPart}`;
}

// ============================================================================
// Master ComponentSet construction
// ============================================================================

type FigmaSafeColor = { r: number; g: number; b: number; a?: number };

function solidFill(color: FigmaSafeColor): Paint {
  return {
    type: "SOLID",
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a ?? 1,
  } as Paint;
}

/**
 * Build a COMPLETE ComponentNode by delegating to the full render pipeline.
 * Runs `createNodeInFigma` on a pseudoStateStyles-stripped copy of the
 * representative (so we don't recurse back into consolidation), then
 * promotes the resulting SceneNode into a ComponentNode by moving its
 * children and copying visual properties.
 *
 * Falls back to the lightweight skeleton if the render fails.
 */
async function buildComponentFromWireframe(
  name: string,
  rep: WireframeNode,
  context: RenderContext,
): Promise<ComponentNode> {
  try {
    const { createNodeInFigma } = await import("./nodes");
    // Deep-clone the representative so we can safely mutate (remove
    // pseudoStateStyles, hasDescendantHover) without touching the tree.
    const copy = JSON.parse(JSON.stringify(rep)) as WireframeNode;
    copy.pseudoStateStyles = undefined;
    (copy as unknown as { hasDescendantHover?: boolean }).hasDescendantHover = false;

    const rendered = await createNodeInFigma(copy, context, 0);
    if (!rendered) {
      return buildSkeletonComponent(name, rep, collectTextValues(rep));
    }

    const comp = figma.createComponent();
    comp.name = name;
    comp.resize(
      Math.max(Math.round(rep.width ?? rendered.width ?? 100), 1),
      Math.max(Math.round(rep.height ?? rendered.height ?? 40), 1),
    );

    // Type-narrowed copy for the common FrameNode case.
    if (rendered.type === "FRAME") {
      const frame = rendered as FrameNode;
      try { comp.fills = JSON.parse(JSON.stringify(frame.fills)) as Paint[]; } catch { /* best-effort */ }
      try { comp.strokes = JSON.parse(JSON.stringify(frame.strokes)) as Paint[]; } catch { /* best-effort */ }
      try { comp.effects = JSON.parse(JSON.stringify(frame.effects)) as Effect[]; } catch { /* best-effort */ }
      try { comp.opacity = frame.opacity; } catch { /* best-effort */ }
      try { comp.cornerRadius = frame.cornerRadius as number; } catch { /* best-effort */ }
      try { comp.strokeWeight = frame.strokeWeight as number; } catch { /* best-effort */ }
      try { comp.strokeAlign = frame.strokeAlign; } catch { /* best-effort */ }
      try { comp.clipsContent = frame.clipsContent; } catch { /* best-effort */ }
      // Auto-layout properties so text centers correctly.
      try {
        if (frame.layoutMode !== "NONE") {
          comp.layoutMode = frame.layoutMode;
          comp.primaryAxisSizingMode = frame.primaryAxisSizingMode;
          comp.counterAxisSizingMode = frame.counterAxisSizingMode;
          comp.paddingTop = frame.paddingTop;
          comp.paddingRight = frame.paddingRight;
          comp.paddingBottom = frame.paddingBottom;
          comp.paddingLeft = frame.paddingLeft;
          comp.itemSpacing = frame.itemSpacing;
          comp.primaryAxisAlignItems = frame.primaryAxisAlignItems;
          comp.counterAxisAlignItems = frame.counterAxisAlignItems;
        }
      } catch { /* non-fatal */ }
      // Move children (so text nodes, nested frames, etc. transfer).
      while (frame.children.length > 0) {
        comp.appendChild(frame.children[0]);
      }
      try { frame.remove(); } catch { /* non-fatal */ }
    } else {
      // Non-frame rendered result (text, instance, etc.) — append as single child.
      try { comp.appendChild(rendered); } catch { /* non-fatal */ }
    }

    return comp;
  } catch {
    return buildSkeletonComponent(name, rep, collectTextValues(rep));
  }
}

/**
 * Build a skeleton ComponentNode matching the representative WireframeNode's
 * top-level visuals. Minimal fallback only — used when the full render
 * pipeline fails (e.g. inside unit tests with stub figma globals).
 */
function buildSkeletonComponent(
  name: string,
  rep: WireframeNode,
  textValues: string[],
): ComponentNode {
  const comp = figma.createComponent();
  comp.name = name;
  comp.resize(Math.max(Math.round(rep.width ?? 100), 1), Math.max(Math.round(rep.height ?? 40), 1));

  // Copy top-level paints. We use WireframeNode's Figma-ready arrays when
  // available (they're already Paint-compatible). If not present, synthesize
  // from the legacy fields. The registry's master is a visual shell; exact
  // fidelity is the PASS-2 responsibility (instance overrides if needed).
  try {
    if (rep.fills && rep.fills.length > 0) {
      comp.fills = JSON.parse(JSON.stringify(rep.fills)) as Paint[];
    } else if (rep.backgroundColor) {
      const col = hexToFigmaSafe(rep.backgroundColor);
      if (col) comp.fills = [solidFill(col)];
    } else {
      comp.fills = [];
    }
    if (rep.strokes && rep.strokes.length > 0) {
      comp.strokes = JSON.parse(JSON.stringify(rep.strokes)) as Paint[];
    } else if (rep.borderColor && rep.borderWidth > 0) {
      const col = hexToFigmaSafe(rep.borderColor);
      if (col) {
        comp.strokes = [solidFill(col)];
        comp.strokeWeight = rep.borderWidth;
      }
    } else {
      comp.strokes = [];
    }
    if (rep.effects && rep.effects.length > 0) {
      comp.effects = JSON.parse(JSON.stringify(rep.effects)) as Effect[];
    } else {
      comp.effects = [];
    }
  } catch {
    // If any paint copy fails, skeleton still has sane defaults.
  }

  if (typeof rep.borderRadius === "number") {
    comp.cornerRadius = rep.borderRadius;
  } else if (rep.borderRadius && typeof rep.borderRadius === "object") {
    try {
      comp.topLeftRadius = rep.borderRadius.topLeft;
      comp.topRightRadius = rep.borderRadius.topRight;
      comp.bottomRightRadius = rep.borderRadius.bottomRight;
      comp.bottomLeftRadius = rep.borderRadius.bottomLeft;
    } catch {
      comp.cornerRadius = rep.borderRadius.topLeft;
    }
  }
  comp.opacity = rep.opacity ?? 1;

  // Append one TEXT node per collected text value. We set `.characters`
  // directly so the master holds real CSS text as defaults; per-instance
  // overrides land via the TEXT component property in PASS 2.
  for (const value of textValues) {
    try {
      const t = figma.createText();
      // Font must be loaded before setting characters; in mock tests createText
      // returns an object with a plain .characters setter so this works.
      // In real Figma we'd need `await figma.loadFontAsync(...)`.
      (t as unknown as { characters: string }).characters = value || " ";
      comp.appendChild(t);
    } catch {
      // Font load failure is non-fatal for the master skeleton — the
      // instance overrides will replace text at render time anyway.
    }
  }

  return comp;
}

function hexToFigmaSafe(hex: string): FigmaSafeColor | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r, g, b, a: 1 };
}

/**
 * Wire ON_HOVER reactions on `:hover=false` variants pointing to their
 * `:hover=true` siblings (matches h2d's NODE/CHANGE_TO structure).
 */
async function wireHoverReactions(
  pairs: Array<{ rest: ComponentNode; hover: ComponentNode }>,
): Promise<void> {
  for (const { rest, hover } of pairs) {
    // Phase 6: `transition: null` matches h2d's instant swap. Previously
    // SMART_ANIMATE/150ms/EASE_OUT — that was a W2W enhancement that users
    // reading the Figma prototype couldn't distinguish from a bug.
    const reactions = [
      {
        trigger: { type: "ON_HOVER" },
        actions: [
          {
            type: "NODE",
            destinationId: hover.id,
            navigation: "CHANGE_TO",
            transition: null,
            preserveScrollPosition: false,
          },
        ],
      },
    ] as unknown as Reaction[];
    try {
      if (typeof rest.setReactionsAsync === "function") {
        await rest.setReactionsAsync(reactions);
      } else {
        (rest as unknown as { reactions: Reaction[] }).reactions = reactions;
      }
    } catch {
      // Non-fatal — reactions best-effort.
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function buildHoverMasterRegistry(
  frames: WireframeFrame[],
  _context: RenderContext,
): Promise<HoverMasterRegistry> {
  const hoverables = collectHoverables(frames);
  const registry: HoverMasterRegistry = new Map();

  if (hoverables.length === 0) return registry;

  // Group by childrenStructureSignature → category key.
  const byCategory = new Map<string, WireframeNode[]>();
  for (const node of hoverables) {
    const key = childrenStructureSignature(node);
    const vSig = visualStyleSignature(node);
    // DEBUG: log every hoverable so we can compare Pass 1 vs Pass 2 signatures.
    console.log("[W2W-PASS1]", JSON.stringify({
      categoryKey: key,
      vSigHash: vSig.substring(0, 50),
      tag: (node as { tag?: string }).tag,
      name: (node as { name?: string }).name,
      childTypes: (node.children ?? []).map(c => c.type + ":" + ((c as { tag?: string }).tag || "")),
      hoverDiffKeys: Object.keys(node.pseudoStateStyles?.hover || {}),
    }));
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(node);
  }

  const categoryEntries: Array<[string, WireframeNode[]]> = [];
  byCategory.forEach((members, categoryKey) => {
    categoryEntries.push([categoryKey, members]);
  });

  // Phase C (h2d-parity): sequential componentIndex for "Component N" naming
  // across the whole page. Apple.com → Component 1, 2, 3, … Component 7.
  let componentIndex = 0;

  // Lazily import wrapper to avoid circular deps and to keep tests that
  // don't exercise it from needing extra figma mocks.
  let wrapInDocFrameImpl: typeof import("./componentDocFrame").wrapInDocFrame | null = null;

  for (const [categoryKey, members] of categoryEntries) {
    // Within the category, group by visual signature → variant index.
    const variantByVisualSig = new Map<string, number>();
    const representatives: Array<{ variant: number; rep: WireframeNode }> = [];
    for (const node of members) {
      const vSig = visualStyleSignature(node);
      if (!variantByVisualSig.has(vSig)) {
        variantByVisualSig.set(vSig, variantByVisualSig.size + 1);
        representatives.push({
          variant: variantByVisualSig.get(vSig)!,
          rep: node,
        });
      }
    }

    // Build variant components: for each variant index, create `:hover=false`
    // and `:hover=true` components. Collect text values from the representative
    // so the master holds sensible defaults.
    const allComponents: ComponentNode[] = [];
    const hoverPairs: Array<{ rest: ComponentNode; hover: ComponentNode }> = [];
    let textPropIds: string[] = [];
    let representativeTextCount = 0;

    // Import the diff applier once for the whole category.
    const { applyCssDiffToNode } = await import("./pseudoStates");

    for (const { variant, rep } of representatives) {
      const texts = collectTextValues(rep);
      representativeTextCount = Math.max(representativeTextCount, texts.length);
      // Phase C (h2d-parity): no-space format `variant=N,:hover=…`.
      const restName = `variant=${variant},:hover=false`;
      const rest = await buildComponentFromWireframe(restName, rep, _context);

      const hoverName = `variant=${variant},:hover=true`;
      let hover: ComponentNode;
      try {
        hover = rest.clone();
        hover.name = hoverName;
      } catch {
        hover = await buildComponentFromWireframe(hoverName, rep, _context);
      }

      // Apply the captured hover CSS diff to the `:hover=true` variant so
      // it visually differs from `:hover=false` when the live CSS produces
      // a visible change (fill, color, border). skipTransform=true omits
      // the position-shift + Hybrid-C drop-shadow tricks — h2d emits no
      // such decorative effects on hover variants. If the live CSS only
      // declares `transform: translateY(-2px)`, the hover variant will
      // look identical to rest (matching h2d's behavior).
      //
      // Plugin-colors mode: strip captured color keys (palette already
      // overrode rest's fill; re-applying CSS color would either match
      // rest or clash with the palette). Darken the hover root fill
      // post-diff to guarantee a visible delta.
      const pluginColorMode =
        (_context as { colorMode?: string } | undefined)?.colorMode === "plugin";
      const hoverDiff = rep.pseudoStateStyles?.hover;
      const effectiveDiff =
        pluginColorMode && hoverDiff ? filterPluginColorKeys(hoverDiff) : hoverDiff;
      if (effectiveDiff && Object.keys(effectiveDiff).length > 0) {
        try {
          applyCssDiffToNode(
            hover as unknown as FrameNode,
            effectiveDiff,
            { skipTransform: true },
          );
        } catch {
          // Non-fatal — hover variant falls back to visually-identical clone.
        }
      }
      if (pluginColorMode) {
        try {
          darkenRootSolidPaint(hover as unknown as FrameNode, PLUGIN_HOVER_DARKEN);
        } catch {
          // Non-fatal — if paint shape is unexpected, variants stay identical.
        }
      }

      allComponents.push(rest, hover);
      hoverPairs.push({ rest, hover });
    }

    if (allComponents.length === 0) continue;

    // h2d-style FIXED-COLUMN grid layout: rests at x=0, hovers at one
    // constant x that sits just past the widest rest. This mirrors h2d's
    // Component 2 where rest variants align at x=30 and hover variants at
    // x=269 regardless of per-row content width.
    const GAP = 40;
    let maxRestWidth = 0;
    for (const p of hoverPairs) {
      if (p.rest.width > maxRestWidth) maxRestWidth = p.rest.width;
    }
    const hoverColX = maxRestWidth + GAP;

    let cumY = 0;
    for (const p of hoverPairs) {
      const rowHeight = Math.max(p.rest.height, p.hover.height);
      try {
        p.rest.x = 0;
        p.rest.y = cumY;
        p.hover.x = hoverColX;
        p.hover.y = cumY;
      } catch {
        // Mock components in tests may not expose x/y setters.
      }
      cumY += rowHeight + GAP;
    }

    const componentSet = figma.combineAsVariants(
      allComponents,
      figma.currentPage as BaseNode & ChildrenMixin,
    );
    componentIndex += 1;
    // Phase C (h2d-parity): name overridden by wrapInDocFrame to "Component N".
    // Set a placeholder here for tests that don't exercise the wrapper path.
    componentSet.name = `Component ${componentIndex}`;

    // TEXT component properties: one per text slot. We look up the master
    // via the representative with the most text values (already tracked
    // in representativeTextCount). Property IDs are stored in order.
    if (representativeTextCount > 0) {
      const firstRep = representatives[0]?.rep;
      const firstTexts = firstRep ? collectTextValues(firstRep) : [];
      for (let i = 0; i < representativeTextCount; i++) {
        const defaultValue = firstTexts[i] ?? "";
        try {
          const propId = componentSet.addComponentProperty(
            `Text${i + 1}`,
            "TEXT",
            defaultValue,
          );
          textPropIds.push(propId);
        } catch {
          // If addComponentProperty is unavailable, skip — PASS 2 will
          // fall back to direct text mutation.
        }
      }
    }

    // Bind each variant's text child (if any) to the TEXT property, so
    // instance overrides flow through.
    if (textPropIds.length > 0) {
      for (const comp of allComponents) {
        try {
          const textChildren = (comp.findAll?.((n: SceneNode) => n.type === "TEXT") ??
            []) as TextNode[];
          for (let i = 0; i < Math.min(textChildren.length, textPropIds.length); i++) {
            (textChildren[i] as unknown as {
              componentPropertyReferences: Record<string, string>;
            }).componentPropertyReferences = { characters: textPropIds[i] };
          }
        } catch {
          // Non-fatal — bindings are best-effort.
        }
      }
    }

    // Wire ON_HOVER reactions.
    await wireHoverReactions(hoverPairs);

    // Phase C (h2d-parity): wrap in "Component N" doc-frame with legends.
    // Lazy-load to avoid pulling componentDocFrame into pure-logic tests.
    let wrapper: FrameNode = componentSet as unknown as FrameNode;
    try {
      if (!wrapInDocFrameImpl) {
        wrapInDocFrameImpl = (await import("./componentDocFrame")).wrapInDocFrame;
      }
      wrapper = await wrapInDocFrameImpl({
        componentSet,
        componentIndex,
        variantCount: representatives.length,
      });
    } catch {
      // Non-fatal — wrapper falls back to bare componentSet so the section
      // still includes it. Existing tests that only mock combineAsVariants
      // (without createFrame/createText) hit this path.
    }

    registry.set(categoryKey, {
      componentSet,
      wrapper,
      componentIndex,
      variantByVisualSig,
      textPropIds,
    });
  }

  return registry;
}

export function lookupHoverMaster(
  node: WireframeNode,
  registry: HoverMasterRegistry,
): HoverMasterLookup | null {
  if (!node.pseudoStateStyles?.hover) return null;
  const categoryKey = childrenStructureSignature(node);
  const entry = registry.get(categoryKey);
  if (!entry) return null;
  const vSig = visualStyleSignature(node);
  const variantIndex = entry.variantByVisualSig.get(vSig);
  if (variantIndex === undefined) return null;
  const textValues = collectTextValues(node);
  return { categoryKey, variantIndex, textValues, entry };
}
