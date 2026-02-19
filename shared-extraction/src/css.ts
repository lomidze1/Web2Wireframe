/**
 * CSS extraction using CDP
 * This is the KEY difference from Puppeteer - we get MATCHED rules, not just computed
 */

import type {
  CDPClientInterface,
  CDPMatchedStyles,
  CDPComputedStyle,
  CDPFontFace,
  CDPCSSRule,
} from "./types";

interface GetMatchedStylesResult {
  inlineStyle?: object;
  attributesStyle?: object;
  matchedCSSRules?: Array<{
    rule: CDPCSSRule;
    matchingSelectors: number[];
  }>;
  pseudoElements?: Array<{
    pseudoType: string;
    matches: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  }>;
  inherited?: Array<{
    inlineStyle?: object;
    matchedCSSRules: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  }>;
  cssKeyframesRules?: object[];
}

interface GetComputedStyleResult {
  computedStyle: CDPComputedStyle[];
}

interface GetPlatformFontsResult {
  fonts: Array<{
    familyName: string;
    isCustomFont: boolean;
    glyphCount: number;
  }>;
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
  client: CDPClientInterface,
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
  client: CDPClientInterface,
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
  client: CDPClientInterface,
  nodeId: number
): Promise<{ inlineStyle?: object; attributesStyle?: object } | null> {
  try {
    const result = await client.send<{
      inlineStyle?: object;
      attributesStyle?: object;
    }>("CSS.getInlineStylesForNode", { nodeId });
    return result;
  } catch {
    return null;
  }
}

/**
 * Get all stylesheets in the document
 */
export async function getAllStyleSheets(
  client: CDPClientInterface
): Promise<
  Array<{ styleSheetId: string; sourceURL: string; title: string }>
> {
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
  return result.result.value as Array<{
    styleSheetId: string;
    sourceURL: string;
    title: string;
  }>;
}

/**
 * Get stylesheet content by ID
 */
export async function getStyleSheetText(
  client: CDPClientInterface,
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
  client: CDPClientInterface,
  nodeId: number
): Promise<
  Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>
