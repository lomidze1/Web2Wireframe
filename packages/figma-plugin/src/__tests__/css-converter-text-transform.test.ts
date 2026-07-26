/**
 * CSS text-transform application.
 *
 * The content script stores raw `textContent` (source case) while the browser
 * renders the transformed case. The converter must apply the captured
 * `text-transform` to the text value so nav links / buttons / eyebrow labels
 * render as the user saw them (e.g. "Buy now" + uppercase → "BUY NOW").
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 200, height: 20,
    quad: [0, 0, 200, 0, 200, 20, 0, 20],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function makeText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 100, height: 16,
    quad: [0, 0, 100, 0, 100, 16, 0, 16],
    value,
    font: '400 14px Arial',
    ...overrides,
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

function collectTextContents(node: unknown): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.textContent === 'string') {
      out.push(obj.textContent);
    }
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

function findFirstText(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'text') return obj;
  const children = obj.children as unknown[] | undefined;
  if (Array.isArray(children)) {
    for (const c of children) {
      const hit = findFirstText(c);
      if (hit) return hit;
    }
  }
  return null;
}

describe("convertW2WToWireframe — text-transform", () => {
  it("applies uppercase to coalesced text content", () => {
    const el = makeFrame({
      tag: 'a',
      styles: { display: 'block', textTransform: 'uppercase' },
      children: [makeText('Buy now')],
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    expect(collectTextContents(root)).toContain('BUY NOW');
  });

  it("applies lowercase", () => {
    const el = makeFrame({
      styles: { display: 'block', textTransform: 'lowercase' },
      children: [makeText('Buy NOW')],
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    expect(collectTextContents(root)).toContain('buy now');
  });

  it("applies capitalize word-by-word", () => {
    const el = makeFrame({
      styles: { display: 'block', textTransform: 'capitalize' },
      children: [makeText('buy now today')],
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    expect(collectTextContents(root)).toContain('Buy Now Today');
  });

  it("leaves text unchanged without text-transform", () => {
    const el = makeFrame({
      styles: { display: 'block' },
      children: [makeText('Buy now')],
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    expect(collectTextContents(root)).toContain('Buy now');
  });

  it("applies uppercase to styled segments too", () => {
    // Two TEXT runs with different colors → styledSegments path
    const el = makeFrame({
      tag: 'a',
      styles: { display: 'block', textTransform: 'uppercase' },
      children: [
        makeText('Get', { color: 'rgb(255, 0, 0)' }),
        makeText('Pro', { x: 40, color: 'rgb(0, 0, 255)' }),
      ],
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    const textNode = findFirstText(root);
    expect(textNode).not.toBeNull();
    const segments = textNode!.styledSegments as Array<{ text: string }> | undefined;
    if (segments) {
      expect(segments.map(s => s.text)).toEqual(['GET', 'PRO']);
    }
    expect(textNode!.textContent).toBe('GET PRO');
  });
});
