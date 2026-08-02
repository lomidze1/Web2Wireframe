/**
 * tileAnalysis.ts
 *
 * Stitches per-tile screenshot analyses back into one page-space result.
 *
 * Tall screenshots are sliced client-side into overlapping horizontal tiles so
 * each one reaches the vision model at full width instead of being crushed to
 * fit the 1568px long-edge ceiling. Every tile is analysed independently in
 * its own coordinate space; this module shifts those results into page space
 * and resolves what the overlap makes ambiguous:
 *
 *  - the same element seen by both neighbours (ownership dedup),
 *  - one large element cut in half by the seam (stitch),
 *  - a section background continuing across the seam (merge).
 */

import type { AbsoluteAnalysisResult, AbsoluteElement, ExtractedColors } from "./aiGenerator.js";

export interface TileInput {
  offsetY: number;
  width: number;
  height: number;
}

/** Container types worth stitching when a seam cuts them in half. Text is
 *  never stitched — two paragraphs meeting at a seam are usually two
 *  paragraphs, not one split in two. */
const STITCHABLE_TYPES = new Set(["image", "section-bg", "card", "carousel"]);

/** How close an element edge must be to its tile's edge to count as clipped. */
const EDGE_TOLERANCE = 8;

/** Max gap between two section-bg rects treated as one continuous band. */
const SECTION_MERGE_GAP = 24;

/** Minimum horizontal overlap (fraction of the narrower box) for a stitch. */
const STITCH_X_OVERLAP = 0.7;

/**
 * Same-type boxes from ADJACENT tiles that share this much of their x-band and
 * overlap vertically at all are the same element reported twice.
 *
 * IoU is too strict here: neighbouring tiles routinely disagree by ~80px on
 * where a card sits, which drops IoU to ~0.3 while the boxes still plainly
 * describe one element. Ownership bands are disjoint, so cross-tile vertical
 * overlap only happens right at a seam — and genuinely stacked elements abut
 * rather than overlap, so they survive.
 */
const DUPLICATE_X_OVERLAP = 0.7;

/**
 * Shift a tile-space analysis into page space. Mutates in place. Recurses the
 * same way scaleAbsoluteResult's scaleBox does: container children (elements)
 * and button groups (buttons) may carry their own absolute boxes.
 */
export function shiftResultToPage(result: AbsoluteAnalysisResult, offsetY: number): void {
  const shift = (el: Record<string, unknown>): void => {
    if (typeof el.y === "number") el.y = el.y + offsetY;
    for (const key of ["elements", "buttons"] as const) {
      const kids = el[key];
      if (Array.isArray(kids)) {
        for (const kid of kids) {
          if (kid && typeof kid === "object") shift(kid as Record<string, unknown>);
        }
      }
    }
  };
  for (const el of result.elements || []) {
    shift(el as unknown as Record<string, unknown>);
  }
}

/**
 * Ownership boundaries between consecutive tiles: the midpoint of each
 * overlap. An element belongs to tile i when its centre-y falls between
 * boundary i-1 and boundary i.
 */
export function ownershipBounds(tiles: TileInput[]): number[] {
  const bounds: number[] = [];
  for (let i = 1; i < tiles.length; i++) {
    const prevBottom = tiles[i - 1].offsetY + tiles[i - 1].height;
    bounds.push((tiles[i].offsetY + prevBottom) / 2);
  }
  return bounds;
}

function centerY(el: AbsoluteElement): number {
  return (el.y || 0) + (Number(el.height) || 0) / 2;
}

function xOverlapFraction(a: AbsoluteElement, b: AbsoluteElement): number {
  const left = Math.max(a.x || 0, b.x || 0);
  const right = Math.min((a.x || 0) + (a.width || 0), (b.x || 0) + (b.width || 0));
  const overlap = right - left;
  if (overlap <= 0) return 0;
  return overlap / Math.min(a.width || 1, b.width || 1);
}

function sameBackground(a: AbsoluteElement, b: AbsoluteElement): boolean {
  return a.background === b.background && a.fillColor === b.fillColor;
}

