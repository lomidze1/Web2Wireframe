/**
 * imageTiling.ts
 *
 * Tall screenshots lose most of their pixels to the vision API's 1568px
 * long-edge ceiling: a 1425×4178 page reaches the model at 535×1568. Instead,
 * slice the page into overlapping horizontal tiles, each sized to the API's
 * FULL-resolution budget (~1.15MP ≈ w×h/750 ≤ 1600 tokens), and let the server
 * analyse them in parallel and stitch the results.
 *
 * Seams are chosen on the quietest rows near each target (whitespace bands
 * between sections), so elements rarely straddle a cut. The planning functions
 * are pure; only computeRowActivity/sliceTiles touch the canvas.
 */

import { loadImageElement } from "./imageDownscale";

/** Anthropic's full-resolution area budget (≈1600 tokens at w×h/750). */
export const TARGET_TILE_AREA = 1_150_000;
/** The vision API's hard long-edge ceiling. */
export const MAX_TILE_EDGE = 1568;
/** Cost/latency cap — taller pages scale down to fit the budget. */
export const MAX_TILES = 8;
export const MIN_TILE_HEIGHT = 640;
/** Fraction of tile height shared with each neighbour. */
export const TILE_OVERLAP_RATIO = 0.15;
/** Seam may move up to this fraction of tile height to find a quiet row. */
export const SEAM_SEARCH_WINDOW = 0.25;

/** Legacy single-image analysis is fine while it keeps ≥80% of the pixels. */
const TRIGGER_HEIGHT = MAX_TILE_EDGE * 1.25;

export interface PlannedTile {
  offsetY: number;
  height: number;
}

export interface TilePlan {
  /** natural → tiled space factor (≤1): width cap + MAX_TILES budget. */
  scale: number;
  width: number;
  height: number;
  /** Seam positions in tiled space — where consecutive tiles meet. */
  cuts: number[];
  tiles: PlannedTile[];
}

export interface SlicedTile {
  imageBase64: string;
  offsetY: number;
  width: number;
  height: number;
}

/**
 * Decide whether and how to tile. Returns null when the legacy single-image
 * path is good enough (short pages) — callers then send nothing extra.
 */
export function planTiles(naturalWidth: number, naturalHeight: number): TilePlan | null {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null;

  // Width cap first — it defines the tiled coordinate space.
  let scale = Math.min(1, MAX_TILE_EDGE / naturalWidth);
  if (naturalHeight * scale <= TRIGGER_HEIGHT) return null;

  // Fit the tile budget: tiles ≈ H·s / (tileH·(1-overlap)) with
  // tileH = AREA/(w·s). Solving for s: s = sqrt(MAX·AREA·(1-ovl)/(w·H)).
  const needed = (w: number, h: number) => {
    const tileH = clampTileHeight(w);
    return Math.ceil(h / (tileH * (1 - TILE_OVERLAP_RATIO)));
  };
  if (needed(naturalWidth * scale, naturalHeight * scale) > MAX_TILES) {
    scale = Math.sqrt(
      (MAX_TILES * TARGET_TILE_AREA * (1 - TILE_OVERLAP_RATIO)) /
        (naturalWidth * naturalHeight),
    );
    scale = Math.min(scale, MAX_TILE_EDGE / naturalWidth, 1);
  }

  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);
  const tileH = clampTileHeight(width);
  const step = Math.max(1, Math.round(tileH * (1 - TILE_OVERLAP_RATIO)));
  const count = Math.min(MAX_TILES, Math.max(2, Math.ceil(height / step)));

  // Evenly spaced seam targets; computeRowActivity + chooseSeams refine them.
  const cuts: number[] = [];
  for (let i = 1; i < count; i++) {
    cuts.push(Math.round((height * i) / count));
  }

  return { scale, width, height, cuts, tiles: tilesFromCuts(cuts, height, tileH) };
}

function clampTileHeight(width: number): number {
  return Math.max(
    MIN_TILE_HEIGHT,
    Math.min(MAX_TILE_EDGE, Math.floor(TARGET_TILE_AREA / Math.max(1, width))),
  );
}

