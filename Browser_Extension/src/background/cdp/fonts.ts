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
 * Get Google Fonts from link tags
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
            // Parse Google Fonts URL
            // Format: https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap
            const familyMatch = href.match(/family=([^&]+)/);
            if (familyMatch) {
              const families = familyMatch[1].split('|');
              for (const familySpec of families) {
                // Parse family:wght@400;700 format
                const [family, variants] = familySpec.split(':');
                const cleanFamily = family.replace(/\\+/g, ' ');

                // Extract weights
                let weights = ['400'];
                if (variants) {
                  const weightsMatch = variants.match(/wght@([\\d;]+)/);
                  if (weightsMatch) {
                    weights = weightsMatch[1].split(';');
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
