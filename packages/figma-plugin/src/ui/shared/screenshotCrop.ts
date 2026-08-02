/**
 * screenshotCrop.ts
 *
 * Real Assets for Screenshot import. A screenshot has no asset URLs — the
 * only pixel source is the uploaded image itself, so a "real asset" here is
 * the region of the original file that sits behind the placeholder box.
 *
 * The AI returns every element's bbox in the image's own coordinate space and
 * the API derives each viewport frame by ONE uniform linear scale
 * (`scaleAbsoluteResult`), so the inverse is a single factor per frame:
 * `sourceWidth / frame.viewportWidth`.
 *
 * Cropped regions are written into `frame.assets` and referenced from
 * `node.imageUrl` — exactly the shape the renderer already consumes for web
 * imports (nodes.ts → createRealImage).
 */

import type { WireframeFrame, WireframeNode } from "../../types";
import { loadImageElement } from "./imageDownscale";

/**
 * Placeholder names worth cropping — the ones whose bbox the AI actually
 * observed in the screenshot. Sub-placeholders synthesized by the converter
 * (Search Icon, Chevron, Star, Dot) are deliberately absent: their boxes are
 * layout guesses, so a crop would land on unrelated pixels.
 */
export const CROPPABLE_NODE_NAMES: ReadonlySet<string> = new Set([
  "Icon",
  "Image Placeholder",
  "Logo",
  "Avatar",
  "Carousel Image",
]);

/** Smallest source-pixel edge worth cropping. */
const MIN_CROP_PX = 8;

/** At or below this size PNG keeps icons crisp; above it JPEG keeps the payload sane. */
const PNG_MAX_EDGE = 96;

export interface CropSource {
  dataUrl: string;
  width: number;
  height: number;
}

export interface CropResult {
  /** Placeholder nodes that now point at a cropped asset. */
  cropped: number;
  /** Qualifying nodes left as placeholders (too small, off-image, encode failure). */
  skipped: number;
}

interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function isCroppable(node: WireframeNode): boolean {
  return (
    (node.type === "placeholder" || node.isPlaceholder === true) &&
    (!node.children || node.children.length === 0) &&
    CROPPABLE_NODE_NAMES.has(node.name)
  );
}

/**
 * Map a node's absolute viewport box onto source pixels, clamped to the
 * image. Returns null when nothing usable is left.
 */
function toSourceRect(
  absX: number,
  absY: number,
  width: number,
  height: number,
  factor: number,
  source: CropSource,
): Rect | null {
  const left = Math.round(absX * factor);
  const top = Math.round(absY * factor);
  const right = Math.min(left + Math.round(width * factor), source.width);
  const bottom = Math.min(top + Math.round(height * factor), source.height);
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = right - sx;
  const sh = bottom - sy;
  if (sw < MIN_CROP_PX || sh < MIN_CROP_PX) return null;
  return { sx, sy, sw, sh };
}

/** Draw one region onto a fresh canvas and encode it. Returns null on failure. */
function encodeCrop(img: HTMLImageElement, rect: Rect): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = rect.sw;
    canvas.height = rect.sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const usePng = Math.max(rect.sw, rect.sh) <= PNG_MAX_EDGE;
    if (!usePng) {
      // JPEG has no alpha — flatten onto white rather than black.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, rect.sw, rect.sh);
    }
    ctx.drawImage(
      img,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      0,
      0,
      rect.sw,
      rect.sh,
    );
    return usePng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

/**
 * Replace croppable placeholders with regions of the source screenshot.
 * Mutates `frames` in place; every failure mode degrades to "keep the
 * placeholder" so a bad box never fails the import.
 */
export async function applyScreenshotCrops(
  frames: WireframeFrame[],
  source: CropSource,
): Promise<CropResult> {
  const result: CropResult = { cropped: 0, skipped: 0 };
  if (!source.width || !source.height || !frames.length) return result;

  const img = await loadImageElement(source.dataUrl);

  // Identical regions (repeated icons, and the same element across viewport
  // frames) share one encoded asset — assetsMap is keyed globally.
  const encoded = new Map<string, string>();

  for (const frame of frames) {
    if (!frame?.tree || !frame.viewportWidth) continue;
    const factor = source.width / frame.viewportWidth;

    const walk = (node: WireframeNode, parentX: number, parentY: number) => {
      const absX = parentX + (node.x || 0);
      const absY = parentY + (node.y || 0);

      if (isCroppable(node)) {
        const rect = toSourceRect(
          absX,
          absY,
          node.width,
          node.height,
          factor,
          source,
        );
        if (!rect) {
          result.skipped++;
          return;
        }
        const key = `screenshot-crop:${rect.sx},${rect.sy},${rect.sw},${rect.sh}`;
        let dataUrl = encoded.get(key);
        if (dataUrl === undefined) {
          dataUrl = encodeCrop(img, rect) ?? "";
          encoded.set(key, dataUrl);
        }
        if (!dataUrl) {
          result.skipped++;
          return;
        }
        node.imageUrl = key;
        if (!frame.assets) frame.assets = {};
        frame.assets[key] = dataUrl;
        result.cropped++;
        return;
      }

      for (const child of node.children || []) {
        walk(child, absX, absY);
      }
    };

    walk(frame.tree, 0, 0);
  }

  return result;
}
