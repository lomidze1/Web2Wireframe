/**
 * Regression test for css-converter.ts — list marker wrappers.
 *
 * Verifies that the existing `__w2w-pseudo-before`/`__w2w-pseudo-after`
 * flatten branch at css-converter.ts:300-341 also handles the new
 * `__w2w-pseudo-marker` class with no code change required. A marker
 * wrapper carrying a single TEXT child ("1.", "2.", …) must flow into
 * the parent <li>'s text children in first position.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
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
    x: 0, y: 0, width: 50, height: 14,
    quad: [0, 0, 50, 0, 50, 14, 0, 14],
    value,
    font: '400 12px SFProText',
    ...overrides,
  };
}

function collectTextValues(node: unknown): string[] {
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

function findTextNode(node: unknown, valueSubstring: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (
    obj.type === 'text' &&
    typeof obj.textContent === 'string' &&
    obj.textContent.includes(valueSubstring)
  ) {
    return obj;
  }
  const children = obj.children as unknown[] | undefined;
  if (Array.isArray(children)) {
    for (const c of children) {
      const hit = findTextNode(c, valueSubstring);
      if (hit) return hit;
    }
  }
  return null;
}

describe("css-converter: __w2w-pseudo-marker flatten (regression)", () => {
  it("marker text from __w2w-pseudo-marker wrapper appears in <li> output", () => {
    const markerWrapper = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 230, y: 4932, width: 14, height: 16,
      quad: [230, 4932, 244, 4932, 244, 4948, 230, 4948],
      styles: { display: 'inline', position: 'static', color: 'rgb(128,128,128)' },
      children: [makeText('2.', { x: 230, y: 4932, width: 14, height: 16 })],
    });

    const paragraphText = makeText(
      'Trade-in values will vary based on the condition, year, and configuration...',
      { x: 247, y: 4932, width: 900, height: 16 }
    );

    const li = makeFrame({
      tag: 'li',
      attr: { id: 'footnote-2' },
      x: 247, y: 4932, width: 946, height: 121,
      quad: [247, 4932, 1193, 4932, 1193, 5053, 247, 5053],
      styles: {
        display: 'list-item',
        fontSize: '12px',
        listStyleType: 'decimal',
      },
      children: [markerWrapper, paragraphText],
    });

    const ol = makeFrame({
      tag: 'ol',
      classList: ['ac-gf-sosumi'],
      x: 247, y: 4932, width: 946, height: 500,
      quad: [247, 4932, 1193, 4932, 1193, 5432, 247, 5432],
      styles: { display: 'block', fontSize: '12px' },
      children: [li],
    });

    const result = convertW2WToWireframe(ol as never, { layoutMode: 'autoLayout' });
    const allText = collectTextValues(result);

    // Marker text must be present somewhere in the rendered tree
    expect(allText.some((t) => t.includes('2.'))).toBe(true);
    // Paragraph text still present
    expect(allText.some((t) => t.includes('Trade-in values'))).toBe(true);
  });

  it("marker wrapper's fontSize/fontFamily overrides the <li>'s typography (Apple footer regression)", () => {
    // Apple.com footer: <li> renders at default 16px, but CSS has
    // ::marker { font-size: 12px; font-family: "SF Pro Text"; color: rgba(0,0,0,0.56) }.
    // Content script must stash these on the marker wrapper's `styles`
    // (camelCase keys!) so css-converter's convertTextNodeFromValue picks
    // them up instead of falling back to 16px Inter.
    const markerWrapper = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 230, y: 4932, width: 14, height: 16,
      quad: [230, 4932, 244, 4932, 244, 4948, 230, 4948],
      styles: {
        display: 'inline',
        position: 'static',
        color: 'rgba(0, 0, 0, 0.56)',
        fontSize: '12px',
        fontFamily: '"SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        fontWeight: '400',
        lineHeight: '16px',
        letterSpacing: '-0.12px',
      },
      children: [
        makeText('3.', {
          x: 230, y: 4932, width: 14, height: 16,
          font: '400 12px SF Pro Text',
        }),
      ],
    });

    const paragraphText = makeText(
      'Trade-in values will vary based on the condition...',
      { x: 247, y: 4932, width: 900, height: 16 }
    );

    const li = makeFrame({
      tag: 'li',
      attr: { id: 'footnote-3' },
      x: 247, y: 4932, width: 946, height: 121,
      quad: [247, 4932, 1193, 4932, 1193, 5053, 247, 5053],
      styles: {
        display: 'list-item',
        fontSize: '16px', // <li>'s own fontSize — must NOT leak into marker
        fontFamily: 'Inter',
        listStyleType: 'decimal',
      },
      children: [markerWrapper, paragraphText],
    });

    const ol = makeFrame({
      tag: 'ol',
      x: 247, y: 4932, width: 946, height: 500,
      quad: [247, 4932, 1193, 4932, 1193, 5432, 247, 5432],
      styles: { display: 'block', fontSize: '16px' },
      children: [li],
    });

    const result = convertW2WToWireframe(ol as never, { layoutMode: 'autoLayout' });
    const markerTextNode = findTextNode(result, '3.');
    expect(markerTextNode).not.toBeNull();
    expect(markerTextNode!.fontSize).toBe(12);
    // fontFamily is parsed from the family list — first token wins.
    expect(String(markerTextNode!.fontFamily)).toContain('SF Pro Text');
  });

  it("marker wrapper with bullet character flattens into li", () => {
    const markerWrapper = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 0, y: 0, width: 8, height: 14,
      quad: [0, 0, 8, 0, 8, 14, 0, 14],
      styles: { display: 'inline', position: 'static' },
      children: [makeText('•', { x: 0, y: 0, width: 8, height: 14 })],
    });

    const liText = makeText('Item one', { x: 12, y: 0, width: 60, height: 14 });

    const li = makeFrame({
      tag: 'li',
      x: 0, y: 0, width: 100, height: 14,
      quad: [0, 0, 100, 0, 100, 14, 0, 14],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [markerWrapper, liText],
    });

    const ul = makeFrame({
      tag: 'ul',
      x: 0, y: 0, width: 100, height: 50,
      quad: [0, 0, 100, 0, 100, 50, 0, 50],
      styles: { display: 'block' },
      children: [li],
    });

    const result = convertW2WToWireframe(ul as never, { layoutMode: 'autoLayout' });
    const allText = collectTextValues(result);
    expect(allText.some((t) => t.includes('•'))).toBe(true);
    expect(allText.some((t) => t.includes('Item one'))).toBe(true);
  });
});
