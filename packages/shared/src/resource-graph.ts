/**
 * Unified Resource Graph — single Page.getResourceTree call, shared across fonts + assets.
 *
 * Replaces the duplicated calls in fonts.ts and assets.ts with a single
 * resource enumeration that both subsystems consume.
 */

import type { CDPClientInterface } from "./types";

// ============================================================================
// Types
// ============================================================================

export type ResourceType = "stylesheet" | "image" | "font" | "svg" | "script" | "other";

export interface ResourceEntry {
  url: string;
  frameId: string;
  mimeType: string;
  type: ResourceType;
  contentSize?: number;
}

export interface ResourceGraph {
  /** url → entry (deduplicated) */
  entries: Map<string, ResourceEntry>;
  /** CSS files only */
  stylesheets: ResourceEntry[];
  /** image/* (excluding SVG) */
  images: ResourceEntry[];
  /** font/* or application/font-* */
  fonts: ResourceEntry[];
  /** image/svg+xml */
  svgs: ResourceEntry[];
  /** Main frame ID */
  frameId: string;
}

// ============================================================================
// CDP types (internal)
// ============================================================================

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

// ============================================================================
// Classification
// ============================================================================

/**
 * Classify a resource by MIME type and URL into a ResourceType.
 */
export function classifyResource(mimeType: string, url: string): ResourceType {
  const mime = mimeType.toLowerCase();

  // SVG (before generic image check)
  if (mime === "image/svg+xml") return "svg";

  // Stylesheets
  if (mime === "text/css") return "stylesheet";

  // Images
  if (mime.startsWith("image/")) return "image";

  // Fonts
  if (
    mime.startsWith("font/") ||
    mime.startsWith("application/font-") ||
    mime === "application/x-font-woff" ||
    mime === "application/x-font-ttf" ||
    mime === "application/x-font-opentype" ||
    mime === "application/vnd.ms-fontobject"
  ) {
    return "font";
  }

  // Scripts
  if (
    mime === "application/javascript" ||
    mime === "text/javascript" ||
    mime === "application/x-javascript"
  ) {
    return "script";
  }

  // Fallback: check URL extension for ambiguous MIME types
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (ext === "css") return "stylesheet";
  if (ext === "svg") return "svg";
  if (ext === "woff" || ext === "woff2" || ext === "ttf" || ext === "otf" || ext === "eot") return "font";

  return "other";
}

// ============================================================================
// Building the graph
// ============================================================================

/**
 * Build resource graph from CDP — one Page.getResourceTree call.
 * Recursively flattens child frames.
 */
export async function buildResourceGraph(
  client: CDPClientInterface
): Promise<ResourceGraph> {
  const entries = new Map<string, ResourceEntry>();
  let frameId = "";

  try {
    const result = await client.send<{ frameTree: FrameResourceTree }>(
      "Page.getResourceTree"
    );

    frameId = result.frameTree.frame.id;
    flattenFrameTree(result.frameTree, entries);
  } catch (error) {
    console.warn("[W2W] Failed to get resource tree:", error);
  }

  // Categorize
  const stylesheets: ResourceEntry[] = [];
  const images: ResourceEntry[] = [];
  const fonts: ResourceEntry[] = [];
  const svgs: ResourceEntry[] = [];

  for (const entry of entries.values()) {
    switch (entry.type) {
      case "stylesheet":
        stylesheets.push(entry);
        break;
      case "image":
        images.push(entry);
        break;
      case "font":
        fonts.push(entry);
        break;
      case "svg":
        svgs.push(entry);
        break;
    }
  }

  return { entries, stylesheets, images, fonts, svgs, frameId };
}

/**
 * Recursively flatten FrameResourceTree into entries map.
 */
function flattenFrameTree(
  tree: FrameResourceTree,
  entries: Map<string, ResourceEntry>
): void {
  const frameId = tree.frame.id;

  for (const resource of tree.resources) {
    if (entries.has(resource.url)) continue; // deduplicate by URL

    const type = classifyResource(resource.mimeType, resource.url);
    entries.set(resource.url, {
      url: resource.url,
      frameId,
      mimeType: resource.mimeType,
      type,
      contentSize: resource.contentSize,
    });
  }

  // Recurse into child frames (iframes)
  if (tree.childFrames) {
    for (const child of tree.childFrames) {
      flattenFrameTree(child.frameResourceTree, entries);
    }
  }
}

// ============================================================================
// Content retrieval
// ============================================================================

/**
 * Get resource content as text (CSS, SVG).
 */
export async function getResourceText(
  client: CDPClientInterface,
  entry: ResourceEntry
): Promise<string | null> {
  try {
    const result = await client.send<{ content: string; base64Encoded: boolean }>(
      "Page.getResourceContent",
      { frameId: entry.frameId, url: entry.url }
    );

    if (result.base64Encoded) {
      // Decode base64 to text — prefer Buffer (Node) for correct UTF-8,
      // atob returns Latin-1 which corrupts multi-byte characters
      return typeof Buffer !== "undefined"
        ? Buffer.from(result.content, "base64").toString("utf-8")
        : atob(result.content);
    }

    return result.content;
  } catch {
    return null;
  }
}

