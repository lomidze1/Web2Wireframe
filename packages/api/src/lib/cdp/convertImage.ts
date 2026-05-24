/* eslint-disable no-console -- per-asset conversion traces; CDP-adjacent
 * debug, silenced in prod by gateConsoleInProduction(). */

import sharp from "sharp";

/** MIME types that figma.createImage() supports natively */
const FIGMA_SUPPORTED_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif",
]);

/** Check if a MIME type needs conversion for Figma */
export function needsFigmaConversion(mimeType: string): boolean {
  if (!mimeType.startsWith("image/")) return false;
  if (mimeType === "image/svg+xml") return false;
  return !FIGMA_SUPPORTED_MIMES.has(mimeType);
}

/**
 * Node.js image converter for Figma-unsupported formats (WebP, AVIF, TIFF, HEIC).
 * Uses `sharp` — converts to JPEG for photos (smaller) or PNG for transparency.
 */
export async function convertToFigmaFormat(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const buffer = Buffer.from(base64, "base64");
    // Use JPEG for photos (much smaller than PNG), quality 85%
    const jpegBuffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    return { base64: jpegBuffer.toString("base64"), mimeType: "image/jpeg" };
  } catch (error) {
    console.warn(`[API] Failed to convert ${mimeType} to JPEG:`, error);
    return null;
  }
}

/**
 * Convert all assets in a W2W capture result.
 * Converts AVIF/WebP → JPEG in-place. Called during GET /api/pending-import.
 */
export async function convertAssetsForFigma(
  assets: Record<string, { base64Encoded: boolean; content: string; mimeType: string }>
): Promise<void> {
  const entries = Object.entries(assets);
  for (const [url, entry] of entries) {
    if (entry.base64Encoded && entry.content && needsFigmaConversion(entry.mimeType)) {
      const converted = await convertToFigmaFormat(entry.content, entry.mimeType);
      if (converted) {
        entry.content = converted.base64;
        entry.mimeType = converted.mimeType;
        console.log(`[API] Converted asset ${url.substring(0, 60)}... ${entry.mimeType} → ${converted.mimeType}`);
      }
    }
  }
}
