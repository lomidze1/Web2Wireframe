/**
 * Invisible-child filtering must survive zero-size wrapper flattening.
 *
 * apple.com regression: div#globalheader is a 0×0 inline wrapper whose
 * children get promoted into the parent ("zero-size wrapper flattening").
 * The promoted grandchildren bypassed the visibility:hidden / opacity:0
 * check that runs for direct children, so div#globalnav-curtain — a fixed
 * 100%×100% overlay with rgba fill + backdrop blur that is INVISIBLE in the
 * default state (visibility:hidden, opacity:0) — rendered as a huge visible
 * frame covering the whole wireframe.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
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

/** apple.com globalheader shape: 0×0 wrapper > [curtain (hidden), nav (visible)] */
function globalheaderTree(): Record<string, unknown> {
  const curtain = makeFrame({
    classList: ['globalnav-curtain'],
    width: 1440, height: 900,
    styles: {
      display: 'block', position: 'fixed', visibility: 'hidden', opacity: 0,
      backgroundColor: 'rgba(232, 232, 237, 0.4)', backdropFilter: 'blur(20px)',
    },
  });
  const nav = makeFrame({
    tag: 'nav',
    classList: ['globalnav'],
    width: 1440, height: 44,
    styles: { display: 'block', position: 'fixed', backgroundColor: 'rgb(255, 255, 255)' },
  });
  const wrapper = makeFrame({
    classList: ['globalheader-wrapper'],
    width: 0, height: 0,
    styles: { display: 'inline' },
    children: [curtain, nav],
  });
  return page([wrapper]);
}

describe("invisible children promoted from 0×0 wrappers", () => {
  it("drops a hidden fixed curtain in default mode", () => {
    const root = convertW2WToWireframe(globalheaderTree() as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, 'globalnav-curtain')).toBeNull();
    // the visible nav sibling must survive the flattening
    expect(findByClass(root, 'globalnav')).not.toBeNull();
  });

  it("marks the curtain isHiddenInDefault in variants mode instead of rendering it", () => {
    const root = convertW2WToWireframe(globalheaderTree() as never, {
      layoutMode: "autoLayout",
      interactionMode: 'variants',
    } as never);
    const curtain = findByClass(root, 'globalnav-curtain');
    if (curtain) {
      expect(curtain.isHiddenInDefault).toBe(true);
    }
  });

  it("still drops hidden DIRECT children (no regression)", () => {
    const hidden = makeFrame({
      classList: ['hidden-direct'],
      styles: { display: 'block', visibility: 'hidden' },
    });
    const root = convertW2WToWireframe(page([hidden]) as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, 'hidden-direct')).toBeNull();
  });
});