/**
 * Get resource content as base64 (images, fonts).
 */
export async function getResourceBase64(
  client: CDPClientInterface,
  entry: ResourceEntry
): Promise<string | null> {
  try {
    const result = await client.send<{ content: string; base64Encoded: boolean }>(
      "Page.getResourceContent",
      { frameId: entry.frameId, url: entry.url }
    );

    if (result.base64Encoded) {
      return result.content;
    }

    // Text content (e.g., SVG) — encode to base64
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(result.content)));
    }
    return Buffer.from(result.content, "utf-8").toString("base64");
  } catch {
    return null;
  }
}

// ============================================================================
// Asset extraction — tree walking + resource resolution
// ============================================================================

/** Info needed to fetch a resource from the browser cache */
export interface ResourceInfo {
  frameId: string;
  mimeType: string;
}

/** Options for extractAssetsForTree */
export interface ExtractAssetsOptions {
  /** Max base64 bytes per single image (default 2MB) */
  maxSingleImageBytes?: number;
  /** Max total base64 bytes across all images (default 30MB) */
  maxTotalBytes?: number;
  /**
   * Optional platform-specific image format converter.
   * Called for MIME types that Figma doesn't support natively (e.g., AVIF, HEIC).
   * Browser Extension can pass an OffscreenCanvas-based converter;
   * Node.js callers can pass a sharp-based converter or omit to skip unsupported formats.
   */
  convertImage?: (
    base64: string,
    mimeType: string
  ) => Promise<{ base64: string; mimeType: string } | null>;
}

/** MIME types that figma.createImage() supports natively.
 * NOTE: WebP is NOT supported by figma.createImage() — it throws "Image type is unsupported".
 * TIFF is also unsupported. Both need conversion to PNG via convertImage callback.
 */
const FIGMA_SUPPORTED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
]);

/** Check if a MIME type needs conversion for Figma compatibility */
function needsFigmaConversion(mimeType: string): boolean {
  if (!mimeType.startsWith("image/")) return false;
  if (mimeType === "image/svg+xml") return false; // SVGs handled separately
  return !FIGMA_SUPPORTED_MIMES.has(mimeType);
}

/**
 * Build a URL→ResourceInfo lookup map from a pre-built ResourceGraph.
 * Sync — no CDP calls. Maps image + SVG URLs to their frame ID and MIME type.
 */
export function buildResourceMapFromGraph(
  resourceGraph: ResourceGraph
): Map<string, ResourceInfo> {
  const map = new Map<string, ResourceInfo>();

  for (const entry of resourceGraph.images) {
    map.set(entry.url, { frameId: entry.frameId, mimeType: entry.mimeType });
  }

  for (const entry of resourceGraph.svgs) {
    map.set(entry.url, { frameId: entry.frameId, mimeType: entry.mimeType });
  }

  return map;
}

/** Minimal tree node shape for walking — avoids importing full ExtractedElement */
interface AssetTreeNode {
  imageUrl?: string;
  additionalImageUrls?: string[];
  children?: AssetTreeNode[];
}

/**
 * Walk an ExtractedElement tree and collect all unique image URLs.
 */
