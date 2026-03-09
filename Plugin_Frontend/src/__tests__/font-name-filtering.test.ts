/**
 * Font Name Filtering Tests
 *
 * Tests that collectAllFonts and isValidFontName correctly filter out
 * CSS variables, keywords, and generic families from the font list.
 */

import { describe, it, expect } from "vitest";
import { collectAllFonts, isValidFontName } from "../utils/fontUtils";
import type { WireframeNode } from "../types";

// ============================================================================
// isValidFontName
// ============================================================================

describe("isValidFontName", () => {
  it("returns true for valid font names", () => {
    expect(isValidFontName("Inter")).toBe(true);
    expect(isValidFontName("PP Fragment Glare Medium")).toBe(true);
    expect(isValidFontName("Averta Std Bold")).toBe(true);
    expect(isValidFontName("SourceSans3VF")).toBe(true);
    expect(isValidFontName("Roboto")).toBe(true);
  });

  it("returns false for CSS variable references", () => {
    expect(isValidFontName("var(--font-sans)")).toBe(false);
    expect(isValidFontName("var(--font-body)")).toBe(false);
    expect(isValidFontName("var(--heading-font, Arial)")).toBe(false);
  });

  it("returns false for CSS keywords", () => {
    expect(isValidFontName("inherit")).toBe(false);
    expect(isValidFontName("initial")).toBe(false);
    expect(isValidFontName("unset")).toBe(false);
    expect(isValidFontName("revert")).toBe(false);
  });

  it("returns false for CSS generic families", () => {
    expect(isValidFontName("serif")).toBe(false);
    expect(isValidFontName("sans-serif")).toBe(false);
    expect(isValidFontName("monospace")).toBe(false);
    expect(isValidFontName("system-ui")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isValidFontName("")).toBe(false);
  });

  it("is case-insensitive for keywords", () => {
    expect(isValidFontName("Inherit")).toBe(false);
    expect(isValidFontName("INITIAL")).toBe(false);
    expect(isValidFontName("Sans-Serif")).toBe(false);
  });
});

// ============================================================================
// collectAllFonts filtering
// ============================================================================

function makeNode(fontFamily: string, children?: WireframeNode[]): WireframeNode {
  return {
    id: "test-" + Math.random().toString(36).slice(2, 8),
    type: "TEXT",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    fontFamily,
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: "left",
    textContent: "test",
    children: children || [],
    fills: [],
    strokes: [],
    effects: [],
    opacity: 1,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    borderWidth: 0,
    boxShadow: null,
    layoutMode: "NONE",
    layoutSizing: { horizontal: "FIXED", vertical: "FIXED" },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: 0,
    flexAlignItems: "MIN",
    flexJustifyContent: "MIN",
    flexWrap: "NO_WRAP",
    overflow: "visible",
  } as unknown as WireframeNode;
}

describe("collectAllFonts with filtering", () => {
  it("collects valid font names", () => {
    const frames = [
      {
        tree: makeNode("Inter", [
          makeNode("Roboto"),
          makeNode("PP Fragment Glare Medium"),
        ]),
      },
    ];
    const fonts = collectAllFonts(frames);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("Roboto")).toBe(true);
    expect(fonts.has("PP Fragment Glare Medium")).toBe(true);
  });

  it("filters out CSS variables", () => {
    const frames = [
      {
        tree: makeNode("Inter", [
          makeNode("var(--font-sans)"),
          makeNode("var(--font-body)"),
        ]),
      },
    ];
    const fonts = collectAllFonts(frames);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("var(--font-sans)")).toBe(false);
    expect(fonts.has("var(--font-body)")).toBe(false);
  });

  it("filters out CSS keywords", () => {
    const frames = [
      {
        tree: makeNode("Inter", [
          makeNode("inherit"),
          makeNode("initial"),
        ]),
      },
    ];
    const fonts = collectAllFonts(frames);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("inherit")).toBe(false);
    expect(fonts.has("initial")).toBe(false);
  });

  it("filters out CSS generic families", () => {
    const frames = [
      {
        tree: makeNode("Inter", [
          makeNode("serif"),
          makeNode("sans-serif"),
          makeNode("monospace"),
        ]),
      },
    ];
    const fonts = collectAllFonts(frames);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("serif")).toBe(false);
    expect(fonts.has("sans-serif")).toBe(false);
    expect(fonts.has("monospace")).toBe(false);
  });

  it("filters fonts from styledSegments too", () => {
    const node = makeNode("Inter");
    (node as Record<string, unknown>).styledSegments = [
      { fontFamily: "var(--heading)", text: "Hello", fontWeight: 700, fontSize: 24, color: "#000" },
      { fontFamily: "Averta Std Bold", text: "World", fontWeight: 700, fontSize: 24, color: "#000" },
    ];
    const frames = [{ tree: node }];
    const fonts = collectAllFonts(frames);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("var(--heading)")).toBe(false);
    expect(fonts.has("Averta Std Bold")).toBe(true);
  });
});
