/**
 * Inline baseline overhang: a text-coalesced wrapper whose measured text ink
 * extends ABOVE the element's own box.
 *
 * apple.com locale-switcher regression: the select's anonymous inline <span>
 * has a 20px line box at y=37, but its "Georgia" text ink is 36px tall
 * starting at y=17 (baseline alignment pulls it above the box). Coalescing
 * dropped the text's captured offset, so Figma drew the text from the box
 * top — 20px lower than the browser — and it visually fell out of the white
 * select field.
 *
 * Fix: for fill-less/stroke-less pure text wrappers, snap the coalesced text
 * frame's y/height to the measured ink box. Elements with background/border
 * (buttons) keep their element box untouched.
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

function makeText(value: string, geom: { x: number; y: number; w: number; h: number }): Record<string, unknown> {
  const { x, y, w, h } = geom;
  return {
    type: 'TEXT', x, y, width: w, height: h,
    quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    value, font: '400 17px SF Pro Text',
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

describe("coalesced text ink-offset correction", () => {
  it("snaps a pure text wrapper to the ink box when text sticks out above", () => {
    // element box y=37 h=20; text ink y=17 h=36 (starts 20px above the box)
    const span = makeFrame({
      tag: 'span',
      classList: ['overhang'],
      x: 658, y: 37, width: 296, height: 20,
      styles: { display: 'inline-block' },
      children: [makeText('Georgia', { x: 658, y: 17, w: 60, h: 36 })],
    });
    const wrap = makeFrame({ tag: 'div', x: 641, y: 14, width: 349, height: 42, children: [span] });
    const root = convertW2WToWireframe(page([wrap]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'overhang');
    expect(node).not.toBeNull();
    // y relative to the 14px parent: ink 17 - 14 = 3 (was 37 - 14 = 23)
    expect(node!.y).toBe(3);
    expect(node!.height).toBe(36);
  });

  it("keeps the element box for backgrounds (buttons)", () => {
    // a button with background: element box is the visual — must NOT snap to ink
    const btn = makeFrame({
      tag: 'a',
      classList: ['btn'],
      x: 0, y: 30, width: 131, height: 44,
      styles: { display: 'block', backgroundColor: 'rgb(0, 113, 227)' },
      children: [makeText('Learn more', { x: 22, y: 20, w: 87, h: 21 })],
    });
    const root = convertW2WToWireframe(page([btn]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'btn');
    expect(node!.y).toBe(30);
    expect(node!.height).toBe(44);
  });

  it("leaves normal in-box text untouched", () => {
    const spanNode = makeFrame({
      tag: 'span',
      classList: ['normal'],
      x: 0, y: 50, width: 100, height: 20,
      styles: { display: 'inline-block' },
      children: [makeText('hello', { x: 0, y: 52, w: 40, h: 16 })],
    });
    const root = convertW2WToWireframe(page([spanNode]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, 'normal');
    expect(node!.y).toBe(50);
    expect(node!.height).toBe(20);
  });
});
