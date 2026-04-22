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

// ============================================================================
// Public types
// ============================================================================

export interface HoverMasterEntry {
  componentSet: ComponentSetNode;
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
 * Deterministic hash of a node's immediate children topology.
 * Deliberately shallow (depth = 1) so minor content variation inside a
 * nested frame doesn't split a category. Includes type + tag per child.
 * Text CONTENT is ignored; only STRUCTURE matters.
 */
export function childrenStructureSignature(node: WireframeNode): string {
  const kids = node.children ?? [];
  if (kids.length === 0) return "empty";
  const parts: string[] = [];
  for (const k of kids) {
    const type = k.type || "frame";
    const tag = k.tag || "";
    const hasText = (k.textContent ?? "").length > 0 ? "1" : "0";
    const grandKids = (k.children ?? []).length;
    parts.push(`${type}:${tag}:t${hasText}:c${grandKids}`);
  }
  return parts.join("|");
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
 * Normalize jittery matrix transform values so elements caught at
 * different mid-transition moments still dedupe. Rounds tx/ty to the
 * nearest integer px.
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
  const tx = Math.round(parseFloat(m[5]));
  const ty = Math.round(parseFloat(m[6]));
  return `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`;
}

function normalizeHoverDiff(
  diff: Record<string, string> | undefined,
): Record<string, string> {
  if (!diff) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(diff)) {
    out[k] = k === "transform" ? normalizeTransformValue(v) : v;
  }
  return out;
}

/**
 * Visual signature within a category: node's fills+strokes+effects+radius
 * combined with the normalized hover diff. Size is deliberately excluded
 * (different text widths → same signature).
 */
function visualStyleSignature(node: WireframeNode): string {
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
    const reactions = [
      {
        trigger: { type: "ON_HOVER" },
        actions: [
          {
            type: "NODE",
            destinationId: hover.id,
            navigation: "CHANGE_TO",
            transition: {
              type: "SMART_ANIMATE",
              duration: 0.15,
              easing: { type: "EASE_OUT" },
            },
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
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(node);
  }

  const categoryEntries: Array<[string, WireframeNode[]]> = [];
  byCategory.forEach((members, categoryKey) => {
    categoryEntries.push([categoryKey, members]);
  });
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
      const restName = `variant=${variant}, :hover=false`;
      const rest = await buildComponentFromWireframe(restName, rep, _context);

      const hoverName = `variant=${variant}, :hover=true`;
      let hover: ComponentNode;
      try {
        hover = rest.clone();
        hover.name = hoverName;
      } catch {
        hover = await buildComponentFromWireframe(hoverName, rep, _context);
      }

      // CRITICAL: apply the captured hover CSS diff to the `:hover=true`
      // variant so it ACTUALLY looks different from `:hover=false`. Without
      // this, prototype-mode hover swaps variants but users see no visual
      // change because both variants are identical clones.
      const hoverDiff = rep.pseudoStateStyles?.hover;
      if (hoverDiff && Object.keys(hoverDiff).length > 0) {
        try {
          applyCssDiffToNode(hover as unknown as FrameNode, hoverDiff);
        } catch {
          // Non-fatal — hover variant falls back to visually-identical clone.
        }
      }

      allComponents.push(rest, hover);
      hoverPairs.push({ rest, hover });
    }

    if (allComponents.length === 0) continue;

    // Lay components in a grid before combineAsVariants so variants don't
    // stack at (0,0) in the resulting ComponentSet. Rows = variant index,
    // columns = :hover state. Gap = 40 px.
    const GAP = 40;
    let maxHeight = 0;
    for (const comp of allComponents) {
      if (comp.height > maxHeight) maxHeight = comp.height;
    }
    for (let idx = 0; idx < allComponents.length; idx++) {
      const comp = allComponents[idx];
      const row = Math.floor(idx / 2); // variant index (0-based)
      const col = idx % 2; // 0 = :hover=false, 1 = :hover=true
      try {
        comp.x = col * (comp.width + GAP);
        comp.y = row * (maxHeight + GAP);
      } catch {
        // Mock components in tests may not expose x/y setters.
      }
    }

    const componentSet = figma.combineAsVariants(
      allComponents,
      figma.currentPage as BaseNode & ChildrenMixin,
    );
    componentSet.name = `Interactive — ${categoryKey}`;

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

    registry.set(categoryKey, {
      componentSet,
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
