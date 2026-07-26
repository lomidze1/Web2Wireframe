/**
 * Full CSS font-family fallback stack must survive conversion.
 *
 * apple.com regression: styles.fontFamily arrives as the full stack
 * ("SF Pro Display, SF Pro Icons, Helvetica Neue, Helvetica, Arial,
 * sans-serif") but the converter truncated it to the first family, so
 * text.ts Step 4 (CSS fallback chain) never had a list to walk — a missing
 * primary family fell straight to Inter instead of Helvetica Neue/Arial.
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
  const body = makeFrame({ tag: 'body', width: 1280, height: 800, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1280, height: 800,
    styles: { height: '100%' },
    children: [body],
    isScrollingElt: true,
  });
}

function findNode(
  node: unknown,
  pred: (n: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (pred(obj)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findNode(c, pred);
    if (hit) return hit;
  }
  return null;
}

function textChild(value: string, font = 'SF Pro Display'): Record<string, unknown> {
  return {
    type: 'TEXT', x: 0, y: 0, width: 200, height: 20,
    quad: [0, 0, 200, 0, 200, 20, 0, 20],
    value, font,
  };
}

const APPLE_STACK = 'SF Pro Display, "SF Pro Icons", Helvetica Neue, Helvetica, Arial, sans-serif';

describe("fontFamilyList from full CSS stack", () => {
  it("coalesced text node carries the full fallback chain", () => {
    const p = makeFrame({
      tag: 'p', classList: ['headline'],
      styles: { display: 'block', fontFamily: APPLE_STACK },
      children: [textChild('AirPods Pro 3')],
    });
    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    const node = findNode(root, n => n.textContent === 'AirPods Pro 3');
    expect(node).not.toBeNull();
    expect(node!.fontFamilyList).toEqual([
      'SF Pro Display', 'SF Pro Icons', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif',
    ]);
  });

  it("single-family stack yields no fontFamilyList (no noise)", () => {
    const p = makeFrame({
      tag: 'p',
      styles: { display: 'block', fontFamily: 'Georgia' },
      children: [textChild('hello', 'Georgia')],
    });
    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    const node = findNode(root, n => n.textContent === 'hello');
    expect(node).not.toBeNull();
    expect(node!.fontFamilyList).toBeUndefined();
  });

  it("uncoalesced #text child (mixed children) inherits the parent stack", () => {
    // TEXT + FRAME sibling forces the non-coalesced branch (convertTextNodeFromValue)
    const inlineFrame = makeFrame({
      tag: 'span', classList: ['badge'],
      x: 210, y: 0, width: 40, height: 20,
      styles: { display: 'inline-block', backgroundColor: 'rgb(255, 0, 0)' },
    });
    const p = makeFrame({
      tag: 'div',
      styles: { display: 'block', fontFamily: APPLE_STACK },
      children: [textChild('United Kingdom'), inlineFrame],
    });
    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    const node = findNode(root, n => n.textContent === 'United Kingdom' && n.tag === '#text');
    expect(node).not.toBeNull();
    expect(node!.fontFamilyList).toEqual([
      'SF Pro Display', 'SF Pro Icons', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif',
    ]);
  });

  it("drops var()/keyword junk from the list", () => {
    const p = makeFrame({
      tag: 'p',
      styles: { display: 'block', fontFamily: 'var(--font-sans), Roboto, inherit, sans-serif' },
      children: [textChild('junk test', 'Roboto')],
    });
    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    const node = findNode(root, n => n.textContent === 'junk test');
    expect(node).not.toBeNull();
    expect(node!.fontFamilyList).toEqual(['Roboto', 'sans-serif']);
  });
});