/** Overlapping height of two boxes; ≤0 means they only touch or are apart. */
function yOverlap(a: AbsoluteElement, b: AbsoluteElement): number {
  return (
    Math.min((a.y || 0) + (Number(a.height) || 0), (b.y || 0) + (Number(b.height) || 0)) -
    Math.max(a.y || 0, b.y || 0)
  );
}

/**
 * Clamp a tile's elements to its own slice box, in tile space, BEFORE the
 * shift. The model's y estimates can spill past the slice's bottom edge —
 * unclamped, those boxes land on top of the next tile's content after the
 * shift. Elements lying entirely beyond the slice are hallucinations; drop.
 */
function clampToSlice(result: AbsoluteAnalysisResult, sliceHeight: number): void {
  result.elements = (result.elements || []).filter((el) => {
    const y = Number(el.y) || 0;
    if (y >= sliceHeight) return false;
    const h = Number(el.height) || 0;
    if (y + h > sliceHeight) el.height = sliceHeight - y;
    return true;
  });
}

/** Majority vote per colour key; ties resolve to the earliest tile. */
function voteColors(all: Array<ExtractedColors | undefined>): ExtractedColors | undefined {
  const present = all.filter((c): c is ExtractedColors => !!c);
  if (present.length === 0) return undefined;
  const keys = ["text", "background", "secondary", "surface", "accent"] as const;
  const voted = {} as Record<string, string>;
  for (const key of keys) {
    const counts = new Map<string, number>();
    for (const c of present) {
      const v = c[key];
      if (typeof v === "string") counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best: string | undefined;
    let bestCount = 0;
    // Iterate in tile order — a tie keeps the first tile's value.
    for (const c of present) {
      const v = c[key];
      if (typeof v !== "string") continue;
      const n = counts.get(v) || 0;
      if (n > bestCount) {
        best = v;
        bestCount = n;
      }
    }
    if (best !== undefined) voted[key] = best;
  }
  return voted as unknown as ExtractedColors;
}

/**
 * Merge per-tile analyses (already in tile space) into one page-space result.
 */
export function mergeTileAnalyses(
  results: AbsoluteAnalysisResult[],
  tiles: TileInput[],
  tiledWidth: number,
  tiledHeight: number,
): AbsoluteAnalysisResult {
  const bounds = ownershipBounds(tiles);

  // 1. Shift into page space and keep, per element, which tile produced it.
  interface Tagged {
    el: AbsoluteElement;
    tile: number;
  }
  const tagged: Tagged[] = [];
  results.forEach((result, i) => {
    clampToSlice(result, tiles[i].height);
    shiftResultToPage(result, tiles[i].offsetY);
    for (const el of result.elements || []) {
      tagged.push({ el, tile: i });
    }
  });

  // 2. Ownership: keep an element when its centre lies in its own tile's
  // owned band. The overlap region is seen by both neighbours; the centre rule
  // deletes exactly one of the two copies. Exception: a piece clipped at its
  // tile's edge stays regardless of its centre — clamping pulls such centres
  // onto the boundary, and the piece is needed for the stitch below (its
  // double, if any, falls to the stitch or the IoU pass).
  const owned = tagged.filter(({ el, tile }) => {
    const c = centerY(el);
    const lower = tile === 0 ? -Infinity : bounds[tile - 1];
    const upper = tile === tiles.length - 1 ? Infinity : bounds[tile];
    if (c >= lower && c < upper) return true;

    const tileTop = tiles[tile].offsetY;
    const tileBottom = tileTop + tiles[tile].height;
    const elTop = el.y || 0;
    const elBottom = elTop + (Number(el.height) || 0);
    if (c < lower && Math.abs(elTop - tileTop) <= EDGE_TOLERANCE) return true;
    if (c >= upper && Math.abs(elBottom - tileBottom) <= EDGE_TOLERANCE) return true;
    return false;
  });

  // 3. Seam stitch: a container taller than the overlap gets clipped by both
  // neighbours — one piece survives ownership on each side. Union the pieces.
  const removed = new Set<Tagged>();
  for (const a of owned) {
    if (removed.has(a) || !STITCHABLE_TYPES.has(String(a.el.type))) continue;
    const aTileBottom = tiles[a.tile].offsetY + tiles[a.tile].height;
    const aBottom = (a.el.y || 0) + (Number(a.el.height) || 0);
    const clippedAtBottom = Math.abs(aBottom - aTileBottom) <= EDGE_TOLERANCE;
    if (!clippedAtBottom) continue;

    for (const b of owned) {
      if (b === a || removed.has(b) || b.tile !== a.tile + 1) continue;
      if (b.el.type !== a.el.type) continue;
      const bTileTop = tiles[b.tile].offsetY;
      const clippedAtTop = Math.abs((b.el.y || 0) - bTileTop) <= EDGE_TOLERANCE;
      if (!clippedAtTop) continue;
      if (xOverlapFraction(a.el, b.el) < STITCH_X_OVERLAP) continue;

      // Union boxes onto the earlier piece; drop the later one.
      const top = Math.min(a.el.y || 0, b.el.y || 0);
      const bottom = Math.max(aBottom, (b.el.y || 0) + (Number(b.el.height) || 0));
      const left = Math.min(a.el.x || 0, b.el.x || 0);
      const right = Math.max((a.el.x || 0) + (a.el.width || 0), (b.el.x || 0) + (b.el.width || 0));
      a.el.y = top;
      a.el.height = bottom - top;
      a.el.x = left;
      a.el.width = right - left;
      removed.add(b);
      break;
    }
  }

  // 3b. Near-duplicate suppression: model noise can place the two copies of
  // one element on OPPOSITE sides of the ownership boundary (centre 795 in
  // tile A, 807 in tile B) — both survive the centre rule. Same type from
  // adjacent tiles with heavy box overlap = one element reported twice; keep
  // the copy seen deeper inside its own tile.
  const survivors = owned.filter((t) => !removed.has(t));
  for (const a of survivors) {
    if (removed.has(a)) continue;
    for (const b of survivors) {
      if (b === a || removed.has(b) || b.tile !== a.tile + 1) continue;
      if (b.el.type !== a.el.type) continue;
      if (xOverlapFraction(a.el, b.el) < DUPLICATE_X_OVERLAP) continue;
      if (yOverlap(a.el, b.el) <= 0) continue;

      const depth = (t: Tagged) => {
        const c = centerY(t.el);
        const top = tiles[t.tile].offsetY;
        return Math.min(c - top, top + tiles[t.tile].height - c);
      };
      removed.add(depth(b) > depth(a) ? a : b);
      if (removed.has(a)) break;
    }
  }

  let elements = owned.filter((t) => !removed.has(t)).map((t) => t.el);

  // 4. Sort by y — downstream conversion expects top-to-bottom order.
  elements.sort((a, b) => (a.y || 0) - (b.y || 0));

  // 5. Section-bg continuity: adjacent same-background bands are one section.
  const mergedSections: AbsoluteElement[] = [];
  elements = elements.filter((el) => {
    if (el.type !== "section-bg") return true;
    const prev = mergedSections[mergedSections.length - 1];
    if (
      prev &&
      sameBackground(prev, el) &&
      Math.abs((el.y || 0) - ((prev.y || 0) + (Number(prev.height) || 0))) <= SECTION_MERGE_GAP
    ) {
      prev.height = Math.max(
        Number(prev.height) || 0,
        (el.y || 0) + (Number(el.height) || 0) - (prev.y || 0),
      );
      return false; // absorbed into prev
    }
    mergedSections.push(el);
    return true;
  });

  return {
    // Exact truth from the slicer — not the model's estimate.
    pageWidth: tiledWidth,
    pageHeight: tiledHeight,
    extractedColors: voteColors(results.map((r) => r.extractedColors)),
    elements,
  };
}
