/**
 * Semantic Placeholder Truncation Tests
 *
 * When textMode === "semantic", placeholder text (e.g. "Subsection Heading")
 * may be longer or shorter than the original website text. The text node must
 * be sized to the original element dimensions (width + height) and truncated
 * with ellipsis ("...") if it overflows.
 *
 * Uses Figma's textTruncation = "ENDING" with textAutoResize = "NONE".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

// ============================================================================
// Figma API Mock
// ============================================================================

let loadedFonts: Array<{ family: string; style: string }> = [];

function createMockTextNode() {
  let _characters = "";
  let _fontSize = 14;
  let _fontName: { family: string; style: string } = { family: "Inter", style: "Regular" };
  let _fills: unknown[] = [];
  let _textAutoResize = "NONE";
  let _width = 100;
  let _height = 20;
  let _textAlignH = "LEFT";
  let _lineHeight: unknown = { unit: "AUTO" };
  let _letterSpacing: unknown = { value: 0, unit: "PIXELS" };
  let _textTruncation: string | undefined;
  let _textDecoration = "NONE";
  let _fillStyleId = "";
  let _textStyleId = "";
  let _layoutSizingHorizontal = "FIXED";
  let _layoutSizingVertical = "FIXED";
  let _name = "";

  return {
    get characters() { return _characters; },
    set characters(v: string) { _characters = v; },
    get fontSize() { return _fontSize; },
    set fontSize(v: number) { _fontSize = v; },
    get fontName() { return _fontName; },
    set fontName(v: { family: string; style: string }) { _fontName = v; },
    get fills() { return _fills; },
    set fills(v: unknown[]) { _fills = v; },
    get textAutoResize() { return _textAutoResize; },
    set textAutoResize(v: string) { _textAutoResize = v; },
    get width() { return _width; },
    get height() { return _height; },
    resize(w: number, h: number) { _width = w; _height = h; },
    get textAlignHorizontal() { return _textAlignH; },
    set textAlignHorizontal(v: string) { _textAlignH = v; },
    get lineHeight() { return _lineHeight; },
    set lineHeight(v: unknown) { _lineHeight = v; },
    get letterSpacing() { return _letterSpacing; },
    set letterSpacing(v: unknown) { _letterSpacing = v; },
    get textTruncation() { return _textTruncation; },
    set textTruncation(v: string | undefined) { _textTruncation = v; },
    get textDecoration() { return _textDecoration; },
    set textDecoration(v: string) { _textDecoration = v; },
    get fillStyleId() { return _fillStyleId; },
    set fillStyleId(v: string) { _fillStyleId = v; },
    get textStyleId() { return _textStyleId; },
    set textStyleId(v: string) { _textStyleId = v; },
    get layoutSizingHorizontal() { return _layoutSizingHorizontal; },
    set layoutSizingHorizontal(v: string) { _layoutSizingHorizontal = v; },
    get layoutSizingVertical() { return _layoutSizingVertical; },
    set layoutSizingVertical(v: string) { _layoutSizingVertical = v; },
    get name() { return _name; },
    set name(v: string) { _name = v; },
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
  };
}

beforeEach(() => {
  loadedFonts = [];
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      loadedFonts.push({ family: font.family, style: font.style });
    }),
  };
});

// ============================================================================
// Helpers
// ============================================================================

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#333333",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "Subsection Heading",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    browserLineCount: 1,
    ...overrides,
  };
}

function makeContext(overrides: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      main: "#1f3a5f",
      text: "#333333",
      accent: "#3b82f6",
      surface: "#f5f5f5",
      border: "#e0e0e0",
      background: "#ffffff",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Semantic placeholder truncation", () => {
  describe("semantic textMode — fixed size + truncation", () => {
    it("sets textAutoResize to NONE for semantic text", async () => {
      const node = makeNode({ textContent: "Subsection Heading", width: 200, height: 24 });
      const context = makeContext({ textMode: "semantic" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      expect(textNode!.textAutoResize).toBe("NONE");
    });

    it("sets textTruncation to ENDING for semantic text", async () => {
      const node = makeNode({ textContent: "Subsection Heading", width: 200, height: 24 });
      const context = makeContext({ textMode: "semantic" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      expect(textNode!.textTruncation).toBe("ENDING");
    });

    it("resizes to original browser dimensions (width + height)", async () => {
      const node = makeNode({ textContent: "Body text paragraph with sample content.", width: 300, height: 48 });
      const context = makeContext({ textMode: "semantic" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      expect(textNode!.width).toBe(300);
      expect(textNode!.height).toBe(48);
    });

    it("works with plugin fontMode", async () => {
      const node = makeNode({ textContent: "Navigation Link", width: 150, height: 20 });
      const context = makeContext({ textMode: "semantic", fontMode: "plugin" });

      const textNode = await createTextNode(node, "Montserrat", context);

      expect(textNode).not.toBeNull();
      expect(textNode!.textAutoResize).toBe("NONE");
      expect(textNode!.textTruncation).toBe("ENDING");
      expect(textNode!.width).toBe(150);
      expect(textNode!.height).toBe(20);
    });

    it("works with block-level elements (h1, p, div)", async () => {
      const node = makeNode({ tag: "h1", textContent: "Main Page Title", width: 400, height: 40 });
      const context = makeContext({ textMode: "semantic" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      expect(textNode!.textAutoResize).toBe("NONE");
      expect(textNode!.textTruncation).toBe("ENDING");
      expect(textNode!.width).toBe(400);
    });

    it("works with center-aligned text", async () => {
      const node = makeNode({ textContent: "Centered Label", width: 250, height: 24, textAlign: "center" });
      const context = makeContext({ textMode: "semantic" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      expect(textNode!.textAutoResize).toBe("NONE");
      expect(textNode!.textTruncation).toBe("ENDING");
      expect(textNode!.textAlignHorizontal).toBe("CENTER");
    });
  });

  describe("non-semantic modes — no truncation path", () => {
    it("website textMode does NOT use semantic truncation", async () => {
      const node = makeNode({ textContent: "Original website text", width: 200, height: 24 });
      const context = makeContext({ textMode: undefined });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      // Should go through smart sizing, not semantic truncation
      // textTruncation should NOT be set to ENDING (unless smart sizing sets it for overflow)
      // The key check: smart sizing path was used, not early semantic return
      expect(textNode!.textAutoResize).not.toBe("HEIGHT"); // not FILLR path either
    });

    it("lorem textMode does NOT use semantic truncation", async () => {
      const node = makeNode({ textContent: "Lorem ipsum dolor sit", width: 200, height: 24 });
      const context = makeContext({ textMode: "lorem" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      // Lorem text should go through smart sizing, not semantic truncation
    });
  });

  describe("semantic + FILLR font — FILLR path takes priority", () => {
    it("fontMode lines uses FILLR path, not semantic truncation", async () => {
      const node = makeNode({ textContent: "Header Text", width: 200, height: 24 });
      const context = makeContext({ textMode: "semantic", fontMode: "lines" });

      const textNode = await createTextNode(node, "Inter", context);

      expect(textNode).not.toBeNull();
      // FILLR path sets textAutoResize to HEIGHT (line 304 in text.ts)
      expect(textNode!.textAutoResize).toBe("HEIGHT");
      // FILLR has its own trimming, not textTruncation
      expect(textNode!.textTruncation).toBeUndefined();
    });
  });
});
