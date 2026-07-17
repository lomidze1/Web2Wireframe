/**
 * Absolutely-positioned inline text wrappers must NOT collapse into parent text.
 *
 * apple.com locale-select regression: span#ac-ls-dropdown-title contains
 *   - span.ac-ls-dropdown-check  (position:absolute, icon glyph via ::after)
 *   - span.ac-ls-dropdown-copy   ("United Kingdom")
 * The check span is a text-only inline wrapper, so classifyWrapper collapsed
 * it into the title's text — DROPPING its position:absolute. The glyph then
 * became a normal flow text (36px tall) and auto-layout stacked the copy
 * BELOW it (y≈41), pushing "United Kingdom" out of the 42px select box.
 *
 * Out-of-flow (absolute/fixed) wrappers must render as their own frame so
 * nodes.ts can apply layoutPositioning=ABSOLUTE and keep siblings in place.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

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

function makeText(value: string, geom: { x: number; y: number; w: number; h: number }, font = '400 17px SF Pro Text'): Record<string, unknown> {
  const { x, y, w, h } = geom;
  return {
    type: 'TEXT', x, y, width: w, height: h,
    quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    value, font,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: 'body', width: 1440, height: 800, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1440, height: 800,
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

/** title span (inline, 296×20 @ y37) > [check (absolute, glyph), copy (inline-block, text)] */
function titleTree(): Record<string, unknown> {
  const check = makeFrame({
    tag: 'span', classList: ['dd-check'],
    x: 658, y: 17, width: 18, height: 36,
    styles: { display: 'block', position: 'absolute', left: '14px', fontSize: '24px' },
    children: [makeText('', { x: 658, y: 17, w: 18, h: 36 }, 'FakeIcons')],
  });
  const copy = makeFrame({
    tag: 'span', classList: ['dd-copy'],
    x: 658, y: 17, width: 296, height: 36,
    styles: { display: 'inline-block', overflow: 'hidden', paddingLeft: '29px' },
    children: [makeText('United Kingdom', { x: 687, y: 25, w: 110, h: 20 })],
  });
  const title = makeFrame({
    tag: 'span', classList: ['dd-title'],
    x: 658, y: 37, width: 296, height: 20,
    styles: { display: 'inline' },
    children: [check, copy],
  });
  return makeFrame({
    tag: 'div', classList: ['dd-select'],
    x: 641, y: 14, width: 349, height: 42,
    styles: { display: 'block', position: 'relative', backgroundColor: 'rgb(250, 250, 252)' },
    children: [title],
  });
}

describe("absolute inline wrapper preservation", () => {
  it("keeps an absolute text-only span as its own positioned node", () => {
    const root = convertW2WToWireframe(page([titleTree()]) as never, { layoutMode: "autoLayout" });
    const check = findByClass(root, 'dd-check');
    expect(check).not.toBeNull();
    expect(check!.position).toBe('absolute');
  });

  it("does not let the collapsed glyph displace the sibling copy", () => {
    const root = convertW2WToWireframe(page([titleTree()]) as never, { layoutMode: "autoLayout" });
    const copy = findByClass(root, 'dd-copy');
    expect(copy).not.toBeNull();
    // copy keeps its captured offset relative to the title (17 − 37 = −20,
    // possibly ink-snapped) — the regression stacked it BELOW the 36px glyph.
    expect(copy!.y as number).toBeLessThanOrEqual(0);
  });

  it("still collapses normal static inline wrappers (no regression)", () => {
    const staticSpan = makeFrame({
      tag: 'span', classList: ['plain'],
      x: 0, y: 0, width: 60, height: 16,
      styles: { display: 'inline' },
      children: [makeText('bold', { x: 0, y: 0, w: 60, h: 16 })],
    });
    const p = makeFrame({
      tag: 'p', classList: ['host'],
      styles: { display: 'block' },
      children: [staticSpan],
    });
    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    // wrapper collapsed → host becomes the text node, no nested .plain frame
    expect(findByClass(root, 'plain')).toBeNull();
    expect((findByClass(root, 'host') as { textContent?: string })?.textContent).toBe('bold');
  });
});
