/* eslint-disable no-console -- `[W2W]` traces document mime-conversion +
 * asset-resolution failures; silenced in prod by gateConsoleInProduction. */

/**
 * Asset extraction using CDP — Page.getResourceTree approach
 *
 * Instead of Runtime.evaluate + fetch (CORS issues, extra network),
 * we use Page.getResourceTree + Page.getResourceContent to read images
 * directly from the browser cache. Zero CORS, zero extra requests,
 * original quality preserved.
 *
 * Based on html.to.design reverse-engineering research.
 */

import { CDPClient } from "./client";

// Size limits
const MAX_SINGLE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB per image (base64)
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30MB total payload

/** MIME types that figma.createImage() accepts directly — no conversion needed.
 *
 * Anything outside this set goes through `convertToFigmaFormat`, which uses
 * the service worker's `createImageBitmap` + `OffscreenCanvas`. That pipeline
 * succeeds for WebP and AVIF in modern Chrome (both are natively decodable),
 * but fails for HEIC and TIFF — Chrome refuses to decode those, so they end
 * up skipped from the final asset map even though needsFigmaConversion()
 * returns true for them.
 */
export const FIGMA_NATIVE_SUPPORTED_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif",
]);

/** Check if a MIME type needs conversion for Figma compatibility */
export function needsFigmaConversion(mimeType: string): boolean {
  if (!mimeType.startsWith("image/")) return false;
  if (mimeType === "image/svg+xml") return false; // SVGs handled separately
  return !FIGMA_NATIVE_SUPPORTED_MIMES.has(mimeType);
}

/** Encode Uint8Array to base64 string — works in service worker */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert an unsupported image format (AVIF, HEIC, etc.) to PNG
 * using OffscreenCanvas in the service worker.
 *
 * @returns converted { base64, mimeType } or null on failure
 */
async function convertToFigmaFormat(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // base64 → binary → Blob
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Blob → ImageBitmap (Chrome decodes AVIF/HEIC here)
    const bitmap = await createImageBitmap(blob);

    // ImageBitmap → OffscreenCanvas → PNG Blob
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2d context");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });

    // PNG Blob → base64
    const arrayBuffer = await pngBlob.arrayBuffer();
    const pngBase64 = uint8ToBase64(new Uint8Array(arrayBuffer));

    console.log(`[W2W] Converted ${mimeType} → image/png (${Math.round(pngBase64.length / 1024)}KB)`);
    return { base64: pngBase64, mimeType: "image/png" };
  } catch (error) {
    console.warn(`[W2W] Failed to convert ${mimeType} to PNG:`, error);
    return null;
  }
}

/** Figma's createImage rejects images with any dimension above 4096px. */
const MAX_IMAGE_DIMENSION = 4096;

/**
 * Pure scale-step for the downscale loop: given the current attempt's output
 * size, pick the next scale so the following attempt lands ~15% under the
 * byte target (area scales quadratically with the linear scale factor).
 * Exported for tests.
 */
export function nextDownscaleScale(
  currentScale: number,
  currentBytes: number,
  targetBytes: number
): number {
  if (currentBytes <= targetBytes) return currentScale;
  const shrink = Math.sqrt((targetBytes * 0.85) / currentBytes);
  // Never stall: guarantee a real reduction each attempt.
  return currentScale * Math.min(shrink, 0.9);
}

/**
 * Downscale an oversized image until it fits MAX_SINGLE_IMAGE_BYTES.
 *
 * Previously any image above 2MB was dropped outright and rendered as a gray
 * placeholder in Figma. A downscaled real image is strictly better, and it
 * also keeps the .w2w payload smaller than shipping the original would.
 *
 * Alpha-aware: transparent images export as PNG (JPEG would flatten them
 * onto black), opaque ones as JPEG 0.85. Dimensions are always capped at
 * Figma's 4096px hard limit. Returns null when even aggressive downscaling
 * cannot fit the budget (caller falls back to the old drop behavior).
 */
