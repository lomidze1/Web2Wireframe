/**
 * Font extraction using CDP
 *
 * Uses CSS.getStyleSheetText to bypass CORS restrictions and extract
 * @font-face rules from ALL stylesheets (including cross-origin CDN ones).
 */

import { CDPClient } from "./client";
import { getStyleSheetText } from "./css";
import { parseFontFaceRules, deduplicateFonts } from "./fontCssParser";
import type { ExtractedFont } from "@/shared/types";

/**
 * Extract all fonts used on the page
 * @param pageUrl - page URL used as fallback base for resolving relative font paths in inline stylesheets
 */
export async function extractFonts(client: CDPClient, pageUrl?: string): Promise<ExtractedFont[]> {
  const fonts: ExtractedFont[] = [];

  // Get @font-face rules via CDP (bypasses CORS)
  const fontFaceRules = await getFontFaceFromStylesheets(client, pageUrl);
  fonts.push(...fontFaceRules);

  // Get Google Fonts from link tags
  const googleFonts = await getGoogleFonts(client);
  fonts.push(...googleFonts);

  return deduplicateFonts(fonts);
}

/**
 * Collect all stylesheet headers via CSS.styleSheetAdded events,
 * then fetch each stylesheet's text and parse @font-face rules.
 *
 * This bypasses CORS — CDP has full access to all stylesheets.
 */
async function getFontFaceFromStylesheets(client: CDPClient, pageUrl?: string): Promise<ExtractedFont[]> {
  const stylesheets: Array<{ styleSheetId: string; sourceURL: string }> = [];

  // Listen for stylesheet events
  const removeListener = client.on("CSS.styleSheetAdded", (params) => {
    const header = (params as { header: { styleSheetId: string; sourceURL: string } }).header;
    stylesheets.push({
      styleSheetId: header.styleSheetId,
      sourceURL: header.sourceURL || "",
    });
  });

  // Re-enable CSS domain to trigger styleSheetAdded events for all existing sheets
  await client.send("CSS.disable");
  await client.send("CSS.enable");

  // Allow events to fire
  await new Promise((resolve) => setTimeout(resolve, 150));
  removeListener();

  // Fetch text for each stylesheet and parse @font-face rules
  const allFonts: ExtractedFont[] = [];

  for (const sheet of stylesheets) {
    try {
      const text = await getStyleSheetText(client, sheet.styleSheetId);
      if (text) {
        const fonts = parseFontFaceRules(text, sheet.sourceURL || pageUrl || "");
        allFonts.push(...fonts);
      }
    } catch {
      // Skip stylesheets that can't be read
    }
  }

  return allFonts;
}

/**
 * Get Google Fonts from link tags.
 *
 * Uses URL/URLSearchParams instead of regex so it survives Google Fonts URL
 * variations:
 *   - CSS1: ?family=Roboto:400,700 or ?family=Roboto|Open+Sans
 *   - CSS2 single axis:    ?family=Roboto:wght@400;700
 *   - CSS2 italic + weight: ?family=Roboto:ital,wght@0,400;1,700
 *   - CSS2 multi-family:   ?family=Inter&family=Roboto
 * Parse failures fall back to a console.warn + skip rather than crashing.
 */
