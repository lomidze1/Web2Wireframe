/**
 * PUA glyphs with a SITE-SPECIFIC icon font (unknown to ICON_FONT_PATTERNS)
 * must keep the author's icon family instead of falling back to a text font.
 *
 * telex.ge regression: CS-Cart icon elements (`<i class="ty-icon-search">`,
 * star ratings, carousel chevrons) use custom fonts "glyphs" / "uni2-icons"
 * whose names match no known icon-font pattern. The PUA rescue previously
 * required a KNOWN icon family in the CSS stack — finding none, the glyph
 * kept the measured text font and rendered as mojibake ("Ï").
 *
 * For PUA-only content the FIRST family in the CSS stack is the icon font by
 * construction (icon classes always set it first), so it must win.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { isPuaOnlyText } from "../utils/fontUtils";

const SEARCH_GLYPH = "";
const STAR_GLYPH = "";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 100,
    quad: [0, 0, 400, 0, 400, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1280, height: 800, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1280, height: 800,
    styles: { height: "100%" },
    children: [body],
    isScrollingElt: true,
  });
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.className === "string" && obj.className.split(" ").includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

function glyphHost(value: string, stack: string, runFont: string): Record<string, unknown> {
  const glyphText = {
    type: "TEXT", x: 100, y: 100, width: 24, height: 24,
    quad: [100, 100, 124, 100, 124, 124, 100, 124],
    value, font: runFont,
  };
  return makeFrame({
    tag: "i", classList: ["ty-icon-search"],
    x: 100, y: 100, width: 24, height: 24,
    styles: { display: "inline-block", fontFamily: stack, fontSize: "24px" },
    children: [glyphText],
  });
}

describe("isPuaOnlyText (fontUtils)", () => {
  it("accepts BMP private-use-area glyphs (with whitespace)", () => {
    expect(isPuaOnlyText(SEARCH_GLYPH)).toBe(true);
    expect(isPuaOnlyText(` ${SEARCH_GLYPH} ${STAR_GLYPH} `)).toBe(true);
  });

  it("rejects normal text, mixed content, and empty strings", () => {
    expect(isPuaOnlyText("კალათა")).toBe(false);
    expect(isPuaOnlyText(`${SEARCH_GLYPH} search`)).toBe(false);
    expect(isPuaOnlyText("")).toBe(false);
    expect(isPuaOnlyText("   ")).toBe(false);
  });
});

describe("PUA glyph with unknown site icon font", () => {
  it("keeps the first CSS family when no known icon font is in the stack", () => {
    const host = glyphHost(SEARCH_GLYPH, "glyphs", "BPG Nino Mtavruli");
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "ty-icon-search");
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe(SEARCH_GLYPH);
    expect(node!.fontFamily).toBe("glyphs");
  });

  it("keeps the first family from a multi-family stack (uni2-icons)", () => {
    const host = glyphHost(STAR_GLYPH, "uni2-icons, Arial, sans-serif", "Arial");
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "ty-icon-search");
    expect(node).not.toBeNull();
    expect(node!.fontFamily).toBe("uni2-icons");
  });

  it("still prefers a KNOWN icon family found deeper in the stack", () => {
    const host = glyphHost(SEARCH_GLYPH, "SF Pro Text, SF Pro Icons", "SF Pro Text");
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "ty-icon-search");
    expect(node).not.toBeNull();
    expect(node!.fontFamily).toBe("SF Pro Icons");
  });

  it("leaves non-PUA text on its measured font", () => {
    const host = glyphHost("ძებნა", "glyphs, Arial", "Arial");
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "ty-icon-search");
    expect(node).not.toBeNull();
    expect(node!.fontFamily).not.toBe("glyphs");
  });
});
