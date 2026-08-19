/**
 * CROP-mode image math for CSS background-position / object-position.
 *
 * Figma's FILL scaleMode always center-crops; CSS lets the author pick the
 * crop focus (`background-position: center 30%`, `object-position: top`).
 * The 1:1 mapping is scaleMode CROP + imageTransform, where the transform
 * describes the visible sub-rectangle in normalized image coordinates:
 *
 *   [[visibleWidthFraction, 0, xOffsetFraction],
 *    [0, visibleHeightFraction, yOffsetFraction]]
 */

/**
 * Parse the natural pixel size of a PNG / JPEG / GIF byte stream.
 * Returns null for unknown formats or truncated data. Pure — testable.
 */
export function parseImageSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;

  // PNG: 8-byte signature, IHDR width/height at offsets 16..23 (big-endian).
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // GIF: "GIF8" header, logical screen size at offsets 6..9 (little-endian).
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // JPEG: scan markers for a SOFn frame header (big-endian height, width).
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      // Standalone markers without length payload.
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      const segLength = (bytes[i + 2] << 8) | bytes[i + 3];
      // SOF0..SOF15 excluding DHT(C4)/JPG(C8)/DAC(CC).
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (segLength < 2) return null;
      i += 2 + segLength;
    }
    return null;
  }

  return null;
}

/** Affine transform in Figma's [[a, b, tx], [c, d, ty]] shape. */
export type CropTransform = [[number, number, number], [number, number, number]];

/**
 * Compute a CROP imageTransform reproducing CSS `background-size: cover` /
 * `object-fit: cover` with a `background-position` / `object-position`
 * focus point.
 *
 * @param imageWidth/imageHeight natural image size (px)
 * @param frameWidth/frameHeight container size (px)
 * @param posX/posY CSS position as fractions 0..1 (CSS % semantics: the p%
 *   point of the image aligns with the p% point of the container — exactly
 *   the linear interpolation over the overflow, which is what this returns).
 *
 * Returns null when a dimension is degenerate or no crop is needed
 * (image aspect === frame aspect and centered).
 */
export function computeCoverCropTransform(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  posX: number,
  posY: number
): CropTransform | null {
  if (imageWidth <= 0 || imageHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const visibleW = Math.min(1, frameWidth / (imageWidth * scale));
  const visibleH = Math.min(1, frameHeight / (imageHeight * scale));
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const offsetX = clamp01(posX) * (1 - visibleW);
  const offsetY = clamp01(posY) * (1 - visibleH);
  return [
    [visibleW, 0, offsetX],
    [0, visibleH, offsetY],
  ];
}

/**
 * Parse one CSS background-position / object-position value into fractional
 * coordinates. Supports keywords and percentages — the forms that carry
 * authoring intent. Pixel offsets return null (they need image-and-container
 * math that belongs elsewhere); callers fall back to FILL.
 */
export function parseCssPosition(
  raw: string | undefined
): { x: number; y: number } | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const keywordMap: Record<string, { axis: "x" | "y" | "both"; v: number }> = {
    left: { axis: "x", v: 0 },
    right: { axis: "x", v: 1 },
    top: { axis: "y", v: 0 },
    bottom: { axis: "y", v: 1 },
    center: { axis: "both", v: 0.5 },
  };

  const parts = value.split(/\s+/).slice(0, 2);
  let x: number | null = null;
  let y: number | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const keyword = keywordMap[part];
    if (keyword) {
      if (keyword.axis === "x" || (keyword.axis === "both" && x === null)) {
        if (x === null) { x = keyword.v; continue; }
      }
      if (keyword.axis === "y" || keyword.axis === "both") {
        if (y === null) { y = keyword.v; continue; }
      }
      if (keyword.axis === "x") return null; // two x-keywords
      continue;
    }
    if (part.endsWith("%")) {
      const n = parseFloat(part);
      if (!Number.isFinite(n)) return null;
      const fraction = Math.max(0, Math.min(1, n / 100));
      if (i === 0 && x === null) { x = fraction; } else { y = fraction; }
      continue;
    }
    // px / other units — out of scope, caller falls back to FILL.
    return null;
  }

  return { x: x ?? 0.5, y: y ?? 0.5 };
}
