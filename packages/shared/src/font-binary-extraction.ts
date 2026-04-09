/**
 * Font Binary Extraction (content script approach)
 *
 * Extracts font binary files from browser cache via CDP Page.getResourceContent.
 * Zero additional HTTP requests — reads directly from browser cache.
 *
 * Two-strategy approach:
 * 1. Try resourceGraph.fonts (if browser cached the font resource)
 * 2. Direct Page.getResourceContent with mainFrameId (bypasses resourceGraph)
 */

import type { CDPClientInterface, ExtractedFont } from "./types";
import type { ResourceGraph, ResourceEntry } from "./resource-graph";
import { getResourceBase64 } from "./resource-graph";

// ============================================================================
// URL extraction from CSS src property
// ============================================================================

/**
 * Extract download URLs from CSS @font-face src property.
 * Handles: url("https://..."), url('https://...'), url(https://...)
 * Ignores: data: URIs
 */
export function extractUrlsFromSrc(src: string): string[] {
  const urls: string[] = [];
  const regex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;
  let match;
  while ((match = regex.exec(src)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// ============================================================================
// MIME type guessing from URL extension
// ============================================================================

/**
 * Guess font MIME type from URL file extension.
 * Used when font is not in resourceGraph (Strategy 2 fallback).
 */
function guessFontMimeType(url: string): string {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (ext === "woff2") return "font/woff2";
  if (ext === "woff") return "font/woff";
  if (ext === "ttf") return "font/ttf";
  if (ext === "otf") return "font/otf";
  if (ext === "eot") return "application/vnd.ms-fontobject";
  return "font/woff2"; // Default
}

// ============================================================================
// Font Binary Extraction
// ============================================================================

/**
 * Enrich ExtractedFont[] with binary data from browser cache.
 *
 * Strategy 1: Look up font URL in resourceGraph.fonts (pre-cached by browser)
 * Strategy 2: Direct Page.getResourceContent call with mainFrameId
 *             (works even when fonts aren't in the resource tree yet)
 *
 * @param client - CDP client (must have Page domain enabled)
 * @param fonts - Extracted font metadata (from @font-face parsing)
 * @param resourceGraph - Pre-built resource graph (from buildResourceGraph)
 * @returns Enriched fonts with fontBase64 and fontMimeType fields populated
 */
export async function extractFontBinaries(
  client: CDPClientInterface,
  fonts: ExtractedFont[],
  resourceGraph: ResourceGraph
): Promise<ExtractedFont[]> {
  if (!fonts.length) {
    return fonts;
  }

  const mainFrameId = resourceGraph.frameId;
  console.log(`[W2W-FontBinary] extractFontBinaries called: ${fonts.length} fonts, mainFrameId="${mainFrameId}", resourceGraph.fonts=${resourceGraph.fonts.length}`);

  // Build URL → ResourceEntry map from resourceGraph.fonts (may be empty on cold starts)
  const fontResourceMap = new Map<string, ResourceEntry>();
  for (const entry of resourceGraph.fonts) {
    fontResourceMap.set(entry.url, entry);
  }

  const enrichedFonts: ExtractedFont[] = [];

  for (const font of fonts) {
    // Extract actual URLs from CSS src property
    const urls = extractUrlsFromSrc(font.src);
    let fontBase64: string | undefined;
    let fontMimeType: string | undefined;

    for (const url of urls) {
      console.log(`[W2W-FontBinary]   Trying URL: ${url.substring(0, 80)}...`);

      // Strategy 1: Try resourceGraph entry (fastest — already indexed)
      const resource = fontResourceMap.get(url);
      if (resource) {
        console.log(`[W2W-FontBinary]   Strategy 1: found in resourceGraph`);
        try {
          const base64 = await getResourceBase64(client, resource);
          if (base64) {
            fontBase64 = base64;
            fontMimeType = resource.mimeType;
            console.log(`[W2W-FontBinary]   ✅ Strategy 1 SUCCESS: ${base64.length} chars`);
            break;
          }
        } catch (err) {
          console.log(`[W2W-FontBinary]   Strategy 1 FAILED: ${err}`);
        }
      }

      // Strategy 2: Direct Page.getResourceContent with mainFrameId
      if (!fontBase64) {
        console.log(`[W2W-FontBinary]   Strategy 2: direct Page.getResourceContent(${mainFrameId}, ${url.substring(0, 60)})`);
        try {
          const result = await client.send<{ content: string; base64Encoded: boolean }>(
            "Page.getResourceContent",
            { frameId: mainFrameId, url }
          );
          if (result.content && result.base64Encoded) {
            fontBase64 = result.content;
            fontMimeType = guessFontMimeType(url);
            console.log(`[W2W-FontBinary]   ✅ Strategy 2 SUCCESS: ${result.content.length} chars, mime=${fontMimeType}`);
            break;
          }
        } catch (err) {
          console.log(`[W2W-FontBinary]   ❌ Strategy 2 FAILED: ${err}`);
        }
      }

      // Strategy 3: Direct HTTP fetch (server-side only, no CSP restrictions)
      if (!fontBase64 && typeof globalThis.fetch === "function") {
        console.log(`[W2W-FontBinary]   Strategy 3: HTTP fetch ${url.substring(0, 60)}`);
        try {
          const response = await fetch(url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            // Convert to base64
            let binary = "";
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            fontBase64 = typeof btoa === "function"
              ? btoa(binary)
              : Buffer.from(arrayBuffer).toString("base64");
            fontMimeType = guessFontMimeType(url);
            console.log(`[W2W-FontBinary]   ✅ Strategy 3 SUCCESS: ${fontBase64.length} chars, mime=${fontMimeType}`);
            break;
          } else {
            console.log(`[W2W-FontBinary]   ❌ Strategy 3: HTTP ${response.status}`);
          }
        } catch (err) {
          console.log(`[W2W-FontBinary]   ❌ Strategy 3 FAILED: ${err}`);
        }
      }
    }

    console.log(`[W2W-FontBinary] Font "${font.family}": ${fontBase64 ? `✅ GOT ${fontBase64.length} chars` : "❌ NO binary"}`);
    enrichedFonts.push({
      ...font,
      ...(fontBase64 ? { fontBase64, fontMimeType } : {}),
    });
  }

  return enrichedFonts;
}
