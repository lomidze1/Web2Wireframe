/**
 * Zero-width text runs must not take a slot in auto-layout.
 *
 * stripe.com's callout links wrap their chevron in two nested spans, and BOTH
 * carry `.hds-nowrap-svg::before { content: "\2060" }` — a word joiner, which
 * the browser measures as **0 × 20px** (verified on the live page):
 *
 *   <a class="hds-link">Explore no-code
 *     <span class="hds-nowrap-svg">          ← ::before "⁠", 0×20
 *       <span class="hds-nowrap-svg">        ← ::before "⁠", 0×20
 *         <svg class="hds-icon-hover-arrow"> ← 5×8 at +6 / +8.5
 *
 * The run paints nothing, but it is a real child, so the `NONE → VERTICAL`
 * fallback stacked it above the icon and pushed the chevron down 20px per
 * level — 40px in total, landing it a whole row below the link text.
 *
 * h2d drops these at capture: `zy()` filters every line rect whose polygon area
 * is ≤ 0.1 (`Al(q) > 0.1`), so a zero-width run never becomes a node. With the
 * run gone the span has a single child, and h2d's single-child branch (`Jq`
 * with `x.length === 1`) derives the frame's padding from the child's MEASURED
 * offset — which is what keeps the chevron at +6 / +8.5 rather than at 0,0.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quadOf(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = { x: 0, y: 0, width: 100, height: 20, ...overrides } as {
    x: number; y: number; width: number; height: number;
  };
  return {
    type: 'FRAME',
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
    quad: quadOf(base.x, base.y, base.width, base.height),
  };
}

function makeText(value: string, x: number, y: number, width: number, height: number): Record<string, unknown> {
  return {
    type: 'TEXT',
    value,
    font: '400 16px Sohne',
    x, y, width, height,
    quad: quadOf(x, y, width, height),
  };
}

type AnyNode = Record<string, unknown>;

/** Absolute page position of every node, walking parent-relative offsets. */
function absoluteNodes(root: unknown): Array<{ node: AnyNode; x: number; y: number }> {
  const out: Array<{ node: AnyNode; x: number; y: number }> = [];
  const visit = (n: unknown, ox: number, oy: number): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as AnyNode;
    const x = ox + ((obj.x as number) ?? 0);
    const y = oy + ((obj.y as number) ?? 0);
    out.push({ node: obj, x, y });
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(c => visit(c, x, y));
  };
  visit(root, 0, 0);
  return out;
}

const WJ = '⁠';

/**
 * The stripe.com link, translated so the <a> box starts at 0,0.
 * Geometry copied from the live page at 1440px.
 */
function stripeCalloutLink(): Record<string, unknown> {
  const svg = {
    type: 'SVG',
    tag: 'svg',
    x: 123.8, y: 8.5, width: 5, height: 8,
    quad: quadOf(123.8, 8.5, 5, 8),
    svg: '<svg width="5" height="8"></svg>',
    classList: ['hds-icon'],
    attr: {},
    styles: { display: 'inline' },
  };

  const innerSpan = makeFrame({
    tag: 'span',
    classList: ['hds-nowrap-svg'],
    x: 117.8, y: 0, width: 11, height: 20,
    styles: { display: 'inline', whiteSpace: 'nowrap' },
    children: [makeText(WJ, 117.8, 0, 0, 20), svg],
  });

  const outerSpan = makeFrame({
    tag: 'span',
    classList: ['hds-nowrap-svg'],
    x: 117.8, y: 0, width: 11, height: 20,
    styles: { display: 'inline', whiteSpace: 'nowrap' },
    children: [makeText(WJ, 117.8, 0, 0, 20), innerSpan],
  });

  return makeFrame({
    tag: 'a',
    classList: ['hds-link'],
    attr: { href: 'https://docs.stripe.com/no-code' },
    x: 0, y: 0, width: 128.8, height: 20,
    styles: { display: 'inline' },
    children: [makeText('Explore no-code', 0, 0, 117.8, 20), outerSpan],
  });
}

// ---------------------------------------------------------------------------

describe('zero-width word-joiner runs', () => {
  it('drops runs that paint nothing', () => {
    const result = convertW2WToWireframe(stripeCalloutLink() as never, { layoutMode: 'autoLayout' });

    const zeroWidthText = absoluteNodes(result).filter(
      ({ node }) => node.type === 'text' && (node.width as number) < 0.5,
    );
    expect(zeroWidthText).toHaveLength(0);
  });

  it('does not let the word joiner leak into the joined text', () => {
    const result = convertW2WToWireframe(stripeCalloutLink() as never, { layoutMode: 'autoLayout' });

    for (const { node } of absoluteNodes(result)) {
      const text = node.textContent;
      if (typeof text === 'string') expect(text).not.toContain(WJ);
    }
  });

  it('keeps the chevron beside the link text, not a row below it', () => {
    const result = convertW2WToWireframe(stripeCalloutLink() as never, { layoutMode: 'autoLayout' });

    const icon = absoluteNodes(result).find(({ node }) => node.tag === 'svg');
    expect(icon, 'the chevron must survive conversion').toBeTruthy();

    // Measured offsets inside the <a>. The bug produced y ≈ 40 (2 × the
    // word joiner's 20px line box) instead of the 8.5px baseline drop.
    expect(icon!.x).toBeCloseTo(123.8, 1);
    expect(icon!.y).toBeCloseTo(8.5, 1);
  });

  it("carries the icon's offset as padding so auto-layout cannot drop it", () => {
    // The renderer promotes this NONE block to VERTICAL auto-layout, which pins
    // the single child to the content origin. Only the measured padding keeps
    // the chevron off the corner — see the single-child branch in css-converter.
    const result = convertW2WToWireframe(stripeCalloutLink() as never, { layoutMode: 'autoLayout' });

    const iconParent = absoluteNodes(result).find(
      ({ node }) => (node.children as AnyNode[] | undefined)?.some(c => c.tag === 'svg'),
    );
    expect(iconParent, 'the chevron must keep a wrapper frame').toBeTruthy();

    const padding = iconParent!.node.padding as { top: number; left: number };
    expect(padding.left).toBeCloseTo(6, 1);
    expect(padding.top).toBeCloseTo(8.5, 1);
  });
});