> {
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
  client: CDPClientInterface
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
 *
 * CDP returns matchedCSSRules in ORDER OF INCREASING SPECIFICITY:
 * - User agent rules first (least specific)
 * - Author rules in document order
 * - More specific selectors LATER in the array
 *
 * So we need to return the LAST match, not the first!
 */
export function extractPropertyFromMatchedRules(
  matchedStyles: CDPMatchedStyles,
  propertyName: string
): string | null {
  // Helper to get original value from prop (prefer text over value)
  const getOriginalValue = (prop: {
    value: string;
    text?: string;
  }): string | null => {
    // prop.text contains the ORIGINAL CSS as written (e.g., "1px")
    // prop.value might contain computed/resolved value (e.g., "1.11111px")
    if (prop.text) {
      // text format is "property-name: value" or just "value"
      const textValue = prop.text.includes(":")
        ? prop.text.split(":")[1]?.trim().replace(/;$/, "").trim()
        : prop.text.trim();
      if (textValue && textValue !== "initial") {
        return textValue;
      }
    }
    // Fall back to value if text not available
    if (prop.value && prop.value !== "initial") {
      return prop.value;
    }
    return null;
  };

  // Check inline style first (highest priority)
  if (matchedStyles.inlineStyle?.cssProperties) {
    const prop = matchedStyles.inlineStyle.cssProperties.find(
      (p) => p.name === propertyName
    );
    if (prop) {
      const value = getOriginalValue(prop);
      if (value) return value;
    }
  }

  // Then check matched rules - iterate through ALL and keep the LAST match
  // because CDP returns rules in order of increasing specificity
  let result: string | null = null;

  if (matchedStyles.matchedCSSRules) {
    for (const match of matchedStyles.matchedCSSRules) {
      // Skip user-agent rules for author-defined properties
      if (match.rule.origin === "user-agent") continue;

      const prop = match.rule.style.cssProperties.find(
        (p) => p.name === propertyName
      );
      if (prop) {
        const value = getOriginalValue(prop);
        if (value) {
          result = value; // Keep updating - last one wins (most specific)
        }
      }
    }
  }

  if (result) return result;

  // Check inherited styles (only for inheritable properties)
  if (matchedStyles.inherited) {
    for (const inherited of matchedStyles.inherited) {
      if (inherited.inlineStyle?.cssProperties) {
        const prop = inherited.inlineStyle.cssProperties.find(
          (p) => p.name === propertyName
        );
        if (prop) {
          const value = getOriginalValue(prop);
          if (value) return value;
        }
      }
    }
  }

  return null;
}

/**
 * Extract border width from matched rules, handling both shorthand and longhand
 * CSS border shorthand: "1px solid red" -> extract "1px"
 * CSS border-width: "1px" -> return directly
 */
export function extractBorderWidthFromMatchedRules(
  matchedStyles: CDPMatchedStyles
): string | null {
  // First try to get border-width directly
  const borderWidth = extractPropertyFromMatchedRules(
    matchedStyles,
    "border-width"
  );
  if (borderWidth) return borderWidth;

  // Check border shorthand
  const borderShorthand = extractPropertyFromMatchedRules(
    matchedStyles,
    "border"
  );
  if (borderShorthand) {
    // Parse width from shorthand: "1px solid red" -> "1px"
    // Match patterns like "1px", "0.5em", "2rem", "thin", "medium", "thick"
    const widthMatch = borderShorthand.match(
      /^(\d+(?:\.\d+)?)(px|em|rem|%|pt)?/i
    );
    if (widthMatch) {
      return widthMatch[1] + (widthMatch[2] || "px");
    }
    // Handle keyword values
    if (/^(thin|medium|thick)\b/i.test(borderShorthand)) {
      const keyword = borderShorthand.match(/^(thin|medium|thick)/i)?.[1];
      if (keyword) return keyword.toLowerCase();
    }
  }

  // Try individual side widths
  const sides = [
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
  ];
  for (const side of sides) {
    const sideWidth = extractPropertyFromMatchedRules(matchedStyles, side);
    if (sideWidth) return sideWidth;
  }

  // Check shorthandEntries in matched rules
  if (matchedStyles.matchedCSSRules) {
    for (const match of matchedStyles.matchedCSSRules) {
      if (match.rule.origin === "user-agent") continue;

      const shorthandEntries = match.rule.style.shorthandEntries;
      if (shorthandEntries) {
        const borderEntry = shorthandEntries.find((e) => e.name === "border");
        if (borderEntry?.value) {
          const widthMatch = borderEntry.value.match(
            /^(\d+(?:\.\d+)?)(px|em|rem|%|pt)?/i
          );
          if (widthMatch) {
            return widthMatch[1] + (widthMatch[2] || "px");
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract individual border sides from matched rules
 * Returns original CSS values like "1px solid red" instead of computed "1.11111px solid rgb(..."
 * Falls back to computedStyles if not found in matched rules
 */
export function extractBorderSidesFromMatchedRules(
  matchedStyles: CDPMatchedStyles | null,
  computedStyles: Record<string, string>
): {
  borderTop: string | null;
  borderRight: string | null;
  borderBottom: string | null;
  borderLeft: string | null;
} {
  const result = {
    borderTop: computedStyles["border-top"] || null,
    borderRight: computedStyles["border-right"] || null,
    borderBottom: computedStyles["border-bottom"] || null,
    borderLeft: computedStyles["border-left"] || null,
  };

  if (!matchedStyles) return result;

  // Try to get original values from matched rules
  const matchedTop = extractPropertyFromMatchedRules(
    matchedStyles,
    "border-top"
  );
  const matchedRight = extractPropertyFromMatchedRules(
    matchedStyles,
    "border-right"
  );
  const matchedBottom = extractPropertyFromMatchedRules(
    matchedStyles,
    "border-bottom"
  );
  const matchedLeft = extractPropertyFromMatchedRules(
    matchedStyles,
    "border-left"
  );

  if (matchedTop) result.borderTop = matchedTop;
  if (matchedRight) result.borderRight = matchedRight;
  if (matchedBottom) result.borderBottom = matchedBottom;
  if (matchedLeft) result.borderLeft = matchedLeft;

  return result;
}

/**
 * Extract width from matched rules
 * Returns original CSS value like "fit-content", "auto", "100%", "200px"
 * Falls back to computedStyle if not found in matched rules
 */
export function extractWidthFromMatchedRules(
  matchedStyles: CDPMatchedStyles | null,
  computedWidth?: string
): string | null {
  if (!matchedStyles) return computedWidth || null;

  // Try direct width property from matched CSS rules
  const width = extractPropertyFromMatchedRules(matchedStyles, "width");

  // Return found width, or fall back to computed width
  return width || computedWidth || null;
}

/**
 * Extract height from matched rules
 * Returns original CSS value like "fit-content", "auto", "100%", "200px"
 * Falls back to computedStyle if not found in matched rules
 */
export function extractHeightFromMatchedRules(
  matchedStyles: CDPMatchedStyles | null,
  computedHeight?: string
): string | null {
  if (!matchedStyles) return computedHeight || null;

  // Try direct height property from matched CSS rules
  const height = extractPropertyFromMatchedRules(matchedStyles, "height");

  // Return found height, or fall back to computed height
  return height || computedHeight || null;
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

/**
 * CSS Variable with both original name and resolved value
 */
export interface CSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original CSS value (might reference other vars)
}

/**
 * Extract all CSS custom properties (variables) from the page
 * Extracts from :root, html, and body elements
 */
export async function extractCSSVariables(
  client: CDPClientInterface
): Promise<CSSVariable[]> {
  const result = await client.send<{ result: { value: CSSVariable[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const variables = [];
          const seen = new Set();

          // Get computed styles from root elements
          const rootElements = [document.documentElement, document.body];

          for (const el of rootElements) {
            if (!el) continue;
            const computed = getComputedStyle(el);

            // Iterate through all stylesheets to find CSS variable declarations
            for (const sheet of document.styleSheets) {
              try {
                for (const rule of sheet.cssRules || []) {
                  if (rule.style) {
                    for (let i = 0; i < rule.style.length; i++) {
                      const prop = rule.style[i];
                      if (prop.startsWith('--') && !seen.has(prop)) {
                        seen.add(prop);
                        const rawValue = rule.style.getPropertyValue(prop).trim();
                        // Get resolved value from computed style
                        const resolvedValue = computed.getPropertyValue(prop).trim();
                        variables.push({
                          name: prop,
                          value: resolvedValue || rawValue,
                          rawValue: rawValue
                        });
                      }
                    }
                  }
                }
              } catch (e) {
                // Cross-origin stylesheet, skip
              }
            }
          }

          return variables;
        })()
      `,
      returnByValue: true,
    }
  );

  return result.result.value || [];
}

/**
 * Resolve CSS value that may contain var() references
 * Returns both the original and resolved value
 */
export async function resolveCSSValue(
  client: CDPClientInterface,
  nodeId: number,
  cssValue: string
): Promise<{ original: string; resolved: string }> {
  // If no var() in value, return as-is
  if (!cssValue.includes("var(")) {
    return { original: cssValue, resolved: cssValue };
  }

  try {
    // Get computed style for this node to resolve variables
    const computed = await getComputedStyleForNode(client, nodeId);

    // Try to find resolved value from computed styles
    // For gradients, check background-image
    if (cssValue.includes("gradient")) {
      const resolved = computed["background-image"];
      if (resolved && !resolved.includes("var(")) {
        return { original: cssValue, resolved };
      }
    }

    // For colors, check background-color
    if (cssValue.startsWith("var(")) {
      const resolved = computed["background-color"];
      if (resolved && !resolved.includes("var(")) {
        return { original: cssValue, resolved };
      }
    }
  } catch {
    // Fallback to original
  }

  return { original: cssValue, resolved: cssValue };
}

/**
 * Extract background properties directly from CSSOM for an element
 * This gets ORIGINAL CSS values (preserves 'circle', 'transparent', etc.)
 *
 * CDP CSS.getMatchedStylesForNode returns partially computed values,
 * so we need this alternative approach for accurate extraction.
 */
export interface CSSOMBackground {
  background: string | null;
  backgroundImage: string | null;
  backgroundColor: string | null;
  selector: string;
}

export async function extractBackgroundFromCSS(
  client: CDPClientInterface,
  selector: string
): Promise<CSSOMBackground | null> {
  try {
    const result = await client.send<{
      result: { value: CSSOMBackground | null };
    }>("Runtime.evaluate", {
      expression: `
          (function() {
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el) return null;

            // Get computed style for fallback
            const computed = getComputedStyle(el);

            // Find matching CSS rules from stylesheets
            let background = null;
            let backgroundImage = null;
            let backgroundColor = null;
            let matchedSelector = '';
            let highestSpecificity = -1;

            // Helper: calculate selector specificity (simplified)
            function getSpecificity(selectorText) {
              let spec = 0;
              if (selectorText.includes('#')) spec += 100;
              const classes = (selectorText.match(/\\./g) || []).length;
              spec += classes * 10;
              const elements = (selectorText.match(/[a-z]+/gi) || []).length;
              spec += elements;
              return spec;
            }

            // Iterate through all stylesheets
            for (const sheet of document.styleSheets) {
              try {
                for (const rule of sheet.cssRules || []) {
                  if (!(rule instanceof CSSStyleRule)) continue;

                  // Check if this rule matches our element
                  try {
                    if (!el.matches(rule.selectorText)) continue;
                  } catch { continue; }

                  const spec = getSpecificity(rule.selectorText);

                  // Check for background properties in this rule
                  const style = rule.style;

                  if (style.background && spec >= highestSpecificity) {
                    background = style.background;
                    matchedSelector = rule.selectorText;
                    highestSpecificity = spec;
                  }
                  if (style.backgroundImage && spec >= highestSpecificity) {
                    backgroundImage = style.backgroundImage;
                    matchedSelector = rule.selectorText;
                    highestSpecificity = spec;
                  }
                  if (style.backgroundColor && spec >= highestSpecificity) {
                    backgroundColor = style.backgroundColor;
                  }
                }
              } catch (e) {
                // Cross-origin stylesheet, skip
              }
            }

            // Check inline style (highest priority)
            if (el.style.background) {
              background = el.style.background;
              matchedSelector = 'inline';
            }
            if (el.style.backgroundImage) {
              backgroundImage = el.style.backgroundImage;
              matchedSelector = 'inline';
            }
            if (el.style.backgroundColor) {
              backgroundColor = el.style.backgroundColor;
            }

            return {
              background,
              backgroundImage,
              backgroundColor: backgroundColor || computed.backgroundColor,
              selector: matchedSelector
            };
          })()
        `,
      returnByValue: true,
    });

    return result.result.value;
  } catch (e) {
    console.warn("[extractBackgroundFromCSS] Error:", e);
    return null;
  }
}
