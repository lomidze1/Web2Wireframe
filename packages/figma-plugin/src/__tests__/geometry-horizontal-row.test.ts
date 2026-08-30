/**
 * Tests for the geometry-derived horizontal row promotion (css-converter.ts).
 *
 * A block container whose children sit side by side on one line proves a row,
 * but nothing in the CSS says so: `display: block` yields layoutMode NONE, the
 * float / all-inline heuristics in `inferLayoutFromChildren` do not fire, and
 * `geometrySupportsVerticalStack` (nodes.ts) rejects it — so the frame falls
 * through to absolute placement and loses its auto-layout entirely.
 *
 * `geometrySupportsHorizontalRow` is the x-axis mirror of that vertical gate,
 * and the `geometryRows` option promotes such containers to HORIZONTAL. The
 * option defaults OFF; the first block below is the proof that OFF is today's
 * behaviour exactly.
 *
 * Measured on the stripe.com capture: 40 of the 71 block containers that fall
 * to absolute today form a clean non-overlapping row.
 */
import { describe, it, expect } from "vitest";
import {
  convertW2WToWireframe,
  geometrySupportsHorizontalRow,
} from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

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

/** A `display: block` child box — deliberately NOT inline, so the existing
 *  all-inline / float inference in `inferLayoutFromChildren` stays silent. */
function blockCell(x: number, width: number): Record<string, unknown> {
  return makeFrame({
    x, y: 5, width, height: 20,
    quad: [x, 5, x + width, 5, x + width, 25, x, 25],
    styles: { display: 'block', backgroundColor: 'rgb(200, 200, 200)' },
    children: [],
  });
}

/**
 * Three block cells side by side: padding 20 left / 40 right / 5 top / 5
 * bottom, and a uniform 20px gap. Modelled on stripe.com's four-column stat
 * strip, which today renders as three pixel-frozen absolute boxes.
 */
function rowFixture(): Record<string, unknown> {
  return makeFrame({
    x: 0, y: 0, width: 400, height: 30,
    quad: [0, 0, 400, 0, 400, 30, 0, 30],
    classList: ['stat-strip'],
    styles: { display: 'block' },
    children: [blockCell(20, 100), blockCell(140, 100), blockCell(260, 100)],
  });
}

/** Same three cells, but the middle one overlaps its neighbour by 10px. */
function overlappingFixture(): Record<string, unknown> {
  return makeFrame({
    x: 0, y: 0, width: 400, height: 30,
    quad: [0, 0, 400, 0, 400, 30, 0, 30],
    styles: { display: 'block' },
    children: [blockCell(20, 100), blockCell(110, 100), blockCell(260, 100)],
  });
}

/** Three block cells stacked vertically — the case the vertical gate owns. */
function columnFixture(): Record<string, unknown> {
  const cell = (y: number) => makeFrame({
    x: 20, y, width: 200, height: 20,
    quad: [20, y, 220, y, 220, y + 20, 20, y + 20],
    styles: { display: 'block', backgroundColor: 'rgb(200, 200, 200)' },
    children: [],
  });
  return makeFrame({
    x: 0, y: 0, width: 400, height: 100,
    quad: [0, 0, 400, 0, 400, 100, 0, 100],
    styles: { display: 'block' },
    children: [cell(5), cell(35), cell(65)],
  });
}

const findByClass = (root: WireframeNode, cls: string): WireframeNode | null => {
  if (root.className === cls) return root;
  for (const child of root.children || []) {
    const hit = findByClass(child, cls);
    if (hit) return hit;
  }
  return null;
};

// ---------------------------------------------------------------------------
// 1. Switch OFF is today's behaviour, exactly
// ---------------------------------------------------------------------------

