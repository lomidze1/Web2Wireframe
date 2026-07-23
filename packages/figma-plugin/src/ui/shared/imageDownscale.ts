/**
 * imageDownscale.ts
 *
 * Client-side downscaling for Screenshot import. The AI vision API
 * effectively works at ≤1568px on the longest side (larger inputs are
 * downscaled server-side anyway), so shipping full-size images only wastes
 * upload time, tokens, and the 5MB request budget. Downscaling here also
 * keeps the reported imageWidth/imageHeight consistent with what the model
 * actually sees.
 */

export interface DownscaledImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Longest-side ceiling the AI vision API operates at. */
export const MAX_IMAGE_DIMENSION = 1568;

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Unsupported or corrupted image file"));
    img.src = dataUrl;
  });
}

/**
 * Decode a data-URL image and, if its longest side exceeds `maxDim`,
 * re-encode it as JPEG (quality 0.9) scaled down to fit. Small images pass
 * through untouched. Rejects when the browser cannot decode the input
 * (HEIC, corrupted files, …) — callers surface that as a format error
 * BEFORE any quota-consuming upload happens.
 */
export async function downscaleImage(
  dataUrl: string,
  maxDim: number = MAX_IMAGE_DIMENSION
): Promise<DownscaledImage> {
  const img = await loadImageElement(dataUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) {
    throw new Error("Unsupported or corrupted image file");
  }

  const longest = Math.max(width, height);
  if (longest <= maxDim) {
    return { dataUrl, width, height };
  }

  const factor = maxDim / longest;
  const targetWidth = Math.round(width * factor);
  const targetHeight = Math.round(height * factor);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // No 2d context (shouldn't happen in the plugin iframe) — send the
    // original rather than failing the whole import.
    return { dataUrl, width, height };
  }

  // JPEG has no alpha channel — flatten transparency onto white instead of
  // letting it default to black.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width: targetWidth,
    height: targetHeight,
  };
}
