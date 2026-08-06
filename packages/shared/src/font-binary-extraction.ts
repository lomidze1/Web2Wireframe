/* eslint-disable no-console -- font fallback resolution is a major source
 * of extraction bugs; these traces are essential for debugging unfamiliar
 * sites and are silenced in prod by the consumer's gateConsoleInProduction(). */

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
 *
 * Two shapes reach this parser and BOTH must work:
 *   - raw CSS, wrapped:  `url("https://...") format("woff2")`
 *   - w2w capture, bare: `https://... format("woff2")`
 * The browser-extension capture strips the wrapper on purpose before storing a
 * face ("Clean src: strip url() wrapper for clean URL storage"), so insisting
 * on `url(...)` returned nothing for every captured page — the capture then
 * never asked the content script for the font bytes and dropped the font
 * assets it held, leaving the plugin's font ZIP empty (iwm.org.uk).
 *
 * Ignores: `local()`, `data:` URIs — neither is downloadable.
 */
export function extractUrlsFromSrc(src: string): string[] {
  // The first alternative consumes the whole `url(...)`, so a wrapped URL can
  // never also be picked up by the bare-URL alternative.
  const regex = /url\(\s*['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)|(https?:\/\/[^\s'")\],]+)/g;
  const urls: string[] = [];
  for (const match of src.matchAll(regex)) {
    urls.push(match[1] || match[2]);
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
// URL candidate ordering
// ============================================================================

/**
 * Rank a font URL by how useful its bytes are downstream. The plugin's fonts
 * ZIP exists so users can INSTALL the font — macOS Font Book and Windows take
 * TTF/OTF and reject WOFF/WOFF2 (web wrappers) and EOT (IE-only legacy).
 * Lower rank = tried first.
 */
function installabilityRank(url: string): number {
  const lower = url.toLowerCase();
  // SVG fonts are dead everywhere (no OS install, no modern browser) and an
  // uncompressed EOT at least unwraps to its SFNT — rank SVG very last.
  if (lower.includes(".svg")) return 5;
  if (lower.includes(".eot") || lower.includes("format=eot")) return 4;
  if (lower.includes(".ttf") || lower.includes(".otf") || lower.includes(".ttc")) return 0;
  if (lower.includes(".woff2")) return 1;
  if (lower.includes(".woff")) return 2;
  return 3;
}

/**
 * Order candidate URLs by installability, keeping declaration order within a
 * rank. The "bulletproof" @font-face pattern declares the IE-only .eot FIRST,
 * so declaration-order trying embedded EOT bytes even when the same face
 * declared a real .ttf (telex.ge shipped exactly this). EOT stays as a last
 * resort — if it is the only URL, bad bytes beat no bytes.
 *
 * Exported for every font-binding site (the API's W2W pipeline has its own
 * binding loop in w2w-extraction.ts that must apply the same ordering).
 */
export function orderUrlsByInstallability(urls: string[]): string[] {
  return urls
    .map((url, index) => ({ url, index }))
    .sort(
      (a, b) =>
        installabilityRank(a.url) - installabilityRank(b.url) ||
        a.index - b.index
    )
    .map((entry) => entry.url);
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
    // Extract actual URLs from CSS src property, best-installable first
    // (see orderUrlsByInstallability — never let a first-declared EOT win).
    const urls = orderUrlsByInstallability(extractUrlsFromSrc(font.src));
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