describe("geometryRows: OFF is unchanged", () => {
  it("a promotable row stays layoutMode NONE with no measured spacing or padding", () => {
    const tree = convertW2WToWireframe(rowFixture() as never, { geometryRows: false });

    expect(tree.layoutMode).toBe('NONE');
    expect(tree.itemSpacing).toBe(0);
    expect(tree.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(tree.children).toHaveLength(3);
  });

  it("omitting the option entirely produces the identical tree", () => {
    const withFalse = convertW2WToWireframe(rowFixture() as never, { geometryRows: false });
    const withAbsent = convertW2WToWireframe(rowFixture() as never, {});

    // The flag must gate every downstream effect, not just the axis field —
    // deep equality is the only assertion that proves that.
    expect(withAbsent).toEqual(withFalse);
  });
});

// ---------------------------------------------------------------------------
// 2. Switch ON promotes, and the measured geometry comes with it
// ---------------------------------------------------------------------------

describe("geometryRows: ON promotes a proven row", () => {
  it("a block container whose children sit side by side becomes HORIZONTAL", () => {
    const tree = convertW2WToWireframe(rowFixture() as never, { geometryRows: true });

    expect(tree.layoutMode).toBe('HORIZONTAL');
    expect(tree.children).toHaveLength(3);
  });

  it("promotion unlocks the measured itemSpacing and padding it was skipping", () => {
    const tree = convertW2WToWireframe(rowFixture() as never, { geometryRows: true });

    // Without these the row packs flush left and loses the gaps that make it
    // readable — the whole reason the promotion happens late in convertFrame.
    expect(tree.itemSpacing).toBe(20);
    expect(tree.padding).toEqual({ top: 5, right: 40, bottom: 5, left: 20 });
  });
});

// ---------------------------------------------------------------------------
// 3. The gate is conservative
// ---------------------------------------------------------------------------

describe("geometryRows: no false promotion", () => {
  it("children overlapping on x stay NONE", () => {
    const tree = convertW2WToWireframe(overlappingFixture() as never, { geometryRows: true });
    expect(tree.layoutMode).toBe('NONE');
  });

  it("a vertical stack stays NONE so the nodes.ts vertical gate still decides it", () => {
    const tree = convertW2WToWireframe(columnFixture() as never, { geometryRows: true });
    expect(tree.layoutMode).toBe('NONE');
  });

  it("a single child is never a row", () => {
    const single = makeFrame({
      x: 0, y: 0, width: 400, height: 30,
      quad: [0, 0, 400, 0, 400, 30, 0, 30],
      styles: { display: 'block' },
      children: [blockCell(20, 100)],
    });
    const tree = convertW2WToWireframe(single as never, { geometryRows: true });
    expect(tree.layoutMode).toBe('NONE');
  });
});

// ---------------------------------------------------------------------------
// 4. Text coalescing keeps priority
// ---------------------------------------------------------------------------

describe("geometryRows: coalescing is not stolen", () => {
  /**
   * A heading that keeps a styled span beside its text: the frame carries a
   * coalesced `textContent` AND a `type: 'text'` child. nodes.ts:1146 suppresses
   * the frame-level text whenever a child already carries text, so the children
   * are the whole content and a row over them is safe. 37 of the 40 rows on the
   * stripe.com capture are this shape.
   */
  function headingWithBadge(): Record<string, unknown> {
    return makeFrame({
      tag: 'h2',
      x: 0, y: 0, width: 300, height: 24,
      quad: [0, 0, 300, 0, 300, 24, 0, 24],
      styles: { display: 'block', fontSize: '20px' },
      children: [
        makeText('Powering business', { x: 0, y: 0, width: 200, height: 24 }),
        makeFrame({
          tag: 'span',
          x: 210, y: 0, width: 60, height: 24,
          quad: [210, 0, 270, 0, 270, 24, 210, 24],
          styles: {
            display: 'inline-block',
            backgroundColor: 'rgb(0, 120, 255)',
            paddingLeft: '6px', paddingRight: '6px',
            borderTopLeftRadius: '4px',
          },
          children: [makeText('New', { x: 216, y: 0, width: 48, height: 24 })],
        }),
      ],
    });
  }

  it("a heading whose text is suppressed by a text child is still promoted", () => {
    const off = convertW2WToWireframe(headingWithBadge() as never, { geometryRows: false });
    const on = convertW2WToWireframe(headingWithBadge() as never, { geometryRows: true });

    // Preconditions: this really is the textContent-plus-text-child shape.
    expect(off.type).toBe('frame');
    expect(off.textContent?.trim()).toBeTruthy();
    expect((off.children || []).some((c) => c.type === 'text')).toBe(true);

    expect(off.layoutMode).toBe('NONE');
    expect(on.layoutMode).toBe('HORIZONTAL');
    // …and the promotion must still earn its measured spacing.
    expect(on.itemSpacing).toBe(10);
  });

  it("a promoted frame never leaves a textContent that would render on its own", () => {
    // The promotion is gated on nodes.ts:1146's contract: a frame's own
    // textContent is emitted as a separate, separately-positioned text node
    // ONLY when no child already carries text. Auto-layout would fight such a
    // node, so assert the invariant holds for everything we promote.
    const check = (root: WireframeNode): void => {
      if (root.layoutMode === 'HORIZONTAL' && root.textContent?.trim()) {
        expect((root.children || []).some((c) => c.type === 'text')).toBe(true);
      }
      (root.children || []).forEach(check);
    };
    check(convertW2WToWireframe(headingWithBadge() as never, { geometryRows: true }));
    check(convertW2WToWireframe(rowFixture() as never, { geometryRows: true }));
  });

  it("a <p> of pure text still collapses to a single text node", () => {
    const paragraph = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 400, height: 30,
      quad: [0, 0, 400, 0, 400, 30, 0, 30],
      styles: { display: 'block', fontSize: '14px' },
      children: [
        makeText('Hello', { x: 0, y: 0, width: 60, height: 14 }),
        makeText('world', { x: 70, y: 0, width: 60, height: 14 }),
      ],
    });

    const tree = convertW2WToWireframe(paragraph as never, { geometryRows: true });

    expect(tree.type).toBe('text');
    expect(tree.layoutMode).toBe('NONE');
  });
});