async function getGoogleFonts(client: CDPClient): Promise<ExtractedFont[]> {
  const result = await client.send<{ result: { value: ExtractedFont[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const fonts = [];
          const googleFontLinks = document.querySelectorAll('link[href*="fonts.googleapis.com"]');

          for (const link of googleFontLinks) {
            const href = link.href;
            try {
              const url = new URL(href);
              // CSS2 supports multiple family= params; CSS1 supports a single
              // family= with '|'-separated entries. Handle both.
              const familyParams = url.searchParams.getAll('family');
              const familySpecs = [];
              for (const fp of familyParams) {
                for (const fs of fp.split('|')) {
                  if (fs) familySpecs.push(fs);
                }
              }

              for (const familySpec of familySpecs) {
                // Format: "Family Name" or "Family Name:axisList@values"
                const colonIdx = familySpec.indexOf(':');
                const rawFamily = colonIdx === -1 ? familySpec : familySpec.slice(0, colonIdx);
                const axisPart = colonIdx === -1 ? '' : familySpec.slice(colonIdx + 1);
                const cleanFamily = rawFamily.replace(/\\+/g, ' ');

                // Default weight when no axis info present.
                let weights = ['400'];
                if (axisPart) {
                  const atIdx = axisPart.indexOf('@');
                  if (atIdx !== -1) {
                    // CSS2: tag list followed by '@' then ;-separated value tuples.
                    const tags = axisPart.slice(0, atIdx).split(',');
                    const wghtIdx = tags.indexOf('wght');
                    const tuples = axisPart.slice(atIdx + 1).split(';');
                    if (wghtIdx !== -1) {
                      const collected = new Set();
                      for (const tuple of tuples) {
                        const parts = tuple.split(',');
                        const w = parts[wghtIdx];
                        if (w) collected.add(w.trim());
                      }
                      if (collected.size > 0) weights = Array.from(collected);
                    }
                  } else {
                    // CSS1 legacy: comma-separated weights, possibly suffixed
                    // with 'i' for italic (e.g. "400,700i"). We keep numeric prefix.
                    const collected = new Set();
                    for (const part of axisPart.split(',')) {
                      const num = part.replace(/[^0-9]/g, '');
                      if (num) collected.add(num);
                    }
                    if (collected.size > 0) weights = Array.from(collected);
                  }
                }

                for (const weight of weights) {
                  fonts.push({
                    family: cleanFamily,
                    style: 'normal',
                    weight: weight,
                    src: href,
                    format: 'google-fonts',
                    isGoogleFont: true
                  });
                }
              }
            } catch {
              // Bad URL or unexpected format — skip rather than crash.
            }
          }
          return fonts;
        })()
      `,
      returnByValue: true,
    }
  );

  return result.result.value;
}

/**
 * Get actually rendered fonts for a single node (what the browser actually uses)
 */
export async function getRenderedFonts(
  client: CDPClient,
  nodeId: number
): Promise<Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>> {
  try {
    const result = await client.send<{
      fonts: Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>;
    }>("CSS.getPlatformFontsForNode", { nodeId });
    return result.fonts;
  } catch {
    return [];
  }
}

/**
 * Collect platform fonts for all text nodes in bulk.
 * Calls CSS.getPlatformFontsForNode on every provided nodeId with concurrency batching.
 * Returns Map<backendNodeId, PlatformFontInfo[]>
 */
export async function collectPlatformFonts(
  client: CDPClient,
  textNodes: Array<{ backendNodeId: number; nodeId: number }>
): Promise<Map<number, Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>>> {
  const result = new Map<number, Array<{ familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }>>();
  const BATCH_SIZE = 10;

  for (let i = 0; i < textNodes.length; i += BATCH_SIZE) {
    const batch = textNodes.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async ({ backendNodeId, nodeId }) => {
      const fonts = await getRenderedFonts(client, nodeId);
      if (fonts.length > 0) {
        result.set(backendNodeId, fonts);
      }
    });
    await Promise.all(promises);
  }

  return result;
}

/**
 * Check if font is available in Figma
 * These are common fonts that Figma supports
 */
export function isFigmaCompatibleFont(fontFamily: string): boolean {
  const figmaFonts = [
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Source Sans Pro",
    "Nunito",
    "Raleway",
    "Ubuntu",
    "Playfair Display",
    "Merriweather",
    "Oswald",
    "PT Sans",
    "Noto Sans",
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Georgia",
    "Verdana",
  ];

  return figmaFonts.some(
    (f) => f.toLowerCase() === fontFamily.toLowerCase().replace(/['"]/g, "")
  );
}