/** Expand seam positions into overlapping tiles covering [0..height]. */
function tilesFromCuts(cuts: number[], height: number, tileH: number): PlannedTile[] {
  const halfOverlap = Math.round(tileH * TILE_OVERLAP_RATIO * 0.5);
  const edges = [0, ...cuts, height];
  const tiles: PlannedTile[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const top = Math.max(0, edges[i] - (i === 0 ? 0 : halfOverlap));
    const bottom = Math.min(height, edges[i + 1] + (i === edges.length - 2 ? 0 : halfOverlap));
    tiles.push({ offsetY: top, height: bottom - top });
  }
  return tiles;
}

/**
 * Snap each target cut to the quietest row within ±window. Quiet rows are
 * whitespace bands between sections — cutting there means elements rarely
 * straddle a seam. Seams stay strictly ascending.
 */
export function chooseSeams(rowActivity: Float32Array, targets: number[], window: number): number[] {
  const seams: number[] = [];
  let floor = 1;
  for (const target of targets) {
    const from = Math.max(floor, target - window);
    const to = Math.min(rowActivity.length - 2, target + window);
    let best = Math.min(Math.max(target, floor), rowActivity.length - 2);
    let bestScore = Infinity;
    for (let y = from; y <= to; y++) {
      // Tie-break toward the target so a flat page cuts evenly.
      const score = rowActivity[y] + Math.abs(y - target) * 1e-4;
      if (score < bestScore) {
        bestScore = score;
        best = y;
      }
    }
    seams.push(best);
    floor = best + 1;
  }
  return seams;
}

/**
 * Per-row activity of the page: luma change between adjacent rows, measured
 * on a narrow thumbnail (content edges register; solid bands read ~0).
 */
export function computeRowActivity(
  img: HTMLImageElement | CanvasImageSource,
  height: number,
): Float32Array {
  const THUMB_W = 64;
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Float32Array(height); // all-quiet → even cuts

  ctx.drawImage(img, 0, 0, THUMB_W, height);
  const { data } = ctx.getImageData(0, 0, THUMB_W, height);

  const rowLuma = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < THUMB_W; x++) {
      const i = (y * THUMB_W + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    rowLuma[y] = sum / THUMB_W;
  }

  const activity = new Float32Array(height);
  for (let y = 1; y < height; y++) {
    activity[y] = Math.abs(rowLuma[y] - rowLuma[y - 1]);
  }
  return activity;
}

/**
 * Cut the source bitmap into JPEG tiles per the plan. Source rects are in the
 * original bitmap's space (plan ÷ scale); outputs are in tiled space.
 */
export function sliceTiles(
  img: HTMLImageElement | { naturalWidth: number; naturalHeight: number },
  plan: Pick<TilePlan, "scale" | "width" | "tiles">,
): SlicedTile[] {
  const inv = 1 / plan.scale;
  const out: SlicedTile[] = [];

  for (const tile of plan.tiles) {
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = tile.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context unavailable");

    // JPEG has no alpha — flatten transparency onto white, not black.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, plan.width, tile.height);
    ctx.drawImage(
      img as CanvasImageSource,
      Math.round(0),
      Math.round(tile.offsetY * inv),
      Math.round(plan.width * inv),
      Math.round(tile.height * inv),
      0,
      0,
      plan.width,
      tile.height,
    );

    out.push({
      imageBase64: canvas.toDataURL("image/jpeg", 0.85),
      offsetY: tile.offsetY,
      width: plan.width,
      height: tile.height,
    });
  }

  return out;
}

/**
 * Full pipeline: decode the original file, plan, refine seams on quiet rows,
 * slice. Returns null when tiling isn't warranted; throws only on decode
 * failure (callers degrade to the legacy path).
 */
export async function buildTilesFromDataUrl(
  dataUrl: string,
  naturalWidth: number,
  naturalHeight: number,
): Promise<{ tiles: SlicedTile[]; tiledWidth: number; tiledHeight: number } | null> {
  const plan = planTiles(naturalWidth, naturalHeight);
  if (!plan) return null;

  const img = await loadImageElement(dataUrl);

  // Refine the evenly-spaced cuts onto quiet rows, then rebuild the tiles.
  const activity = computeRowActivity(img, plan.height);
  const tileH = clampTileHeight(plan.width);
  const window = Math.round(tileH * SEAM_SEARCH_WINDOW);
  const refined = chooseSeams(activity, plan.cuts, window);
  const tiles = sliceTiles(img, {
    scale: plan.scale,
    width: plan.width,
    tiles: tilesFromCuts(refined, plan.height, tileH),
  });

  return { tiles, tiledWidth: plan.width, tiledHeight: plan.height };
}
