/**
 * CSS extraction using CDP
 * This is the KEY difference from Puppeteer - we get MATCHED rules, not just computed
 */

/**
 * Get MATCHED CSS rules for a node
 * This is the critical difference from getComputedStyle!
 * Returns the actual CSS rules that matched, preserving:
 * - Gradients
 * - CSS Variables (original var() syntax)
 * - Hover/focus/active states
 * - Media queries
 *
 * @param {import('./client').CDPClient} client
 * @param {number} nodeId
 * @returns {Promise<import('./types').CDPMatchedStyles | null>}
 */
async function getMatchedStylesForNode(client, nodeId) {
  try {
    const result = await client.send("CSS.getMatchedStylesForNode", { nodeId });
    return result;
  } catch {
    return null;
  }
}

/**
 * Get computed style for a node (fallback)
 * @param {import('./client').CDPClient} client
 * @param {number} nodeId
 * @returns {Promise<Record<string, string>>}
 */
async function getComputedStyleForNode(client, nodeId) {
  try {
    const result = await client.send("CSS.getComputedStyleForNode", { nodeId });

    /** @type {Record<string, string>} */
    const styles = {};
    for (const prop of result.computedStyle) {
      styles[prop.name] = prop.value;
    }
    return styles;
  } catch {
    return {};
  }
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
 *
 * @param {import('./types').CDPMatchedStyles} matchedStyles
 * @param {string} propertyName
 * @returns {string | null}
 */
function extractPropertyFromMatchedRules(matchedStyles, propertyName) {
  /**
   * Helper to get original value from prop
   * @param {{value: string, text?: string}} prop
   * @returns {string | null}
   */
  const getOriginalValue = (prop) => {
    // prop.text contains the ORIGINAL CSS as written
    if (prop.text) {
      const textValue = prop.text.includes(":")
        ? prop.text.split(":")[1]?.trim().replace(/;$/, "").trim()
        : prop.text.trim();
      if (textValue && textValue !== "initial") {
        return textValue;
      }
    }
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

  // Then check matched rules - keep the LAST match (most specific)
  /** @type {string | null} */
  let result = null;

  if (matchedStyles.matchedCSSRules) {
    for (const match of matchedStyles.matchedCSSRules) {
      // Skip user-agent rules
      if (match.rule.origin === "user-agent") continue;

      const prop = match.rule.style.cssProperties.find(
        (p) => p.name === propertyName
      );
      if (prop) {
        const value = getOriginalValue(prop);
        if (value) {
          result = value; // Keep updating - last one wins
        }
      }
    }
  }

  if (result) return result;

  // Check inherited styles
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
 * Extract border width from matched rules
 * @param {import('./types').CDPMatchedStyles} matchedStyles
 * @returns {string | null}
 */
function extractBorderWidthFromMatchedRules(matchedStyles) {
  // Try border-width directly
  const borderWidth = extractPropertyFromMatchedRules(matchedStyles, "border-width");
  if (borderWidth) return borderWidth;

  // Check border shorthand
  const borderShorthand = extractPropertyFromMatchedRules(matchedStyles, "border");
  if (borderShorthand) {
    const widthMatch = borderShorthand.match(/^(\d+(?:\.\d+)?)(px|em|rem|%|pt)?/i);
    if (widthMatch) {
      return widthMatch[1] + (widthMatch[2] || "px");
    }
    if (/^(thin|medium|thick)\b/i.test(borderShorthand)) {
      const keyword = borderShorthand.match(/^(thin|medium|thick)/i)?.[1];
      if (keyword) return keyword.toLowerCase();
    }
  }

  // Try individual sides
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

  return null;
}

/**
 * Extract individual border sides from matched rules
 * @param {import('./types').CDPMatchedStyles | null} matchedStyles
 * @param {Record<string, string>} computedStyles
 * @returns {{borderTop: string | null, borderRight: string | null, borderBottom: string | null, borderLeft: string | null}}
 */
function extractBorderSidesFromMatchedRules(matchedStyles, computedStyles) {
  const result = {
    borderTop: computedStyles["border-top"] || null,
    borderRight: computedStyles["border-right"] || null,
    borderBottom: computedStyles["border-bottom"] || null,
    borderLeft: computedStyles["border-left"] || null,
  };

  if (!matchedStyles) return result;

  const matchedTop = extractPropertyFromMatchedRules(matchedStyles, "border-top");
  const matchedRight = extractPropertyFromMatchedRules(matchedStyles, "border-right");
  const matchedBottom = extractPropertyFromMatchedRules(matchedStyles, "border-bottom");
  const matchedLeft = extractPropertyFromMatchedRules(matchedStyles, "border-left");

  if (matchedTop) result.borderTop = matchedTop;
  if (matchedRight) result.borderRight = matchedRight;
  if (matchedBottom) result.borderBottom = matchedBottom;
  if (matchedLeft) result.borderLeft = matchedLeft;

  return result;
}

/**
 * Extract all CSS custom properties (variables) from the page
 * @param {import('./client').CDPClient} client
 * @returns {Promise<import('./types').ExtractedCSSVariable[]>}
 */
async function extractCSSVariables(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: `
      (function() {
        const variables = [];
        const seen = new Set();

        const rootElements = [document.documentElement, document.body];

        for (const el of rootElements) {
          if (!el) continue;
          const computed = getComputedStyle(el);

          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules || []) {
                if (rule.style) {
                  for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    if (prop.startsWith('--') && !seen.has(prop)) {
                      seen.add(prop);
                      const rawValue = rule.style.getPropertyValue(prop).trim();
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
  });

  return result.result.value || [];
}

/**
 * Extract hover state styles for a node
 * @param {import('./types').CDPMatchedStyles} matchedStyles
 * @param {'hover' | 'focus' | 'active'} pseudoType
 * @returns {Record<string, string> | null}
 */
function extractPseudoStyles(matchedStyles, pseudoType) {
  if (!matchedStyles.pseudoElements) return null;

  const pseudo = matchedStyles.pseudoElements.find(
    (p) => p.pseudoType === pseudoType
  );
  if (!pseudo) return null;

  /** @type {Record<string, string>} */
  const styles = {};
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
 * Extract background from CSSOM (preserves original CSS values)
 * @param {import('./client').CDPClient} client
 * @param {string} selector
 * @returns {Promise<{background: string | null, backgroundImage: string | null, backgroundColor: string | null, selector: string} | null>}
 */
async function extractBackgroundFromCSS(client, selector) {
  try {
    const result = await client.send("Runtime.evaluate", {
      expression: `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return null;

          const computed = getComputedStyle(el);

          let background = null;
          let backgroundImage = null;
          let backgroundColor = null;
          let matchedSelector = '';
          let highestSpecificity = -1;

          function getSpecificity(selectorText) {
            let spec = 0;
            if (selectorText.includes('#')) spec += 100;
            const classes = (selectorText.match(/\\./g) || []).length;
            spec += classes * 10;
            const elements = (selectorText.match(/[a-z]+/gi) || []).length;
            spec += elements;
            return spec;
          }

          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules || []) {
                if (!(rule instanceof CSSStyleRule)) continue;

                try {
                  if (!el.matches(rule.selectorText)) continue;
                } catch { continue; }

                const spec = getSpecificity(rule.selectorText);
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
              // Cross-origin
            }
          }

          // Inline style (highest priority)
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

module.exports = {
  getMatchedStylesForNode,
  getComputedStyleForNode,
  extractPropertyFromMatchedRules,
  extractBorderWidthFromMatchedRules,
  extractBorderSidesFromMatchedRules,
  extractCSSVariables,
  extractPseudoStyles,
  extractBackgroundFromCSS,
};
