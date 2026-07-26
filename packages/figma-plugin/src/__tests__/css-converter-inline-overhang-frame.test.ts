/**
 * Inline overhang on frames WITH FRAME CHILDREN.
 *
 * apple.com locale switcher regression (the stray ✓ floating above the
 * dropdown): `span#ac-ls-dropdown-title` is `display: inline`, so its box is
 * just the 20px line box at y=37 — while BOTH its children (the absolute
 * `.ac-ls-dropdown-check` glyph and the 36px inline-block `.ac-ls-dropdown-copy`)
 * actually paint from y=17. The check kept its -20px absolute offset, but the
 * copy became an auto-layout flow child pinned to the frame's top (y=37) — so
 * the checkmark rendered 20px above the country name instead of beside it.
 *
 * Fix: an inline wrapper with no fill/stroke snaps to the union box of its
 * children, and the children's offsets shift with it — everything realigns.
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

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: 'body', width: 1440, height: 900, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1440, height: 900,
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

function text(value: string, x: number, y: number, w: number, h: number, font = 'SF Pro Text') {
  return {
    type: 'TEXT', x, y, width: w, height: h,
    quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    value, font,
  };
}

/**
 * Mirrors apple.com's locale dropdown title: an inline span at y=37 h=20
 * whose two children both paint at y=17 h=36.
 */
function localeTitle(): Record<string, unknown> {
  const check = makeFrame({
    tag: 'span', classList: ['ac-ls-dropdown-check'],
    x: 738, y: 17, width: 18, height: 36,
    styles: { display: 'block', position: 'absolute', fontFamily: '"SF Pro Icons", "SF Pro Text"', fontSize: '24px' },
    children: [text('', 738, 17, 18, 36)],
  });
  const copy = makeFrame({
    tag: 'span', classList: ['ac-ls-dropdown-copy'],
    x: 738, y: 17, width: 296, height: 36,
    styles: { display: 'inline-block', fontFamily: '"SF Pro Text"', fontSize: '17px' },
    children: [text('Georgia', 767, 17, 60, 36)],
  });
  return makeFrame({
    tag: 'span', classList: ['ac-ls-dropdown-title'],
    x: 738, y: 37, width: 296, height: 20,
    styles: { display: 'inline', fontFamily: '"SF Pro Text"', fontSize: '17px' },
    children: [check, copy],
  });
}

describe("inline overhang — frame children", () => {
  it("snaps the inline wrapper to its children's union box", () => {
    const root = convertW2WToWireframe(
      page([makeFrame({ classList: ['host'], x: 721, y: 14, width: 349, height: 42, children: [localeTitle()] })]) as never,
      { layoutMode: "autoLayout" },
    );
    const title = findByClass(root, 'ac-ls-dropdown-title');
    expect(title).not.toBeNull();
    // Was y=37 h=20 (the inline line box); becomes the children's box y=17 h=36.
    expect(title!.height).toBe(36);
    // y is relative to the host frame (y=14) → 17 - 14 = 3
    expect(title!.y).toBe(3);
  });

  it("realigns both children to the snapped frame (check and copy share a top)", () => {
    const root = convertW2WToWireframe(
      page([makeFrame({ classList: ['host'], x: 721, y: 14, width: 349, height: 42, children: [localeTitle()] })]) as never,
      { layoutMode: "autoLayout" },
    );
    const title = findByClass(root, 'ac-ls-dropdown-title')!;
    const kids = title.children as Array<Record<string, unknown>>;
    expect(kids).toHaveLength(2);
    // Both painted at y=17 on the page → both at 0 inside the snapped frame.
    expect(kids[0].y).toBe(0);
    expect(kids[1].y).toBe(0);
  });

  it("does NOT snap a block wrapper (normal boxes contain their children)", () => {
    const child = makeFrame({
      tag: 'span', classList: ['inner'],
      x: 0, y: -20, width: 100, height: 36,
      styles: { display: 'inline-block' },
      children: [text('hi', 0, -20, 40, 36)],
    });
    const block = makeFrame({
      tag: 'div', classList: ['blockwrap'],
      x: 0, y: 0, width: 300, height: 20,
      styles: { display: 'block' },
      children: [child],
    });
    const root = convertW2WToWireframe(page([block]) as never, { layoutMode: "autoLayout" });
    const wrap = findByClass(root, 'blockwrap');
    expect(wrap).not.toBeNull();
    expect(wrap!.height).toBe(20);
  });

  it("does NOT snap an inline wrapper that has its own background", () => {
    const inner = makeFrame({
      tag: 'span', classList: ['inner2'],
      x: 0, y: -20, width: 100, height: 36,
      styles: { display: 'inline-block' },
      children: [text('hi', 0, -20, 40, 36)],
    });
    const wrap = makeFrame({
      tag: 'span', classList: ['badge'],
      x: 0, y: 0, width: 300, height: 20,
      styles: { display: 'inline', backgroundColor: 'rgb(255, 0, 0)' },
      children: [inner],
    });
    const root = convertW2WToWireframe(page([wrap]) as never, { layoutMode: "autoLayout" });
    const badge = findByClass(root, 'badge');
    expect(badge).not.toBeNull();
    expect(badge!.height).toBe(20);
  });

  it("leaves inline wrappers whose children sit inside their box untouched", () => {
    // Two children keep the wrapper from being flattened, and both paint
    // INSIDE its box — nothing to snap.
    const mk = (cls: string, x: number) => makeFrame({
      tag: 'span', classList: [cls],
      x, y: 4, width: 100, height: 12,
      styles: { display: 'inline-block', backgroundColor: 'rgb(0, 0, 255)' },
      children: [text('hi', x, 4, 40, 12)],
    });
    const wrap = makeFrame({
      tag: 'span', classList: ['tidy'],
      x: 0, y: 0, width: 300, height: 20,
      styles: { display: 'inline' },
      children: [mk('inner3', 0), mk('inner4', 120)],
    });
    const root = convertW2WToWireframe(page([wrap]) as never, { layoutMode: "autoLayout" });
    const tidy = findByClass(root, 'tidy');
    expect(tidy).not.toBeNull();
    expect(tidy!.height).toBe(20);
  });
});
