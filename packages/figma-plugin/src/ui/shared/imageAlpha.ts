/**
 * Alpha-channel detection for canvas-converted assets.
 *
 * JPEG has no alpha channel: converting a transparent WebP/AVIF logo to
 * JPEG flattens it onto black. Assets with any transparency must export as
 * PNG instead; fully opaque ones keep JPEG (smaller).
 */

/**
 * Returns true when any sampled pixel has alpha < 255.
 *
 * @param rgbaData RGBA byte stream from `ctx.getImageData(...).data`.
 * @param pixelStride Check every Nth pixel (default 4). Transparency that
 *   matters visually (cut-out logos, rounded thumbnails) spans large areas,
 *   so sparse sampling never misses it in practice while keeping the scan
 *   cheap on multi-megapixel images.
 */
export function hasTransparentPixel(
  rgbaData: Uint8ClampedArray | Uint8Array,
  pixelStride = 4
): boolean {
  const step = Math.max(1, Math.floor(pixelStride)) * 4;
  for (let i = 3; i < rgbaData.length; i += step) {
    if (rgbaData[i] < 255) return true;
  }
  return false;
}
