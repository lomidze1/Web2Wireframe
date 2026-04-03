import sharp from "sharp";

/**
 * Node.js image converter for Figma-unsupported formats (WebP, AVIF, TIFF, HEIC).
 * Uses `sharp` instead of OffscreenCanvas (browser-only).
 *
 * Pass this as the `convertImage` callback to shared-extraction's
 * `extractAssetsForTree()` for full format support.
 */
export async function convertToFigmaFormat(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const buffer = Buffer.from(base64, "base64");
    const pngBuffer = await sharp(buffer).png().toBuffer();
    return { base64: pngBuffer.toString("base64"), mimeType: "image/png" };
  } catch (error) {
    console.warn(`[Plugin_Backend] Failed to convert ${mimeType} to PNG:`, error);
    return null;
  }
}
