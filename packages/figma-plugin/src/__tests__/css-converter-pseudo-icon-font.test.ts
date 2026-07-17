/**
 * Icon-font pseudo glyphs must keep their icon font through text coalescing.
 *
 * apple.com regression: `.ac-ls-dropdown-check::after` renders "✓" via a PUA
 * glyph in "SF Pro Icons". The pseudo flattens into its host element as a
 * text run carrying `font: "SF Pro Icons"`, but the coalesced node took its
 * fontFamily from the HOST's styles (the page text font) — so the glyph
 * rendered as tofu AND "SF Pro Icons" never reached collectAllFonts, which is
 * why the font ZIP only contained SF Pro Text.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { collectAllFonts } from "../utils/fontUtils";

const GLYPH = '';

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

function iconCheckTree(): Record<string, unknown> {
  const glyphText = {
    type: 'TEXT', x: 100, y: 100, width: 17.34, height: 27.5,
    quad: [100, 100, 117.34, 100, 117.34, 127.5, 100, 127.5],
    value: GLYPH, font: 'FakeIcons',
  };
  const pseudo = makeFrame({
    tag: 'span', classList: ['__w2w-pseudo-after'],
    x: 100, y: 100, width: 17.34, height: 27.5,
    styles: { display: 'inline', fontFamily: 'FakeIcons, FakeLegacyIcons', fontSize: '24px', content: '""' },
    children: [glyphText],
  });
  return makeFrame({
    tag: 'span', classList: ['icon-check'],
    x: 100, y: 100, width: 20, height: 24,
    styles: { display: 'inline-block' },
    children: [pseudo],
  });
}

describe("pseudo icon-font preservation", () => {
  it("keeps the icon font family on the coalesced glyph node", () => {
    const root = convertW2WToWireframe(page([iconCheckTree()]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'icon-check');
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe(GLYPH);
    expect(node!.fontFamily).toBe('FakeIcons');
  });

  it("surfaces the icon font in collectAllFonts (missing-font/ZIP flow)", () => {
    const root = convertW2WToWireframe(page([iconCheckTree()]) as never, { layoutMode: "autoLayout" });
    const fonts = collectAllFonts([{ tree: root }] as never);
    expect(Array.from(fonts as Set<string>)).toContain('FakeIcons');
  });

  it("normal text still uses the element's own font-family", () => {
    const textChild = {
      type: 'TEXT', x: 0, y: 0, width: 100, height: 16,
      quad: [0, 0, 100, 0, 100, 16, 0, 16],
      value: 'hello', font: 'Georgia',
    };
    const p = makeFrame({
      tag: 'p', classList: ['para'],
      styles: { display: 'block', fontFamily: 'Georgia, serif' },
      children: [textChild],
    });
    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, 'para')!.fontFamily).toBe('Georgia');
  });
});
