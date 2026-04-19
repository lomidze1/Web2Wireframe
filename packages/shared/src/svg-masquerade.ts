/**
 * Raster-masquerade SVG detection + extraction.
 *
 * Many "SVGs" exported from Adobe Illustrator or image editors contain no
 * real vector primitives — just one <image> tag with a base64-encoded
 * PNG/JPEG. figma.createNodeFromSvg produces a broken node for these;
 * we detect and extract the embedded raster instead.
 */

// Matches <image xlink:href="data:…"/> or <image href="data:…"/>.
// Case-insensitive, tolerant of single/double quotes.
const EMBEDDED_IMAGE_DATA_URI = /<image\b[^>]*?\s(?:xlink:)?href\s*=\s*["'](data:image\/[^"']+)["']/i;

// Vector primitives that would indicate a REAL vector SVG.
const VECTOR_PRIMITIVE = /<(?:path|rect|circle|ellipse|line|polyline|polygon|text)\b/i;

export function isRasterMasqueradeSvg(markup: string | undefined | null): boolean {
  if (!markup || typeof markup !== "string") return false;
  if (!markup.includes("<image")) return false;
  // Must contain an <image> with a data: URI (external URLs don't count).
  if (!EMBEDDED_IMAGE_DATA_URI.test(markup)) return false;
  // If any real vector primitive is present, it's not a pure masquerade.
  if (VECTOR_PRIMITIVE.test(markup)) return false;
  return true;
}

export function extractEmbeddedImageFromSvg(
  markup: string | undefined | null,
): string | undefined {
  if (!markup || typeof markup !== "string") return undefined;
  const match = markup.match(EMBEDDED_IMAGE_DATA_URI);
  return match ? match[1] : undefined;
}