async function downscaleToFit(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));

    let scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );

    for (let attempt = 0; attempt < 4; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get 2d context");
      ctx.drawImage(bitmap, 0, 0, w, h);

      // JPEG has no alpha channel — transparent images must stay PNG.
      let hasAlpha = false;
      try {
        const rgba = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < rgba.length; i += 16) {
          if (rgba[i] < 255) { hasAlpha = true; break; }
        }
      } catch {
        // getImageData failure — assume opaque.
      }

      const outBlob = await canvas.convertToBlob(
        hasAlpha ? { type: "image/png" } : { type: "image/jpeg", quality: 0.85 }
      );
      const outBase64 = uint8ToBase64(new Uint8Array(await outBlob.arrayBuffer()));

      if (outBase64.length <= MAX_SINGLE_IMAGE_BYTES) {
        bitmap.close();
        console.log(
          `[W2W] Downscaled oversized image ${bitmap.width}x${bitmap.height} → ${w}x${h} (${Math.round(outBase64.length / 1024)}KB)`
        );
        return {
          base64: outBase64,
          mimeType: hasAlpha ? "image/png" : "image/jpeg",
        };
      }
      scale = nextDownscaleScale(scale, outBase64.length, MAX_SINGLE_IMAGE_BYTES);
    }

    bitmap.close();
    return null;
  } catch (error) {
    console.warn(`[W2W] Downscale failed for ${mimeType}:`, error);
    return null;
  }
}

/** Resource info from Page.getResourceTree */
interface ResourceInfo {
  frameId: string;
  mimeType: string;
}

/** CDP FrameResourceTree structure */
interface FrameResourceTree {
  frame: { id: string; url: string };
  resources: Array<{
    url: string;
    type: string;
    mimeType: string;
    contentSize?: number;
  }>;
  // CDP-ს `Page.getResourceTree` შვილებს პირდაპირ აბრუნებს — არა
  // `{ frameResourceTree }` შესაფუთში. ძველი, არასწორი ტიპის გამო iframe-იანი
  // ყოველი გვერდი ვარდებოდა („Cannot read properties of undefined").
  childFrames?: Array<FrameResourceTree | { frameResourceTree: FrameResourceTree }>;
}

/** შვილი frame — ან პირდაპირ (CDP), ან ძველ შესაფუთში (თავდაცვითად). */
function unwrapChildFrame(
  child: FrameResourceTree | { frameResourceTree: FrameResourceTree },
): FrameResourceTree | undefined {
  if ("frameResourceTree" in child) return child.frameResourceTree;
  return child.frame ? child : undefined;
}

/**
 * Build a map of all image resources available in the browser cache.
 * Uses Page.getResourceTree to enumerate all loaded resources across frames.
 *
 * @returns Map<url, { frameId, mimeType }> — only image/* resources
 */
export async function buildResourceMap(
  client: CDPClient
): Promise<Map<string, ResourceInfo>> {
  const resourceMap = new Map<string, ResourceInfo>();

  try {
    const result = await client.send<{ frameTree: FrameResourceTree }>(
      "Page.getResourceTree"
    );

    // Recursively flatten all frames' resources
    flattenResources(result.frameTree, resourceMap);

  } catch (error) {
    console.warn("[W2W] Failed to get resource tree:", error);
  }

  return resourceMap;
}

/**
 * Recursively flatten FrameResourceTree into a flat Map of image resources
 */
function flattenResources(
  tree: FrameResourceTree,
  map: Map<string, ResourceInfo>
): void {
  const frameId = tree.frame.id;

  const fontExtensions = [".woff2", ".woff", ".ttf", ".otf", ".eot"];

  for (const resource of tree.resources) {
    const mime = resource.mimeType;
    const url = resource.url;

    // Collect image resources
    const isImage = mime.startsWith("image/");

    // Collect font resources by MIME type
    const isFontMime =
      mime.startsWith("font/") ||
      mime.startsWith("application/font-") ||
      mime === "application/x-font-woff" ||
      mime === "application/x-font-ttf" ||
      mime.startsWith("application/octet-stream"); // woff2 often served as this from CDNs

    // Collect font resources by file extension (fallback for unusual MIME types)
    const isFontExt = fontExtensions.some((ext) => url.toLowerCase().includes(ext));

    if (isImage || isFontMime || isFontExt) {
      map.set(url, {
        frameId,
        mimeType: mime,
      });
    }
  }

  // Recurse into child frames (iframes)
  if (tree.childFrames) {
    for (const child of tree.childFrames) {
      const subtree = unwrapChildFrame(child);
      if (subtree) flattenResources(subtree, map);
    }
  }
}