export function collectImageUrls(tree: AssetTreeNode): Set<string> {
  const urls = new Set<string>();

  function walk(node: AssetTreeNode): void {
    if (node.imageUrl) {
      urls.add(node.imageUrl);
    }
    if (node.additionalImageUrls) {
      for (const url of node.additionalImageUrls) {
        urls.add(url);
      }
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

// ---------------------------------------------------------------------------
// W2W tree asset collection
// ---------------------------------------------------------------------------

/** Minimal W2W node shape for walking — avoids importing full W2WFrameNode */
interface W2WAssetNode {
  type: string;
  $url?: string;
  styles?: Record<string, string | number>;
  children?: W2WAssetNode[];
}

/**
 * Walk a W2WFrameNode tree and collect all unique image URLs.
 *
 * W2W trees store image references differently from ExtractedElement:
 * - `$url` on FRAME nodes (resolved img.src / video.poster / background-image primary)
 * - `styles.backgroundImage` may contain additional `url()` references
 */
export function collectImageUrlsFromW2W(tree: W2WAssetNode): Set<string> {
  const urls = new Set<string>();

  function walk(node: W2WAssetNode): void {
    if (node.type !== "FRAME") return;

    // Direct image URL (img src, video poster, or primary bg image)
    if (node.$url) urls.add(node.$url);

    // Background image URLs from styles
    const bgImg = node.styles?.backgroundImage;
    if (bgImg && typeof bgImg === "string" && bgImg !== "none") {
      const matches = bgImg.matchAll(/url\(\s*['"]?(.*?)['"]?\s*\)/g);
      for (const m of matches) {
        if (m[1]) urls.add(m[1]);
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(tree);
  return urls;
}

/**
 * Extract real image assets for a tree of elements.
 *
 * Walks the tree to find all imageUrl references, then resolves each
 * against the resource map (browser cache). Returns a URL→data URI map.
 *
 * - Data: URIs — extracted directly (base64 passthrough)
 * - Normal URLs — resolved via Page.getResourceContent (browser cache)
 * - Size limits: skip images >2MB, stop collecting at >30MB total
 * - Deduplication: each URL resolved only once
 */
export async function extractAssetsForTree(
  client: CDPClientInterface,
  tree: AssetTreeNode,
  resourceMap: Map<string, ResourceInfo>,
  options?: ExtractAssetsOptions
): Promise<Record<string, string>> {
  const maxSingle = options?.maxSingleImageBytes ?? 2 * 1024 * 1024;
  const maxTotal = options?.maxTotalBytes ?? 30 * 1024 * 1024;
  const convertImage = options?.convertImage;

  const assets: Record<string, string> = {};
  let totalBytes = 0;

  const urls = collectImageUrls(tree);
  console.log(`[W2W-DEBUG] extractAssetsForTree: ${urls.size} image URLs found in tree`);
  console.log(`[W2W-DEBUG] resourceMap has ${resourceMap.size} entries`);
  console.log(`[W2W-DEBUG] convertImage callback: ${convertImage ? "PROVIDED" : "MISSING"}`);
  if (urls.size > 0) {
    const urlSample = [...urls].slice(0, 5);
    for (const u of urlSample) {
      const inMap = resourceMap.has(u);
      const info = resourceMap.get(u);
      console.log(`[W2W-DEBUG]   URL: ${u.substring(0, 80)}... | inResourceMap: ${inMap} | mime: ${info?.mimeType ?? "N/A"}`);
    }
  }
  if (urls.size === 0) return assets;

  for (const url of urls) {
    if (totalBytes >= maxTotal) break;

    // Handle data: URIs — already inline
    if (url.startsWith("data:")) {
      const commaIndex = url.indexOf(",");
      if (commaIndex !== -1) {
        let base64Data = url.substring(commaIndex + 1);
        const header = url.substring(0, commaIndex);
        let effectiveMime = header.replace("data:", "").replace(";base64", "");

        if (needsFigmaConversion(effectiveMime) && convertImage) {
          const converted = await convertImage(base64Data, effectiveMime);
          if (!converted) continue;
          base64Data = converted.base64;
          effectiveMime = converted.mimeType;
        } else if (needsFigmaConversion(effectiveMime)) {
          continue; // Skip unsupported format without converter
        }

        if (base64Data.length <= maxSingle) {
          assets[url] = `data:${effectiveMime};base64,${base64Data}`;
          totalBytes += base64Data.length;
        }
      }
      continue;
    }

    // Look up URL in resource map (browser cache)
    const resourceInfo = resourceMap.get(url);
    if (!resourceInfo) {
      console.log(`[W2W-DEBUG] SKIP (not in resourceMap): ${url.substring(0, 80)}`);
      continue;
    }

    // Fetch from browser cache via Page.getResourceContent
    const entry: ResourceEntry = {
      url,
      frameId: resourceInfo.frameId,
      mimeType: resourceInfo.mimeType,
      type: "image",
    };
    const base64 = await getResourceBase64(client, entry);
    if (!base64) {
      console.log(`[W2W-DEBUG] SKIP (getResourceBase64 returned null): ${url.substring(0, 80)}`);
      continue;
    }
    console.log(`[W2W-DEBUG] GOT base64 for ${url.substring(0, 60)}... | mime: ${resourceInfo.mimeType} | size: ${(base64.length / 1024).toFixed(0)}KB | needsConversion: ${needsFigmaConversion(resourceInfo.mimeType)}`);

    if (base64.length > maxSingle) continue;

    // Convert unsupported formats if converter provided
    let finalBase64 = base64;
    let finalMimeType = resourceInfo.mimeType;

    if (needsFigmaConversion(resourceInfo.mimeType)) {
      if (convertImage) {
        const converted = await convertImage(base64, resourceInfo.mimeType);
        if (!converted) continue;
        finalBase64 = converted.base64;
        finalMimeType = converted.mimeType;
        if (finalBase64.length > maxSingle) continue;
      } else {
        continue; // Skip unsupported format without converter
      }
    }

    assets[url] = `data:${finalMimeType};base64,${finalBase64}`;
    totalBytes += finalBase64.length;
    console.log(`[W2W-DEBUG] ✅ ADDED asset: ${url.substring(0, 60)}... | ${finalMimeType} | ${(finalBase64.length / 1024).toFixed(0)}KB`);
  }

  console.log(`[W2W-DEBUG] extractAssetsForTree DONE: ${Object.keys(assets).length} assets, ${(totalBytes / 1024).toFixed(0)}KB total`);
  return assets;
}