// ---------------------------------------------------------------------------
// 5. The helper itself
// ---------------------------------------------------------------------------

describe("geometrySupportsHorizontalRow", () => {
  const box = (over: Partial<WireframeNode>): WireframeNode =>
    ({ x: 0, y: 0, width: 10, height: 10, children: [], ...over } as WireframeNode);

  it("accepts boxes laid out left to right", () => {
    expect(geometrySupportsHorizontalRow([
      box({ x: 0, width: 10 }),
      box({ x: 10, width: 10 }),
      box({ x: 25, width: 10 }),
    ])).toBe(true);
  });

  it("accepts them in any input order", () => {
    expect(geometrySupportsHorizontalRow([
      box({ x: 25, width: 10 }),
      box({ x: 0, width: 10 }),
      box({ x: 10, width: 10 }),
    ])).toBe(true);
  });

  it("rejects an overlap past the epsilon", () => {
    expect(geometrySupportsHorizontalRow([
      box({ x: 0, width: 10 }),
      box({ x: 9, width: 10 }),
    ])).toBe(false);
  });

  it("tolerates sub-pixel overlap within the epsilon", () => {
    expect(geometrySupportsHorizontalRow([
      box({ x: 0, width: 10 }),
      box({ x: 9.6, width: 10 }),
    ])).toBe(true);
  });

  it("ignores out-of-flow and zero-area children", () => {
    expect(geometrySupportsHorizontalRow([
      box({ x: 0, width: 10 }),
      box({ x: 0, width: 10, position: 'absolute' }),
      box({ x: 5, width: 0, height: 0 }),
      box({ x: 10, width: 10 }),
    ])).toBe(true);
  });

  it("is false for fewer than two participants", () => {
    expect(geometrySupportsHorizontalRow([box({ x: 0, width: 10 })])).toBe(false);
    expect(geometrySupportsHorizontalRow([])).toBe(false);
  });
});