/**
 * Get a single resource's content as base64 from the browser cache.
 * Uses Page.getResourceContent — no CORS, no extra network requests.
 *
 * @returns base64 string or null on failure
 */
export async function getResourceBase64(
  client: CDPClient,
  frameId: string,
  url: string
): Promise<string | null> {
  try {
    const result = await client.send<{ content: string; base64Encoded: boolean }>(
      "Page.getResourceContent",
      { frameId, url }
    );

    if (result.base64Encoded) {
      return result.content;
    }

    // If not base64-encoded (e.g., SVG text), encode it
    // In browser extension context, we use btoa-compatible encoding
    // Note: This handles text-based resources like SVGs
    return btoa(unescape(encodeURIComponent(result.content)));
  } catch (error) {
    console.warn(`[W2W] Failed to get resource content for ${url}:`, error);
    return null;
  }
}

/**
 * Walk the ExtractedElement tree and collect all image URLs that need resolving.
 * Returns a Set of unique URLs found across all nodes.
 */
function collectImageUrls(tree: TreeNode): Set<string> {
  const urls = new Set<string>();

  function walk(node: TreeNode): void {
    if (node.imageUrl) {
      urls.add(node.imageUrl);
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(tree);
  return urls;
}

/** Minimal tree node shape for walking — avoids importing full ExtractedElement */
interface TreeNode {
  imageUrl?: string;
  children?: TreeNode[];
}

/** Per-format counters for images we couldn't include — surfaced to the
 * popup so the user understands a partial capture (e.g. "2 image/tiff
 * skipped") instead of silently shipping a wireframe with missing visuals. */
export interface AssetExtractionStats {
  /** Images dropped due to >2MB per-image size cap. */
  oversizedCount: number;
  /** Total payload hit 30MB cap; remaining URLs not fetched. */
  truncatedByTotalSize: boolean;
  /** Per-MIME count of images that needed conversion but the converter
   * refused (HEIC/TIFF in Chrome, malformed buffers, etc.). */
  unsupportedFormats: Record<string, number>;
  /** Images whose URL never appeared in the browser's resource map (cache
   * miss — usually means the image failed to load on the source page). */
  resourceMapMisses: number;
}

export interface AssetExtractionResult {
  assets: Record<string, string>;
  stats: AssetExtractionStats;
}

function emptyStats(): AssetExtractionStats {
  return {
    oversizedCount: 0,
    truncatedByTotalSize: false,
    unsupportedFormats: {},
    resourceMapMisses: 0,
  };
}

/**
 * Sum per-frame extraction stats into the popup-facing CaptureStats shape.
 *
 * Multi-viewport captures call extractAssetsForTree once per frame; each
 * frame yields its own AssetExtractionStats. The popup wants one number
 * ("3 images skipped, 2 HEIC + 1 oversized") rather than a per-frame table,
 * so we collapse here at the orchestrator boundary.
 *
 * `skippedImageCount` deliberately sums everything except `payloadTruncated`
 * (which is a flag, not a count) so the popup's headline number reflects
 * "how many images did the user lose".
 */
export function mergeAssetStats(
  frameStats: AssetExtractionStats[]
): {
  skippedImageCount: number;
  unsupportedFormats: Record<string, number>;
  oversizedImageCount: number;
  payloadTruncated: boolean;
  resourceMapMisses: number;
} {
  const unsupportedFormats: Record<string, number> = {};
  let oversizedImageCount = 0;
  let resourceMapMisses = 0;
  let payloadTruncated = false;

  for (const s of frameStats) {
    oversizedImageCount += s.oversizedCount;
    resourceMapMisses += s.resourceMapMisses;
    if (s.truncatedByTotalSize) payloadTruncated = true;
    for (const [mime, count] of Object.entries(s.unsupportedFormats)) {
      unsupportedFormats[mime] = (unsupportedFormats[mime] ?? 0) + count;
    }
  }

  const unsupportedTotal = Object.values(unsupportedFormats).reduce(
    (acc, n) => acc + n,
    0,
  );

  return {
    skippedImageCount: oversizedImageCount + resourceMapMisses + unsupportedTotal,
    unsupportedFormats,
    oversizedImageCount,
    payloadTruncated,
    resourceMapMisses,
  };
}

/**
 * Extract real image assets for a tree of elements.
 *
 * Walks the tree to find all imageUrl references, then resolves each
 * against the resource map (browser cache). Returns a URL→base64 map.
 *
 * Handles:
 * - data: URIs — already base64, used directly
 * - Normal URLs — resolved via Page.getResourceContent (browser cache)
 * - Size limits: skip images >2MB, stop collecting at >30MB total
 * - Deduplication: each URL resolved only once
 *
 * The `stats` field reports each reason a URL was dropped so callers can
 * surface a user-visible warning (popup-side) without parsing console
 * output.
 */
export async function extractAssetsForTree(
  client: CDPClient,
  tree: TreeNode,
  resourceMap: Map<string, ResourceInfo>
): Promise<AssetExtractionResult> {
  const assets: Record<string, string> = {};
  const stats = emptyStats();
  let totalBytes = 0;

  // Collect all unique imageUrls from the tree
  const urls = collectImageUrls(tree);

  // [W2W Debug #9] All image URLs from tree
  console.log("[W2W Debug #9] Image URLs from tree:", {
    count: urls.size,
    urls: Array.from(urls).map((u) => u.substring(0, 120)),
  });

  if (urls.size === 0) {
    return { assets, stats };
  }

  // Bump the per-MIME unsupported counter. Centralized so every skip
  // reason that boils down to "converter refused" updates the same shape.
  const bumpUnsupported = (mime: string): void => {
    stats.unsupportedFormats[mime] = (stats.unsupportedFormats[mime] ?? 0) + 1;
  };

  for (const url of urls) {
    // Stop if total size limit reached
    if (totalBytes >= MAX_TOTAL_BYTES) {
      console.warn(`[W2W] Total asset size limit reached (${Math.round(totalBytes / 1024 / 1024)}MB), skipping remaining images`);
      stats.truncatedByTotalSize = true;
      break;
    }

    // Handle data: URIs — already inline, use directly
    if (url.startsWith("data:")) {
      const commaIndex = url.indexOf(",");
      if (commaIndex !== -1) {
        let base64Data = url.substring(commaIndex + 1);
        const header = url.substring(0, commaIndex); // "data:image/avif;base64"
        let effectiveMime = header.replace("data:", "").replace(";base64", "");

        // Convert unsupported inline data URIs (e.g., data:image/avif;base64,...)
        if (needsFigmaConversion(effectiveMime)) {
          const converted = await convertToFigmaFormat(base64Data, effectiveMime);
          if (!converted) {
            bumpUnsupported(effectiveMime);
            continue;
          }
          base64Data = converted.base64;
          effectiveMime = converted.mimeType;
        }

        if (base64Data.length <= MAX_SINGLE_IMAGE_BYTES) {
          assets[url] = `data:${effectiveMime};base64,${base64Data}`;
          totalBytes += base64Data.length;
        } else {
          // Oversized inline image — downscale instead of dropping.
          // GIFs are excluded: rasterizing would freeze their animation.
          const downscaled = effectiveMime === "image/gif"
            ? null
            : await downscaleToFit(base64Data, effectiveMime);
          if (downscaled) {
            assets[url] = `data:${downscaled.mimeType};base64,${downscaled.base64}`;
            totalBytes += downscaled.base64.length;
          } else {
            console.warn(`[W2W] Skipping data URI (${Math.round(base64Data.length / 1024)}KB > 2MB limit)`);
            stats.oversizedCount += 1;
          }
        }
      }
      continue;
    }

    // Look up URL in resource map (browser cache)
    const resourceInfo = resourceMap.get(url);

    if (!resourceInfo) {
      // [W2W Debug #8] Find similar URLs in resource map for missed images
      const urlPath = url.split("?")[0]; // strip query params
      const partialMatches = Array.from(resourceMap.keys()).filter(
        (k) => k.includes(urlPath.split("/").pop() || "") || urlPath.includes(k.split("?")[0])
      );
      console.warn("[W2W Debug #8] URL NOT in resource map:", {
        treeUrl: url,
        urlWithoutQuery: urlPath,
        partialMatches: partialMatches.slice(0, 5),
        resourceMapSample: Array.from(resourceMap.keys()).slice(0, 10),
      });
      stats.resourceMapMisses += 1;
      continue;
    }

    // Fetch from browser cache
    const base64 = await getResourceBase64(client, resourceInfo.frameId, url);
    if (!base64) {
      stats.resourceMapMisses += 1;
      continue;
    }

    // Check single image size limit — downscale instead of dropping.
    // GIF (animation) and SVG (vector, rendered via createNodeFromSvg) must
    // not be rasterized; those keep the old drop behavior.
    if (base64.length > MAX_SINGLE_IMAGE_BYTES) {
      const canDownscale =
        resourceInfo.mimeType !== "image/gif" &&
        resourceInfo.mimeType !== "image/svg+xml";
      const downscaled = canDownscale
        ? await downscaleToFit(base64, resourceInfo.mimeType)
        : null;
      if (downscaled) {
        assets[url] = `data:${downscaled.mimeType};base64,${downscaled.base64}`;
        totalBytes += downscaled.base64.length;
      } else {
        console.warn(`[W2W] Skipping large image (${Math.round(base64.length / 1024)}KB): ${url}`);
        stats.oversizedCount += 1;
      }
      continue;
    }

    // Convert unsupported formats (AVIF, HEIC, etc.) to PNG for Figma
    let finalBase64 = base64;
    let finalMimeType = resourceInfo.mimeType;

    if (needsFigmaConversion(resourceInfo.mimeType)) {
      const converted = await convertToFigmaFormat(base64, resourceInfo.mimeType);
      if (!converted) {
        bumpUnsupported(resourceInfo.mimeType);
        continue;
      }
      finalBase64 = converted.base64;
      finalMimeType = converted.mimeType;
      // Re-check size after conversion (PNG can be larger than AVIF) —
      // downscale the converted output instead of dropping it.
      if (finalBase64.length > MAX_SINGLE_IMAGE_BYTES) {
        const downscaled = await downscaleToFit(finalBase64, finalMimeType);
        if (downscaled) {
          finalBase64 = downscaled.base64;
          finalMimeType = downscaled.mimeType;
        } else {
          console.warn(`[W2W] Converted image too large (${Math.round(finalBase64.length / 1024)}KB): ${url}`);
          stats.oversizedCount += 1;
          continue;
        }
      }
    }

    // Build data URI with (possibly converted) mime type
    const dataUri = `data:${finalMimeType};base64,${finalBase64}`;
    assets[url] = dataUri;
    totalBytes += finalBase64.length;
  }


  return { assets, stats };
}

// ============================================================================
// LEGACY EXPORTS — kept for backward compatibility
// ============================================================================

/**
 * @deprecated Use extractAssetsForTree instead
 * Take screenshot of a specific node
 */
export async function captureNodeScreenshot(
  client: CDPClient,
  nodeId: number
): Promise<string | null> {
  try {
    const boxModel = await client.send<{
      model: { content: number[]; width: number; height: number };
    }>("DOM.getBoxModel", { nodeId });

    const [x, y] = boxModel.model.content;
    const { width, height } = boxModel.model;

    const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      clip: { x, y, width, height, scale: 1 },
    });

    return `data:image/png;base64,${screenshot.data}`;
  } catch {
    return null;
  }
}
