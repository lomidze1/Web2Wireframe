/**
 * Font extraction using CDP
 */

import { CDPClient } from "./client";
import type { ExtractedFont } from "@/shared/types";

/**
 * Extract all fonts used on the page
 */
export async function extractFonts(client: CDPClient): Promise<ExtractedFont[]> {
  const fonts: ExtractedFont[] = [];

  // Get @font-face rules
  const fontFaceRules = await getFontFaceFromStylesheets(client);
  fonts.push(...fontFaceRules);

  // Get Google Fonts from link tags
  const googleFonts = await getGoogleFonts(client);
  fonts.push(...googleFonts);

  return fonts;
}

/**
 * Get @font-face rules from stylesheets
 */
async function getFontFaceFromStylesheets(client: CDPClient): Promise<ExtractedFont[]> {
  const result = await client.send<{ result: { value: ExtractedFont[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const fonts = [];
          const processedFamilies = new Set();

          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules || []) {
                if (rule instanceof CSSFontFaceRule) {
                  const family = rule.style.fontFamily?.replace(/['"]/g, '').trim();
                  if (family && !processedFamilies.has(family)) {
                    processedFamilies.add(family);

                    const src = rule.style.src || '';
                    let format = 'unknown';
                    if (src.includes('.woff2')) format = 'woff2';
                    else if (src.includes('.woff')) format = 'woff';
                    else if (src.includes('.ttf')) format = 'truetype';
                    else if (src.includes('.otf')) format = 'opentype';

                    fonts.push({
                      family: family,
                      style: rule.style.fontStyle || 'normal',
                      weight: rule.style.fontWeight || '400',
                      src: src,
                      format: format,
                      isGoogleFont: src.includes('fonts.gstatic.com') || src.includes('fonts.googleapis.com')
                    });
                  }
                }
              }
            } catch (e) {
              // Cross-origin stylesheet
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
 * Get actually rendered fonts for the page (what the browser actually uses)
 */
export async function getRenderedFonts(
  client: CDPClient,
  nodeId: number
): Promise<Array<{ familyName: string; isCustomFont: boolean }>> {
  try {
    const result = await client.send<{
      fonts: Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>;
    }>("CSS.getPlatformFontsForNode", { nodeId });
    return result.fonts.map((f) => ({
      familyName: f.familyName,
      isCustomFont: f.isCustomFont,
    }));
  } catch {
    return [];
  }
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
