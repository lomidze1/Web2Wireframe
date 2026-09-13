/**
 * Inline elements whose FIRST line is indented must not be coalesced into one
 * Figma TEXT node.
 *
 * stripe.com's developers section puts an `<h3>` and a `<p>` side by side, both
 * `display: inline`, so they share one text flow:
 *
 *   <div class="section-title">
 *     <h3 class="…--inline">Choose an integration path.</h3>
 *     <p  class="…--inline">With AI-powered support, rich documentation, …</p>
 *   </div>
 *
 * Measured on the live page at 1440px, the `<p>`'s three line rects are
 * x=412.4 / x=96.5 / x=96.5 — the first line starts AFTER the heading. Its
 * `getBoundingClientRect()`, however, is the UNION: x=96.5, w=686.6, h=91.2.
 *
 * The coalescer joined all three runs into a single TEXT node placed on that
 * union box, so Figma re-laid the paragraph flush left and line 1 lost its
 * 315.9px indent — landing on top of the heading.
 *
 * h2d never merges: `zy()` emits one TEXT node per visual line, each at its own
 * measured quad, and its layout engine (`Nh`) refuses auto-layout unless every
 * row shares a left, right or centre edge. These tests pin the same rule:
 * coalesce only when the rows share an edge, otherwise keep the per-line runs
 * at their measured x/y.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Helpers
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
  const base = { x: 0, y: 0, width: 100, height: 33, ...overrides } as {
    x: number; y: number; width: number; height: number;
  };
  return {
    type: 'TEXT',
    value,
    font: '280 26px Sohne',
    ...base,
    quad: [
      base.x, base.y,
      base.x + base.width, base.y,
      base.x + base.width, base.y + base.height,
      base.x, base.y + base.height,
    ],
  };
}

type TextNode = Record<string, unknown> & {
  type: string; x: number; y: number; width: number; height: number;
  textContent?: string; position?: string;
};

/** Every rendered text WireframeNode, in tree order. */
function collectTextNodes(node: unknown): TextNode[] {
  const out: TextNode[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text') out.push(obj as TextNode);
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

/** Absolute page position of a node, walking the parent-relative offsets. */
function absoluteRects(root: unknown): Array<{ node: TextNode; x: number; y: number }> {
  const out: Array<{ node: TextNode; x: number; y: number }> = [];
  const visit = (n: unknown, ox: number, oy: number): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const x = ox + (obj.x as number ?? 0);
    const y = oy + (obj.y as number ?? 0);
    if (obj.type === 'text') out.push({ node: obj as TextNode, x, y });
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(c => visit(c, x, y));
  };
  visit(root, 0, 0);
  return out;
}

// The stripe.com geometry, translated so the section-title box starts at 0,0.
// h3 occupies line 1 up to x=315.9; the paragraph continues on the same line.
const LINE_H = 33;
const LINE_STEP = 29.1;

function stripeSectionTitle(): Record<string, unknown> {
  const h3 = makeFrame({
    tag: 'h3',
    x: 0, y: 0, width: 315.9, height: LINE_H,
    quad: [0, 0, 315.9, 0, 315.9, LINE_H, 0, LINE_H],
    styles: { display: 'inline', fontSize: '26px' },
    children: [makeText('Choose an integration path.', { x: 0, y: 0, width: 310.6, height: LINE_H })],
  });

  // Union bbox of the three line rects — exactly what the browser reports.
  const p = makeFrame({
    tag: 'p',
    x: 0, y: 0, width: 686.6, height: 91.2,
    quad: [0, 0, 686.6, 0, 686.6, 91.2, 0, 91.2],
    styles: { display: 'inline', fontSize: '26px' },
    children: [
      makeText('With AI-powered support, rich documentation, and built-in', { x: 315.9, y: 0, width: 339.6, height: LINE_H }),
      makeText('debugging tools, you can quickly get started with the best', { x: 0, y: LINE_STEP, width: 686.6, height: LINE_H }),
      makeText('option for your business.', { x: 0, y: LINE_STEP * 2, width: 556, height: LINE_H }),
    ],
  });

  return makeFrame({
    tag: 'div',
    classList: ['section-title'],
    x: 0, y: 0, width: 752, height: 91.2,
    quad: [0, 0, 752, 0, 752, 91.2, 0, 91.2],
    styles: { display: 'block' },
    children: [h3, p],
  });
}

// ---------------------------------------------------------------------------

describe('inline first-line indent', () => {
  it('keeps the indented first line at its measured x instead of coalescing', () => {
    const result = convertW2WToWireframe(stripeSectionTitle() as never, { layoutMode: 'autoLayout' });
    const texts = collectTextNodes(result);

    const first = texts.find(t => String(t.textContent).startsWith('With AI-powered'));
    expect(first, 'the paragraph must still render its first line').toBeTruthy();

    // The bug: all three lines folded into one node on the union box (x = 0).
    expect(first!.textContent).not.toContain('option for your business');
    expect(first!.x).toBeCloseTo(315.9, 1);
  });

  it('pins the un-coalesced runs so auto-layout cannot discard their x', () => {
    const result = convertW2WToWireframe(stripeSectionTitle() as never, { layoutMode: 'autoLayout' });
    const paragraphRuns = collectTextNodes(result)
      .filter(t => /With AI-powered|debugging tools|option for your/.test(String(t.textContent)));

    expect(paragraphRuns.length).toBeGreaterThanOrEqual(2);
    for (const run of paragraphRuns) {
      expect(run.position).toBe('absolute');
    }
  });

  it('does not overlap the heading run', () => {
    const result = convertW2WToWireframe(stripeSectionTitle() as never, { layoutMode: 'autoLayout' });
    const rects = absoluteRects(result);

    const heading = rects.find(r => String(r.node.textContent).startsWith('Choose an integration'));
    const firstLine = rects.find(r => String(r.node.textContent).startsWith('With AI-powered'));
    expect(heading && firstLine).toBeTruthy();

    const headingRight = heading!.x + heading!.node.width;
    // Same row, so the paragraph must begin at or after the heading's right edge.
    expect(Math.abs(firstLine!.y - heading!.y)).toBeLessThanOrEqual(2);
    expect(firstLine!.x).toBeGreaterThanOrEqual(headingRight - 0.51);
  });
});

describe('inline first-line indent — regressions', () => {
  it('still coalesces an ordinary left-aligned block paragraph', () => {
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 686.6, height: 91.2,
      quad: [0, 0, 686.6, 0, 686.6, 91.2, 0, 91.2],
      styles: { display: 'block', fontSize: '26px' },
      children: [
        makeText('With AI-powered support, rich documentation, and built-in', { x: 0, y: 0, width: 686.6, height: LINE_H }),
        makeText('debugging tools, you can quickly get started with the best', { x: 0, y: LINE_STEP, width: 660, height: LINE_H }),
        makeText('option for your business.', { x: 0, y: LINE_STEP * 2, width: 556, height: LINE_H }),
      ],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const texts = collectTextNodes(result);

    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toContain('option for your business');
  });

  it('still coalesces a centred paragraph whose rows share a centre', () => {
    // Rows differ in x AND width, but every centre lands on 343.3.
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 686.6, height: 91.2,
      quad: [0, 0, 686.6, 0, 686.6, 91.2, 0, 91.2],
      styles: { display: 'block', fontSize: '26px', textAlign: 'center' },
      children: [
        makeText('With AI-powered support, rich documentation, and built-in', { x: 0, y: 0, width: 686.6, height: LINE_H }),
        makeText('debugging tools, you can quickly get started with the best', { x: 13.3, y: LINE_STEP, width: 660, height: LINE_H }),
        makeText('option for your business.', { x: 65.3, y: LINE_STEP * 2, width: 556, height: LINE_H }),
      ],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const texts = collectTextNodes(result);

    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toContain('option for your business');
  });

  it('still coalesces a right-aligned paragraph whose rows share a right edge', () => {
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 686.6, height: 91.2,
      quad: [0, 0, 686.6, 0, 686.6, 91.2, 0, 91.2],
      styles: { display: 'block', fontSize: '26px', textAlign: 'right' },
      children: [
        makeText('With AI-powered support, rich documentation, and built-in', { x: 0, y: 0, width: 686.6, height: LINE_H }),
        makeText('debugging tools, you can quickly get started with the best', { x: 26.6, y: LINE_STEP, width: 660, height: LINE_H }),
        makeText('option for your business.', { x: 130.6, y: LINE_STEP * 2, width: 556, height: LINE_H }),
      ],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const texts = collectTextNodes(result);

    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toContain('option for your business');
  });

  /**
   * …but only when the shared-edge test is the ONLY thing standing in the way.
   *
   * `rowsCoalescable` is computed for every frame and read inside a branch
   * that is entered for four independent reasons — a non-text child, a layout
   * container, a non-coalescing tag, or the rows themselves. The pin's
   * justification ("these rows reached this branch precisely BECAUSE no single
   * node can express them") holds for the last one only.
   *
   * `<li><svg class="icon"/>A label long enough to wrap</li>` is the common
   * shape that gets caught: row 1 starts after the icon, row 2 at 0, so the
   * rows share no edge — and every run in the list item went absolute because
   * of an icon. Absolute runs also drop out of `inFlowChildren`, which is what
   * `measuredPadding` and `measuredItemSpacing` read, so the item loses its
   * measured geometry as well.
   */
  describe('a non-text sibling is not a reason to pin', () => {
    /** `<li>` holding an icon and two wrapped lines of label. */
    function iconListItem(): Record<string, unknown> {
      return makeFrame({
        tag: 'li',
        x: 0, y: 0, width: 300, height: 66,
        quad: [0, 0, 300, 0, 300, 66, 0, 66],
        styles: { display: 'block', fontSize: '16px', lineHeight: '33px' },
        children: [
          makeFrame({
            tag: 'svg',
            x: 0, y: 8, width: 20, height: 20,
            quad: [0, 8, 20, 8, 20, 28, 0, 28],
            styles: { display: 'inline-block' },
          }),
          makeText('A label long enough', { x: 28, y: 0, width: 272, height: 33 }),
          // Deliberately ragged: no left, right or centre edge is shared, so
          // `rowsShareCommonEdge` is false and the pin would fire.
          makeText('to wrap onto two lines', { x: 0, y: 33, width: 180, height: 33 }),
        ],
      });
    }

    it('leaves the label runs in flow', () => {
      const result = convertW2WToWireframe(iconListItem() as never, {
        layoutMode: 'autoLayout',
      });
      const runs = collectTextNodes(result);

      expect(runs.length).toBeGreaterThanOrEqual(2);
      for (const run of runs) {
        expect(run.position).not.toBe('absolute');
      }
    });

    it('keeps every word of the label', () => {
      const result = convertW2WToWireframe(iconListItem() as never, {
        layoutMode: 'autoLayout',
      });
      const text = collectTextNodes(result).map(t => t.textContent).join(' ');

      expect(text).toContain('A label long enough');
      expect(text).toContain('to wrap onto two lines');
    });
  });
});
