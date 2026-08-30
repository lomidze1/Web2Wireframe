/**
 * SVG icon library extraction (Phase D, h2d-parity).
 *
 * h2d's `Component 3` aggregates every unique SVG on the page into ONE
 * ComponentSet with one variant per icon. Other components reference icons
 * via `INSTANCE` of Component 3 instead of inlining vector markup. This
 * matches that exact pattern.
 *
 * Pipeline (called from main.ts before PASS 1):
 *   1. collectSvgs(frames)     — walk wireframe trees, group by content hash
 *   2. buildIconLibrary()      — create master ComponentNodes per unique SVG
 *   3. combineAsVariants()     — bundle into "Icons" ComponentSet
 *   4. wrapInDocFrame()        — add legends + apply h2d styling
 *
 * Render-time lookup (realImages.ts):
 *   For each SVG, hash its markup, find the master in the library, create
 *   an INSTANCE instead of figma.createNodeFromSvg(). Instances live inside
 *   the wireframe tree alongside non-icon nodes.
 */

import type { WireframeFrame, WireframeNode } from "../types";
import { logger } from "../utils/logger";
import * as perf from "../utils/perf";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IconLibrary {
  /** "Icons" ComponentSet that bundles all unique SVGs. */
  componentSet: ComponentSetNode;
  /** "Component N" wrapper FRAME (with legends). main.ts appends THIS to section. */
  wrapper: FrameNode;
  /** componentIndex used in `Component N` naming. */
  componentIndex: number;
  /** Map: SVG content hash → master ComponentNode (for createInstance). */
  hashToComponent: Map<string, ComponentNode>;
  /** Map: SVG content hash → 1-based variant index (for setProperties). */
  hashToVariantIndex: Map<string, number>;
}

export interface BuildOpts {
  /** Sequential index for the "Component N" wrapper name. Default: 1. */
  componentIndex?: number;
}

export interface SvgEntry {
  /** First-encountered markup (used to render the master). */
  markup: string;
  /** Number of times this hash appeared across all frames. */
  count: number;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

// FNV-1a 32-bit. Stable, no deps, good distribution for short strings.
// We don't need cryptographic strength — collisions in a single page's
// icon set are vanishingly unlikely with 32 bits.
function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return ("0000000" + hash.toString(16)).slice(-8);
}

/**
 * Normalize SVG markup so visually-identical icons (different whitespace,
 * different fill colors, different attribute order) hash the same. This
 * collapses icon-color variants into one library entry — the rendered
 * INSTANCE inherits its parent frame's color treatment so we don't need
 * separate variants per color.
 */
function normalizeSvg(markup: string): string {
  return markup
    // Strip all whitespace runs to single space
    .replace(/\s+/g, " ")
    // Strip whitespace between adjacent tags (`> <` → `><`)
    .replace(/>\s+</g, "><")
    // Lowercase tag/attribute names for stable comparison
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*/g, (m) => m.toLowerCase())
    // Strip color-bearing attributes (fill, stroke, color, opacity)
    .replace(/\s+(fill|stroke|color|opacity|fill-opacity|stroke-opacity)\s*=\s*"[^"]*"/g, "")
    .replace(/\s+(fill|stroke|color|opacity|fill-opacity|stroke-opacity)\s*=\s*'[^']*'/g, "")
    .trim();
}

export function hashSvg(markup: string): string {
  return fnv1aHex(normalizeSvg(markup));
}

// ---------------------------------------------------------------------------
// Collection — pure walker
// ---------------------------------------------------------------------------

