/**
 * Regression tests for css-converter.ts — a text-only inline wrapper that gets
 * collapsed into its parent's text must keep its OWN font-size and line-height.
 *
 * `collectTextFromFrame` already carries the wrapper's colour, decoration,
 * weight, letter-spacing and text-case onto each run; font-size was the one
 * inherited property it dropped, so every collapsed run rendered at the
 * coalescing parent's size.
 *
 * Concrete bug fixed here: glinc.io "what we build" cards, where
 *   <span class="head">
 *     <span class="name" style="font-size:22px; line-height:33px">Legibly</span>
 *     <span class="live">…</span>
 *   </span>
 * rendered "Legibly" at the card's inherited 16px/24px. The `.desc` (15px) and
 * `.badge` (12px) siblings only escaped because `max-width` / `padding` make
 * classifyWrapper frame them instead of collapsing them.
 *
 * Two collapse paths exist and both were affected:
 *   - mixed children  → convertTextValueToNode (parent keeps frame children)
 *   - fully coalesced → the styledSegments map (parent becomes a text node)
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

type Tree = Record<string, unknown>;

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
    x: 0, y: 0, width: 80, height: 16,
    quad: [0, 0, 80, 0, 80, 16, 0, 16],
    value,
    font: 'Archivo Bold',
    ...overrides,
  };
}

describe("css-converter: collapsed inline wrapper keeps its own font-size", () => {
  // -----------------------------------------------------------------------
  // 1. Mixed-children path — the parent keeps a frame child, so the collapsed
  //    run becomes its own TEXT node via convertTextValueToNode.
  // -----------------------------------------------------------------------
  it("1. <span 16px><span 22px>Legibly</span><span with a frame child/></span> renders the run at 22px", () => {
    const name = makeFrame({
      tag: 'span',
      classList: ['name'],
      x: 0, y: 0, width: 76, height: 33,
      quad: [0, 0, 76, 0, 76, 33, 0, 33],
      styles: { display: 'block', fontSize: '22px', lineHeight: '33px' },
      children: [makeText('Legibly', { x: 0, y: 4, width: 76, height: 24 })],
    });

    // A `.live`-style badge: its ::before dot is a frame, so the badge is not
    // text-only and survives as a frame — which is what puts the parent on the
    // mixed-children path.
    const dot = makeFrame({
      tag: 'span',
      x: 90, y: 13, width: 7, height: 7,
      quad: [90, 13, 97, 13, 97, 20, 90, 20],
      styles: { display: 'block', backgroundColor: 'rgb(233, 78, 27)' },
      children: [],
    });

    const live = makeFrame({
      tag: 'span',
      classList: ['live'],
      x: 90, y: 8, width: 42, height: 17,
      quad: [90, 8, 132, 8, 132, 25, 90, 25],
      styles: { display: 'flex', fontSize: '11px' },
      children: [dot, makeText('Live', { x: 103, y: 8, width: 29, height: 17 })],
    });

    const head = makeFrame({
      tag: 'span',
      classList: ['head'],
      x: 0, y: 0, width: 200, height: 33,
      quad: [0, 0, 200, 0, 200, 33, 0, 33],
      styles: { display: 'flex', fontSize: '16px', lineHeight: '24px' },
      children: [name, live],
    });

    const result = convertW2WToWireframe(head as never, { layoutMode: 'autoLayout' });
    const children = (result as Tree).children as Tree[];
    const textNode = children.find((c) => c.textContent === 'Legibly');
    expect(textNode).toBeDefined();
    expect(textNode!.fontSize).toBe(22);
    expect(textNode!.lineHeight).toBe('33px');
  });

  // -----------------------------------------------------------------------
  // 2. Fully-coalesced path — the parent becomes a text node and the runs
  //    survive as styledSegments, which text.ts turns into range font sizes.
  // -----------------------------------------------------------------------
  it("2. <p 16px>plain <span 22px>big</span></p> gives the span's segment 22px and the plain run 16px", () => {
    const big = makeFrame({
      tag: 'span',
      x: 60, y: 0, width: 40, height: 33,
      quad: [60, 0, 100, 0, 100, 33, 60, 33],
      styles: { display: 'inline', fontSize: '22px' },
      children: [makeText('big', { x: 60, y: 0, width: 40, height: 28, font: 'Geist' })],
    });

    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 300, height: 33,
      quad: [0, 0, 300, 0, 300, 33, 0, 33],
      styles: { display: 'block', fontSize: '16px' },
      children: [
        makeText('plain ', { x: 0, y: 4, width: 55, height: 24, font: 'Geist' }),
        big,
      ],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).type).toBe('text');
    const segments = (result as Tree).styledSegments as Array<{ text: string; fontSize: number }>;
    expect(segments).toBeDefined();
    const plainSeg = segments.find((s) => s.text.includes('plain'));
    const bigSeg = segments.find((s) => s.text.includes('big'));
    expect(plainSeg?.fontSize).toBe(16);
    expect(bigSeg?.fontSize).toBe(22);
  });
});
