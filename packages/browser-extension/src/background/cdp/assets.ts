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

/** MIME types that figma.createImage() supports natively.
 * NOTE: WebP is NOT supported by figma.createImage() — it throws "Image type is unsupported".
 * TIFF is also unsupported. Both need conversion to PNG via convertToFigmaFormat().
 */
const FIGMA_SUPPORTED_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif",
]);

/** Check if a MIME type needs conversion for Figma compatibility */
function needsFigmaConversion(mimeType: string): boolean {
  if (!mimeType.startsWith("image/")) return false;
  if (mimeType === "image/svg+xml") return false; // SVGs handled separately
  return !FIGMA_SUPPORTED_MIMES.has(mimeType);
}

/** Encode Uint8Array to base64 string — works in service worker */
function uint8ToBase64(bytes: Uint8Array): string {
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
  childFrames?: Array<{ frameResourceTree: FrameResourceTree }>;
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
      flattenResources(child.frameResourceTree, map);
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
 */
export async function extractAssetsForTree(
  client: CDPClient,
  tree: TreeNode,
  resourceMap: Map<string, ResourceInfo>
): Promise<Record<string, string>> {
  const assets: Record<string, string> = {};
  let totalBytes = 0;

  // Collect all unique imageUrls from the tree
  const urls = collectImageUrls(tree);

  // [W2W Debug #9] All image URLs from tree
  console.log("[W2W Debug #9] Image URLs from tree:", {
    count: urls.size,
    urls: Array.from(urls).map((u) => u.substring(0, 120)),
  });

  if (urls.size === 0) {
    return assets;
  }


  for (const url of urls) {
    // Stop if total size limit reached
    if (totalBytes >= MAX_TOTAL_BYTES) {
      console.warn(`[W2W] Total asset size limit reached (${Math.round(totalBytes / 1024 / 1024)}MB), skipping remaining images`);
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
          if (!converted) continue;
          base64Data = converted.base64;
          effectiveMime = converted.mimeType;
        }

        if (base64Data.length <= MAX_SINGLE_IMAGE_BYTES) {
          assets[url] = `data:${effectiveMime};base64,${base64Data}`;
          totalBytes += base64Data.length;
        } else {
          console.warn(`[W2W] Skipping data URI (${Math.round(base64Data.length / 1024)}KB > 2MB limit)`);
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
      continue;
    }

    // Fetch from browser cache
    const base64 = await getResourceBase64(client, resourceInfo.frameId, url);
    if (!base64) {
      continue;
    }

    // Check single image size limit
    if (base64.length > MAX_SINGLE_IMAGE_BYTES) {
      console.warn(`[W2W] Skipping large image (${Math.round(base64.length / 1024)}KB): ${url}`);
      continue;
    }

    // Convert unsupported formats (AVIF, HEIC, etc.) to PNG for Figma
    let finalBase64 = base64;
    let finalMimeType = resourceInfo.mimeType;

    if (needsFigmaConversion(resourceInfo.mimeType)) {
      const converted = await convertToFigmaFormat(base64, resourceInfo.mimeType);
      if (!converted) continue;
      finalBase64 = converted.base64;
      finalMimeType = converted.mimeType;
      // Re-check size after conversion (PNG can be larger than AVIF)
      if (finalBase64.length > MAX_SINGLE_IMAGE_BYTES) {
        console.warn(`[W2W] Converted image too large (${Math.round(finalBase64.length / 1024)}KB): ${url}`);
        continue;
      }
    }

    // Build data URI with (possibly converted) mime type
    const dataUri = `data:${finalMimeType};base64,${finalBase64}`;
    assets[url] = dataUri;
    totalBytes += finalBase64.length;
  }


  return assets;
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