export function collectSvgs(frames: WireframeFrame[]): Map<string, SvgEntry> {
  const result = new Map<string, SvgEntry>();
  const walk = (node: WireframeNode): void => {
    const markup = node.computedStyles?.svgMarkup;
    if (markup && typeof markup === "string" && markup.includes("<svg")) {
      const h = hashSvg(markup);
      const existing = result.get(h);
      if (existing) {
        existing.count += 1;
      } else {
        result.set(h, { markup, count: 1 });
      }
    }
    if (node.children) for (const c of node.children) walk(c);
  };
  for (const frame of frames) {
    if (frame?.tree) walk(frame.tree);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Library construction
// ---------------------------------------------------------------------------

/**
 * Build the icon library. Returns null when no SVGs are present (so the
 * caller knows to skip section integration).
 *
 * Each unique SVG becomes one ComponentNode named `variant=N`; all are
 * combined into a single ComponentSet ("Icons") and wrapped in an h2d
 * doc-frame ("Component N").
 */
export async function buildIconLibrary(
  frames: WireframeFrame[],
  opts: BuildOpts = {},
): Promise<IconLibrary | null> {
  const svgs = collectSvgs(frames);
  if (svgs.size === 0) return null;

  const componentIndex = opts.componentIndex ?? 1;
  const hashToComponent = new Map<string, ComponentNode>();
  const hashToVariantIndex = new Map<string, number>();
  const components: ComponentNode[] = [];

  let variantIdx = 0;
  const entries: Array<[string, SvgEntry]> = [];
  svgs.forEach((entry, hash) => entries.push([hash, entry]));
  for (const [hash, entry] of entries) {
    variantIdx += 1;
    try {
      // Render the SVG to a Figma vector node, then promote to a Component.
      const svgNode = (__W2W_DEV_LOG__
        ? perf.timedSync("node.svg", () => figma.createNodeFromSvg(entry.markup), true)
        : figma.createNodeFromSvg(entry.markup)) as FrameNode;
      const comp = figma.createComponent();
      comp.name = `variant=${variantIdx}`;
      // Match svg dimensions on the master so instances inherit reasonable
      // defaults; per-instance resize() lives in createRealImage.
      try {
        if (typeof comp.resize === "function" && svgNode.width && svgNode.height) {
          comp.resize(Math.max(svgNode.width, 1), Math.max(svgNode.height, 1));
        }
      } catch {
        // Best-effort.
      }
      try {
        comp.appendChild(svgNode);
      } catch {
        // If appendChild fails (mock), markup is lost; mock environments only.
      }
      components.push(comp);
      hashToComponent.set(hash, comp);
      hashToVariantIndex.set(hash, variantIdx);
    } catch (err) {
      logger.warn("buildIconLibrary: createNodeFromSvg failed", {
        hash,
        snippet: entry.markup.slice(0, 80),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (components.length === 0) return null;

  // Phase D (h2d-parity): vertical stack layout. h2d's Component 3 lays out
  // all icons in a single column (~180px wide × 3212px tall for 43 icons).
  // Without this step every variant stays at (0,0) and visually overlaps.
  // x=0 (flush left), y = cumulative vertical offset per row.
  const GAP = 16;
  let cumY = 0;
  for (const comp of components) {
    try {
      (comp as unknown as { x: number }).x = 0;
      (comp as unknown as { y: number }).y = cumY;
    } catch {
      // Mock components in tests may not expose x/y setters.
    }
    const h = Number.isFinite(comp.height) ? comp.height : 24;
    cumY += Math.max(h, 24) + GAP;
  }

  const componentSet = figma.combineAsVariants(
    components,
    figma.currentPage as BaseNode & ChildrenMixin,
  );

  // Wrap in h2d doc-frame (Phase C). Lazy import avoids loading the wrapper
  // module in tests that only exercise hashSvg/collectSvgs.
  let wrapper: FrameNode = componentSet as unknown as FrameNode;
  try {
    const { wrapInDocFrame } = await import("./componentDocFrame");
    wrapper = await wrapInDocFrame({
      componentSet,
      componentIndex,
      variantCount: components.length,
    });
  } catch (err) {
    logger.warn("buildIconLibrary: wrapInDocFrame failed — using bare ComponentSet", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    componentSet,
    wrapper,
    componentIndex,
    hashToComponent,
    hashToVariantIndex,
  };
}
