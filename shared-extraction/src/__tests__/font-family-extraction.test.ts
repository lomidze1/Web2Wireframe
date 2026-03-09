/**
 * Font Family Extraction Tests
 *
 * Tests for extracting original font-family names from CDP matched rules
 * instead of using abbreviated computed style names.
 *
 * Phase 1: Ensures extractPropertyFromMatchedRules returns full original
 * font names (e.g., "PP Fragment Glare Medium") rather than PostScript
 * abbreviations (e.g., "PSA") that computedStyles["font-family"] returns.
 */

import { describe, it, expect } from "vitest";
import { extractPropertyFromMatchedRules } from "../css";
import type { CDPMatchedStyles } from "../types";

// Helper to create a minimal CDPMatchedStyles with a matched CSS rule
function makeMatchedStyles(overrides: Partial<CDPMatchedStyles> = {}): CDPMatchedStyles {
  return {
    inlineStyle: overrides.inlineStyle ?? { cssProperties: [], shorthandEntries: [] },
    matchedCSSRules: overrides.matchedCSSRules ?? [],
    inherited: overrides.inherited ?? [],
    ...overrides,
  };
}

function makeRule(
  propertyName: string,
  value: string,
  origin: "injected" | "user-agent" | "inspector" | "regular" = "regular",
  text?: string
) {
  return {
    matchingSelectors: [0],
    rule: {
      selectorList: { selectors: [{ text: ".test" }], text: ".test" },
      origin,
      style: {
        cssProperties: [
          {
            name: propertyName,
            value,
            text: text ?? `${propertyName}: ${value}`,
          },
        ],
        shorthandEntries: [],
      },
    },
  };
}

describe("font-family extraction from matched rules", () => {
  it("should extract original full font name from matched CSS rules", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        makeRule("font-family", '"PP Fragment Glare Medium", sans-serif'),
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBe('"PP Fragment Glare Medium", sans-serif');
  });

  it("should return null when no font-family in matched rules and no inheritance", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        makeRule("color", "red"),
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBeNull();
  });

  it("should prefer inline style font-family over matched rules", () => {
    const matched = makeMatchedStyles({
      inlineStyle: {
        cssProperties: [
          {
            name: "font-family",
            value: '"Averta Std Bold"',
            text: 'font-family: "Averta Std Bold"',
          },
        ],
        shorthandEntries: [],
      },
      matchedCSSRules: [
        makeRule("font-family", '"PP Fragment Glare Medium", sans-serif'),
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBe('"Averta Std Bold"');
  });

  it("should handle multiple font-family entries in different rules (last wins)", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        makeRule("font-family", "Arial, sans-serif"),
        makeRule("font-family", '"Averta Std Semibold", Helvetica, sans-serif'),
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    // Last matched rule wins (higher specificity in CDP order)
    expect(result).toBe('"Averta Std Semibold", Helvetica, sans-serif');
  });

  it("should skip user-agent rules and use author rules", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        makeRule("font-family", "Times New Roman", "user-agent"),
        makeRule("font-family", '"PP Fragment Glare Medium"', "regular"),
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBe('"PP Fragment Glare Medium"');
  });

  it("should inherit font-family from parent when not set on element", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [],
      inherited: [
        {
          inlineStyle: { cssProperties: [], shorthandEntries: [] },
          matchedCSSRules: [
            makeRule("font-family", '"Averta Std Bold", sans-serif'),
          ],
        },
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBe('"Averta Std Bold", sans-serif');
  });

  it("should prefer element's own font-family over inherited", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        makeRule("font-family", '"SourceSans3VF"'),
      ],
      inherited: [
        {
          inlineStyle: { cssProperties: [], shorthandEntries: [] },
          matchedCSSRules: [
            makeRule("font-family", '"Averta Std Bold", sans-serif'),
          ],
        },
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBe('"SourceSans3VF"');
  });

  it("should prefer closest ancestor's font-family in inheritance chain", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [],
      inherited: [
        {
          // Closest parent: Averta
          inlineStyle: { cssProperties: [], shorthandEntries: [] },
          matchedCSSRules: [
            makeRule("font-family", '"Averta Std Bold"'),
          ],
        },
        {
          // Grandparent: PP Fragment
          inlineStyle: { cssProperties: [], shorthandEntries: [] },
          matchedCSSRules: [
            makeRule("font-family", '"PP Fragment Glare Medium"'),
          ],
        },
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    // Closest ancestor wins
    expect(result).toBe('"Averta Std Bold"');
  });

  it("should handle font-family with single quotes in CSS", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        makeRule(
          "font-family",
          "'PP Fragment Glare Medium', 'Helvetica Neue', Arial",
          "regular",
          "font-family: 'PP Fragment Glare Medium', 'Helvetica Neue', Arial"
        ),
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    expect(result).toBe("'PP Fragment Glare Medium', 'Helvetica Neue', Arial");
  });

  it("should use prop.text (original CSS) over prop.value when available", () => {
    const matched = makeMatchedStyles({
      matchedCSSRules: [
        {
          matchingSelectors: [0],
          rule: {
            selectorList: { selectors: [{ text: "body" }], text: "body" },
            origin: "regular",
            style: {
              cssProperties: [
                {
                  name: "font-family",
                  value: "PSA", // computed/abbreviated
                  text: 'font-family: "PP Fragment Glare Medium", sans-serif',
                },
              ],
              shorthandEntries: [],
            },
          },
        },
      ],
    });

    const result = extractPropertyFromMatchedRules(matched, "font-family");
    // Should use original text, not abbreviated value
    expect(result).toBe('"PP Fragment Glare Medium", sans-serif');
  });
});
