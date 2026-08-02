/**
 * visualDiff.ts
 *
 * "How close is the import to the screenshot we were given?" — measured, not
 * eyeballed.
 *
 * A per-pixel RGB diff would be misleading here: the wireframe renders in the
 * plugin font, so glyphs never line up and even a perfect layout would score
 * badly. Instead both images are reduced to a coarse grid of block-average
 * luminance — text becomes a grey smudge in both, and what survives is layout,
 * density and colour weight, which is exactly what we want to measure.
 *
 * Everything below the canvas helper is pure arithmetic so it can be tested
 * without a DOM.
 */

import { loadImageElement } from "./imageDownscale";

/** Columns in the comparison grid — fine enough to place a column break, coarse enough to wash out glyphs. */
export const GRID_COLS = 64;

/** Width both images are normalised to before gridding. */
export const NORMALIZED_WIDTH = 512;

export interface Grid {
  cols: number;
  rows: number;
  /** Block-average luminance, row-major, 0–255. */
  lum: Float32Array;
}

/** Rec. 601 luma — matches how the eye weights the channels. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Reduce an RGBA buffer to a grid of block-average luminance. Blocks are
 * square (side = width / cols), so the row count follows from the image's
 * aspect ratio — a taller page simply yields more rows.
 */
export function gridFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cols: number = GRID_COLS,
): Grid {
  const block = Math.max(1, Math.floor(width / cols));
  const rows = Math.max(1, Math.floor(height / block));
  const lum = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * block;
      const y0 = row * block;
      const x1 = Math.min(width, x0 + block);
      const y1 = Math.min(height, y0 + block);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += luma(data[i], data[i + 1], data[i + 2]);
          count++;
        }
      }
      lum[row * cols + col] = count > 0 ? sum / count : 0;
    }
  }

  return { cols, rows, lum };
}

/** Rows the two grids have in common — the only region worth comparing. */
function sharedRows(a: Grid, b: Grid): number {
  return Math.min(a.rows, b.rows);
}

/**
 * Structural similarity over the overlapping rows, 0–1. Height disagreement
 * is deliberately NOT folded in here — `heightAgreement` scores that
 * separately so the two failure modes stay legible.
 */
export function compareGrids(a: Grid, b: Grid): number {
  if (a.cols !== b.cols) return 0;
  const rows = sharedRows(a, b);
  if (rows < 1) return 0;

  let total = 0;
  const count = rows * a.cols;
  for (let i = 0; i < count; i++) {
    total += Math.abs(a.lum[i] - b.lum[i]);
  }
  return 1 - total / count / 255;
}

/** How well the two page heights agree, 0–1. */
export function heightAgreement(heightA: number, heightB: number): number {
  if (!(heightA > 0) || !(heightB > 0)) return 0;
  return Math.min(heightA, heightB) / Math.max(heightA, heightB);
}

/** Headline number, 0–100: structural similarity discounted by height disagreement. */
export function scoreOf(
  a: Grid,
  b: Grid,
  heightA: number,
  heightB: number,
): number {
  return Math.round(
    100 * compareGrids(a, b) * heightAgreement(heightA, heightB),
  );
}

/**
 * One RGBA pixel per compared block: green where the two agree, through
 * yellow, to red where they diverge completely.
 */
export function heatmapRGBA(a: Grid, b: Grid): Uint8ClampedArray {
  const rows = a.cols === b.cols ? sharedRows(a, b) : 0;
  const out = new Uint8ClampedArray(a.cols * rows * 4);

  for (let i = 0; i < a.cols * rows; i++) {
    const delta = Math.min(1, Math.abs(a.lum[i] - b.lum[i]) / 255);
    // green (0,180,90) → yellow (245,200,40) → red (220,50,50)
    const [r, g, bl] =
      delta < 0.5
        ? [0 + 245 * (delta * 2), 180 + 20 * (delta * 2), 90 - 50 * (delta * 2)]
        : [
            245 - 25 * ((delta - 0.5) * 2),
            200 - 150 * ((delta - 0.5) * 2),
            40 + 10 * ((delta - 0.5) * 2),
          ];
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = bl;
    out[i * 4 + 3] = 255;
  }

  return out;
}

/**
 * Draw an image at the normalised width and reduce it to a grid. Isolated
 * here so the arithmetic above stays canvas-free (and unit-testable).
 */
export function imageToGrid(
  img: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  cols: number = GRID_COLS,
): Grid | null {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null;
  const width = NORMALIZED_WIDTH;
  const height = Math.max(1, Math.round((naturalHeight / naturalWidth) * width));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return gridFromImageData(data, width, height, cols);
}

export interface ComparisonResult {
  score: number;
  heatmapUrl: string | null;
}

/**
 * Score the exported render against the uploaded screenshot.
 *
 * Both grids are built at the same normalised width, so their row counts
 * already express each image's aspect ratio — comparing rows is therefore the
 * same as comparing page heights, without needing either pixel scale.
 *
 * Returns null when either image cannot be decoded; callers simply show no
 * comparison in that case.
 */
export async function compareRenderToSource(
  render: { bytes: Uint8Array; width: number; height: number },
  source: { dataUrl: string; width: number; height: number },
  heatmapWidth = 240,
): Promise<ComparisonResult | null> {
  const url = URL.createObjectURL(
    new Blob([render.bytes as BlobPart], { type: "image/png" }),
  );
  try {
    const [renderImg, sourceImg] = await Promise.all([
      loadImageElement(url),
      loadImageElement(source.dataUrl),
    ]);

    const renderGrid = imageToGrid(renderImg, render.width, render.height);
    const sourceGrid = imageToGrid(sourceImg, source.width, source.height);
    if (!renderGrid || !sourceGrid) return null;

    return {
      score: scoreOf(
        sourceGrid,
        renderGrid,
        sourceGrid.rows,
        renderGrid.rows,
      ),
      heatmapUrl: heatmapDataUrl(
        heatmapRGBA(sourceGrid, renderGrid),
        sourceGrid.cols,
        heatmapWidth,
      ),
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Turn a heatmap buffer into a data URL sized for display. */
export function heatmapDataUrl(
  pixels: Uint8ClampedArray,
  cols: number,
  displayWidth: number,
): string | null {
  const rows = pixels.length / 4 / cols;
  if (!(rows >= 1)) return null;

  const src = document.createElement("canvas");
  src.width = cols;
  src.height = rows;
  const srcCtx = src.getContext("2d");
  if (!srcCtx) return null;
  const imageData = srcCtx.createImageData(cols, rows);
  imageData.data.set(pixels);
  srcCtx.putImageData(imageData, 0, 0);

  // Scale up so the blocks are visible; smoothing off keeps them readable.
  const out = document.createElement("canvas");
  out.width = displayWidth;
  out.height = Math.max(1, Math.round((rows / cols) * displayWidth));
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
