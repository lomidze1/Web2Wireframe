/**
 * CSS extraction using CDP
 * This is the KEY difference from Puppeteer - we get MATCHED rules, not just computed
 */

import { CDPClient } from "./client";
import type { CDPMatchedStyles, CDPComputedStyle, CDPFontFace, CDPCSSRule } from "@/shared/types";

interface GetMatchedStylesResult {
  inlineStyle?: object;
  attributesStyle?: object;
  matchedCSSRules?: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  pseudoElements?: Array<{ pseudoType: string; matches: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }> }>;
  inherited?: Array<{ inlineStyle?: object; matchedCSSRules: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }> }>;
  cssKeyframesRules?: object[];
}

interface GetComputedStyleResult {
  computedStyle: CDPComputedStyle[];
}

interface GetPlatformFontsResult {
  fonts: Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>;
}

/**
 * Get MATCHED CSS rules for a node
 * This is the critical difference from getComputedStyle!
 * Returns the actual CSS rules that matched, preserving:
 * - Gradients
 * - CSS Variables (original var() syntax)
 * - Hover/focus/active states
 * - Media queries
 */
export async function getMatchedStylesForNode(
  client: CDPClient,
  nodeId: number
): Promise<CDPMatchedStyles | null> {
  try {
    const result = await client.send<GetMatchedStylesResult>(
      "CSS.getMatchedStylesForNode",
      { nodeId }
    );
    return result as CDPMatchedStyles;
  } catch {
    return null;
  }
}

/**
 * Get computed style for a node (fallback)
 */
export async function getComputedStyleForNode(
  client: CDPClient,
  nodeId: number
): Promise<Record<string, string>> {
  try {
    const result = await client.send<GetComputedStyleResult>(
      "CSS.getComputedStyleForNode",
      { nodeId }
    );

    const styles: Record<string, string> = {};
    for (const prop of result.computedStyle) {
      styles[prop.name] = prop.value;
    }
    return styles;
  } catch {
    return {};
  }
}

/**
 * Get inline styles for a node
 */
export async function getInlineStylesForNode(
  client: CDPClient,
  nodeId: number
): Promise<{ inlineStyle?: object; attributesStyle?: object } | null> {
  try {
    const result = await client.send<{ inlineStyle?: object; attributesStyle?: object }>(
      "CSS.getInlineStylesForNode",
      { nodeId }
    );
    return result;
  } catch {
    return null;
  }
}

/**
 * Get all stylesheets in the document
 */
export async function getAllStyleSheets(
  client: CDPClient
): Promise<Array<{ styleSheetId: string; sourceURL: string; title: string }>> {
  // This requires listening to CSS.styleSheetAdded events
  // For now, we'll use a simpler approach via Runtime.evaluate
  const result = await client.send<{ result: { value: object[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        Array.from(document.styleSheets).map(sheet => ({
          href: sheet.href,
          title: sheet.title,
          ownerNode: sheet.ownerNode?.tagName,
          cssRulesCount: sheet.cssRules?.length || 0
        }))
      `,
      returnByValue: true,
    }
  );
  return result.result.value as Array<{ styleSheetId: string; sourceURL: string; title: string }>;
}

/**
 * Get stylesheet content by ID
 */
export async function getStyleSheetText(
  client: CDPClient,
  styleSheetId: string
): Promise<string> {
  const result = await client.send<{ text: string }>("CSS.getStyleSheetText", {
    styleSheetId,
  });
  return result.text;
}

/**
 * Get platform fonts used for a node (actual rendered fonts)
 */
export async function getPlatformFontsForNode(
  client: CDPClient,
  nodeId: number
): Promise<Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>> {
  try {
    const result = await client.send<GetPlatformFontsResult>(
      "CSS.getPlatformFontsForNode",
      { nodeId }
    );
    return result.fonts;
  } catch {
    return [];
  }
}

/**
 * Extract font-face rules from stylesheets
 */
export async function getFontFaceRules(
  client: CDPClient
): Promise<CDPFontFace[]> {
  const result = await client.send<{ result: { value: CDPFontFace[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const fontFaces = [];
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules || []) {
                if (rule instanceof CSSFontFaceRule) {
                  fontFaces.push({
                    fontFamily: rule.style.fontFamily,
                    fontStyle: rule.style.fontStyle || 'normal',
                    fontWeight: rule.style.fontWeight || '400',
                    src: rule.style.src,
                    unicodeRange: rule.style.unicodeRange || ''
                  });
                }
              }
            } catch (e) {
              // Cross-origin stylesheet, skip
            }
          }
          return fontFaces;
        })()
      `,
      returnByValue: true,
    }
  );
  return result.result.value;
}

/**
 * Extract specific CSS property from matched rules
 * Finds the most specific rule that sets this property
 */
export function extractPropertyFromMatchedRules(
  matchedStyles: CDPMatchedStyles,
  propertyName: string
): string | null {
  // Check inline style first (highest priority)
  if (matchedStyles.inlineStyle?.cssProperties) {
    const prop = matchedStyles.inlineStyle.cssProperties.find(
      (p) => p.name === propertyName
    );
    if (prop && prop.value && prop.value !== "initial") {
      return prop.value;
    }
  }

  // Then check matched rules (in order of specificity)
  if (matchedStyles.matchedCSSRules) {
    for (const match of matchedStyles.matchedCSSRules) {
      const prop = match.rule.style.cssProperties.find(
        (p) => p.name === propertyName
      );
      if (prop && prop.value && prop.value !== "initial") {
        return prop.value;
      }
    }
  }

  // Check inherited styles
  if (matchedStyles.inherited) {
    for (const inherited of matchedStyles.inherited) {
      if (inherited.inlineStyle?.cssProperties) {
        const prop = inherited.inlineStyle.cssProperties.find(
          (p) => p.name === propertyName
        );
        if (prop && prop.value && prop.value !== "initial") {
          return prop.value;
        }
      }
    }
  }

  return null;
}

/**
 * Extract all hover state styles for a node
 */
export function extractPseudoStyles(
  matchedStyles: CDPMatchedStyles,
  pseudoType: "hover" | "focus" | "active"
): Record<string, string> | null {
  if (!matchedStyles.pseudoElements) return null;

  const pseudo = matchedStyles.pseudoElements.find(
    (p) => p.pseudoType === pseudoType
  );
  if (!pseudo) return null;

  const styles: Record<string, string> = {};
  for (const match of pseudo.matches) {
    for (const prop of match.rule.style.cssProperties) {
      if (prop.value && prop.value !== "initial") {
        styles[prop.name] = prop.value;
      }
    }
  }

  return Object.keys(styles).length > 0 ? styles : null;
}
