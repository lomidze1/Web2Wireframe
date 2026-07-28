/**
 * PUA icon glyphs must resolve to the icon family from the CSS stack.
 *
 * apple.com regression (locale switcher  globe /  chevron): the
 * extension's platform-font pass collapses each host element's fonts to the
 * single highest-glyphCount font, so an icon glyph's TEXT run arrives labeled
 * with the TEXT font ("SF Pro Text") even though the CSS stack names
 * "SF Pro Icons". The glyph then renders as tofu AND the icon font never
 * reaches the missing-font/ZIP flow. When the coalesced content is purely
 * PUA codepoints and the raw CSS stack contains an icon family, that icon
 * family must win.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { isIconFont } from "../utils/fontUtils";

const GLOBE = '';
const CHEVRON = '';

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 400, height: 100,
    quad: [0, 0, 400, 0, 400, 100, 0, 100],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: 'body', width: 1280, height: 800, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1280, height: 800,
    styles: { height: '100%' },
    children: [body],
    isScrollingElt: true,
  });
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.className === 'string' && obj.className.split(' ').includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

/** Host span with one TEXT run whose `font` was platform-overridden. */
function glyphHost(value: string, stack: string, runFont: string): Record<string, unknown> {
  const glyphText = {
    type: 'TEXT', x: 100, y: 100, width: 24, height: 24,
    quad: [100, 100, 124, 100, 124, 124, 100, 124],
    value, font: runFont,
  };
  return makeFrame({
    tag: 'span', classList: ['glyph-host'],
    x: 100, y: 100, width: 24, height: 24,
    styles: { display: 'inline-block', fontFamily: stack, fontSize: '24px' },
    children: [glyphText],
  });
}

describe("PUA glyph + icon family in CSS stack", () => {
  it("recognizes SF Pro Icons as an icon font", () => {
    expect(isIconFont('SF Pro Icons')).toBe(true);
    expect(isIconFont('SF Pro Text')).toBe(false);
    expect(isIconFont('SF Pro Display')).toBe(false);
  });

  it("picks the icon family from deeper in the stack for a PUA-only run", () => {
    const host = glyphHost(GLOBE, 'SF Pro Text, SF Pro Icons, Helvetica', 'SF Pro Text');
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'glyph-host');
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe(GLOBE);
    expect(node!.fontFamily).toBe('SF Pro Icons');
  });

  it("keeps the icon family when it IS the first family but the run was platform-overridden", () => {
    // Current run-coalesce guard would replace "SF Pro Icons" with the
    // platform-measured "SF Pro Text" — for PUA content it must not.
    const host = glyphHost(CHEVRON, '"SF Pro Icons", Helvetica', 'SF Pro Text');
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'glyph-host');
    expect(node).not.toBeNull();
    expect(node!.fontFamily).toBe('SF Pro Icons');
  });

  it("does not switch normal (non-PUA) text to the icon family", () => {
    const host = glyphHost('United Kingdom', 'SF Pro Text, SF Pro Icons, Helvetica', 'SF Pro Text');
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'glyph-host');
    expect(node).not.toBeNull();
    expect(node!.fontFamily).toBe('SF Pro Text');
  });

  it("PUA run without any KNOWN icon family falls back to the first CSS family", () => {
    const host = glyphHost(GLOBE, 'SomeFont, Arial', 'FakePlatform');
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'glyph-host');
    expect(node).not.toBeNull();
    // telex.ge fix: for PUA-only content the platform-measured run font is the
    // mojibake source (the extension labels minority icon runs with the
    // element's dominant TEXT font). The author's FIRST CSS family is the icon
    // font by construction — site-specific names ("glyphs", "uni2-icons",
    // "SomeFont") never match ICON_FONT_PATTERNS, so they must win here.
    expect(node!.fontFamily).toBe('SomeFont');
  });

  it("PUA glyph with surrounding whitespace still counts as icon-only", () => {
    const host = glyphHost(` ${GLOBE} `, 'SF Pro Text, SF Pro Icons', 'SF Pro Text');
    const root = convertW2WToWireframe(page([host]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'glyph-host');
    expect(node).not.toBeNull();
    expect(node!.fontFamily).toBe('SF Pro Icons');
  });
});
