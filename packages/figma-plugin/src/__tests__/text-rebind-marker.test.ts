/**
 * Text-rendering side of the "Re-apply original fonts" feature.
 *
 * `createTextNode` should stamp `w2w_original_font` pluginData onto a text
 * node when:
 *   - we're in `fontMode = "website"`,
 *   - the user picked "Use original fonts" (signalled by `originalFontNames`
 *     containing this node's family),
 *   - the original family was actually substituted at render time (the
 *     loaded font ≠ the requested family),
 *   - and the font isn't an icon font.
 *
 * No marker should be written outside that exact intersection — every other
 * mode pays no pluginData cost.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

// ---------------------------------------------------------------------------
// Mock TextNode with pluginData support
// ---------------------------------------------------------------------------

let loadedFonts: Array<{ family: string; style: string }> = [];
let unavailableFonts: Set<string> = new Set();

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
  const _pluginData: Record<string, string> = {};

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
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
    setPluginData(key: string, value: string) {
      if (value === "") delete _pluginData[key];
      else _pluginData[key] = value;
    },
    getPluginData(key: string) {
      return _pluginData[key] ?? "";
    },
  };
}

beforeEach(() => {
  loadedFonts = [];
  unavailableFonts = new Set();
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (unavailableFonts.has(font.family)) {
        throw new Error(`Font "${font.family}" not available`);
      }
      loadedFonts.push({ family: font.family, style: font.style });
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    textContent: "Test text",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTextNode — w2w_original_font pluginData marker", () => {
  it("writes the marker when an unavailable original font is substituted", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      // Identity entry → user picked "Use original fonts" for PSA
      originalFontNames: { PSA: "PSA" },
      // Render-time mapping substitutes PSA → Inter
      fontMapping: { PSA: "Inter" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.getPluginData("w2w_original_font")).toBe("PSA");
  });

  it("does NOT write the marker when the original font loads successfully", async () => {
    // Roboto is available — no substitution occurred → no rebind needed
    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Roboto",
      originalFontNames: { Roboto: "Roboto" }, // even if listed, it loaded
    });

    const textNode = await createTextNode(node, "Roboto", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.getPluginData("w2w_original_font")).toBe("");
  });

  it("does NOT write the marker in plugin font mode", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "plugin",
      fontFamily: "Montserrat",
      // originalFontNames could be present from a previous render; plugin
      // mode must still ignore it — there's no "use original fonts" notion.
      originalFontNames: { PSA: "PSA" },
    });

    const textNode = await createTextNode(node, "Montserrat", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.getPluginData("w2w_original_font")).toBe("");
  });

  it("writes the CSS family as marker when originalFontNames is absent", async () => {
    unavailableFonts.add("PSA");

    // User picked "Use fallback fonts" / "Use plugin fonts" — or no modal ran
    // at all. The substitution still happened, so the CSS family itself is
    // stamped: installing the font later + "Re-apply fonts" recovers it.
    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: { PSA: "Inter" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.getPluginData("w2w_original_font")).toBe("PSA");
  });

  it("stores the value of originalFontNames[font] (real name remap, not the CSS key)", async () => {
    // FontFallbackModal's handleOriginalApply now sends `originalFontNames`
    // as a CSS-name → real-name map (e.g. {PSC: "PPCirka-Light"}). The
    // marker should hold the real name so a later
    // `loadFontAsync({family: marker})` matches what's installed.
    unavailableFonts.add("PSC");
    // The real name must also be uninstalled — otherwise Step 0 (mapped-away
    // original preference) applies it directly and no marker is needed.
    unavailableFonts.add("PPCirka-Light");

    const node = makeNode({ fontFamily: "PSC", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      originalFontNames: { PSC: "PPCirka-Light" },
      fontMapping: { PSC: "Inter" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    // Important: marker is the VALUE of the map ("PPCirka-Light"), not the
    // CSS key ("PSC"). Otherwise the rebind action calls
    // `loadFontAsync({family: "PSC"})` against an installed real font
    // named "PPCirka-Light" — and silently fails.
    expect(textNode!.getPluginData("w2w_original_font")).toBe("PPCirka-Light");
  });

  it("writes the marker for icon fonts too (download ZIP makes them installable)", async () => {
    // Icon fonts used to be excluded from markers ("no installable form") —
    // but the font ZIP ships icon TTFs (SF Pro Icons, FA), so a tofu glyph
    // is recoverable: install the icon font, click Re-apply.
    unavailableFonts.add("Font Awesome 6 Brands");

    const node = makeNode({
      fontFamily: "Font Awesome 6 Brands",
      textContent: "",
    });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      originalFontNames: { "Font Awesome 6 Brands": "Font Awesome 6 Brands" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.getPluginData("w2w_original_font")).toBe("Font Awesome 6 Brands");
  });

  it("does NOT write the marker for Linux server fallback families", async () => {
    // Server-side URL imports (Linux Chromium) used to send system fallback
    // families like "Liberation Sans" as the node's font. They are never in
    // the download ZIP — a marker would strand Re-apply forever.
    unavailableFonts.add("Liberation Sans");

    const node = makeNode({ fontFamily: "Liberation Sans", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: { "Liberation Sans": "Inter" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.getPluginData("w2w_original_font")).toBe("");
  });
});
