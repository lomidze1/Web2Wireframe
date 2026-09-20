/**
 * Grid child placement recovered from the `grid-area` shorthand.
 *
 * The converter resolves a grid child's cell as
 *   parseGridLine(s.gridColumnStart) ?? inferGridColumnStart(node, parent)
 * but `grid-column-start` / `grid-row-start` are not in the extension's
 * capture list, so the explicit path was always dead and every child fell
 * through to the geometric inference — which bails out unless every track in
 * `grid-template-columns` is a fixed px value. Real grids use `fr` / `minmax`
 * / `%`, so explicitly placed items lost their placement entirely.
 *
 * `grid-area` IS captured, and its computed value carries all four lines as
 * `row-start / column-start / row-end / column-end`.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function findNode(
  node: unknown,
  predicate: (n: WireframeNode) => boolean,
): WireframeNode | null {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== 'object') continue;
    const obj = cur as WireframeNode;
    if (predicate(obj)) return obj;
    if (Array.isArray(obj.children)) stack.push(...obj.children);
  }
  return null;
}

function convert(tree: Record<string, unknown>): WireframeNode {
  return convertW2WToWireframe(tree as never, {});
}

/**
 * A grid whose tracks are `fr` — the case the geometric inference gives up on.
 * The child is tagged `section` so tests can find it.
 */
function frGrid(childStyles: Record<string, unknown>) {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 900, height: 400,
    quad: [0, 0, 900, 0, 900, 400, 0, 400],
    tag: 'div',
    classList: [],
    attr: {},
    styles: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      columnGap: '0px',
      rowGap: '0px',
    },
    children: [
      {
        type: 'FRAME',
        x: 600, y: 200, width: 300, height: 200,
        quad: [600, 200, 900, 200, 900, 400, 600, 400],
        tag: 'section',
        classList: [],
        attr: {},
        styles: { display: 'block', ...childStyles },
        children: [],
      },
    ],
  };
}

const child = (root: WireframeNode) => findNode(root, n => n.tag === 'section');

describe("grid-area → explicit grid placement", () => {
  it("reads row/column start out of the four-value shorthand", () => {
    const root = convert(frGrid({ gridArea: '2 / 3 / 3 / 4' }));
    const c = child(root)!;
    expect(c.gridRowStart).toBe(2);
    expect(c.gridColumnStart).toBe(3);
  });

  it("reads the end lines too", () => {
    const root = convert(frGrid({ gridArea: '2 / 3 / 3 / 4' }));
    const c = child(root)!;
    expect(c.gridRowEnd).toBe(3);
    expect(c.gridColumnEnd).toBe(4);
  });

  it("works on an fr grid, where geometric inference bails out", () => {
    // Same tree without grid-area: the px-only guard in inferGridColumnStart
    // rejects `1fr 1fr 1fr`, so nothing is recovered.
    const root = convert(frGrid({}));
    const c = child(root)!;
    expect(c.gridColumnStart).toBeUndefined();
    expect(c.gridRowStart).toBeUndefined();
  });

  it("leaves the all-auto default alone", () => {
    const root = convert(frGrid({ gridArea: 'auto / auto / auto / auto' }));
    const c = child(root)!;
    expect(c.gridColumnStart).toBeUndefined();
    expect(c.gridRowStart).toBeUndefined();
  });

  it("ignores named areas — they are not line numbers", () => {
    const root = convert(frGrid({ gridArea: 'sidebar / sidebar / sidebar / sidebar' }));
    const c = child(root)!;
    expect(c.gridColumnStart).toBeUndefined();
    expect(c.gridRowStart).toBeUndefined();
  });

  it("a span on both sides has no line to anchor to", () => {
    const root = convert(frGrid({ gridArea: '2 / span 2 / 3 / span 2' }));
    const c = child(root)!;
    expect(c.gridRowStart).toBe(2);
    expect(c.gridColumnStart).toBeUndefined();
  });

  it("resolves negative line numbers against the parent's tracks", () => {
    // 3 columns → 4 lines: -1 is line 4, -2 is line 3. The renderer only
    // understands positive lines, so a raw -1 used to break the span.
    const root = convert(frGrid({ gridArea: '1 / -2 / 2 / -1' }));
    const c = child(root)!;
    expect(c.gridColumnStart).toBe(3);
    expect(c.gridColumnEnd).toBe(4);
  });

  it("tolerates a partial shorthand", () => {
    // `grid-area: 2 / 3` is valid CSS; the computed value normally expands to
    // four values, but a capture carrying only two must not throw.
    const root = convert(frGrid({ gridArea: '2 / 3' }));
    const c = child(root)!;
    expect(c.gridRowStart).toBe(2);
    expect(c.gridColumnStart).toBe(3);
    expect(c.gridRowEnd).toBeUndefined();
  });

  it("an explicit grid-column-start still wins over the shorthand", () => {
    const root = convert(frGrid({ gridColumnStart: '1', gridArea: '2 / 3 / 3 / 4' }));
    expect(child(root)!.gridColumnStart).toBe(1);
  });
});

describe("grid-area does not disturb the geometric fallback", () => {
  /** Fixed-px grid — the case inferGridColumnStart was written for. */
  function pxGrid(childStyles: Record<string, unknown>) {
    return {
      type: 'FRAME',
      x: 0, y: 0, width: 1024, height: 400,
      quad: [0, 0, 1024, 0, 1024, 400, 0, 400],
      tag: 'div',
      classList: [],
      attr: {},
      styles: {
        display: 'grid',
        gridTemplateColumns: '192px 640px 192px',
        columnGap: '24px',
        paddingLeft: '0px',
      },
      children: [
        {
          type: 'FRAME',
          x: 216, y: 0, width: 640, height: 400,
          quad: [216, 0, 856, 0, 856, 400, 216, 400],
          tag: 'article',
          classList: [],
          attr: {},
          styles: { display: 'block', ...childStyles },
          children: [],
        },
      ],
    };
  }

  it("still infers column 2 from geometry when grid-area is absent", () => {
    const root = convert(pxGrid({}));
    const c = findNode(root, n => n.tag === 'article')!;
    expect(c.gridColumnStart).toBe(2);
  });

  it("prefers the declared grid-area over the inferred geometry", () => {
    const root = convert(pxGrid({ gridArea: '1 / 3 / 2 / 4' }));
    const c = findNode(root, n => n.tag === 'article')!;
    expect(c.gridColumnStart).toBe(3);
  });
});

// notion.com footer (user report 2026-09-17): a 12-column grid inside a
// named-line layout grid. `span 4`, `-1` and `content-start / content-end`
// were all dropped, so the brand block took ONE 82px column and the whole
// footer collapsed into the wrong cells.
function notionFooter() {
  const col = (x: number, y: number, w: number, h: number, tag: string, gridArea: string) => ({
    type: 'FRAME', x, y, width: w, height: h,
    quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    tag, classList: [], attr: {},
    styles: { display: 'block', gridArea },
    children: [],
  });
  const tracks = Array(12).fill('82.3281px').join(' ');
  const inner = {
    type: 'FRAME', x: 94, y: 0, width: 1252, height: 292,
    quad: [94, 0, 1346, 0, 1346, 292, 94, 292],
    tag: 'main', classList: [], attr: {},
    styles: {
      display: 'grid', gridTemplateColumns: tracks, gridTemplateRows: '214px 38px',
      columnGap: '24px', rowGap: '40px', gridArea: 'auto / content-start / auto / content-end',
    },
    children: [
      col(94, 0, 401, 214, 'section', 'auto / 1 / auto / span 4'),
      col(519, 0, 827, 214, 'nav', 'auto / 5 / auto / -1'),
      col(1157, 254, 189, 38, 'aside', '2 / 11 / auto / span 2'),
      col(519, 254, 189, 29, 'p', '2 / span 2 / auto / 7'),
    ],
  };
  return {
    type: 'FRAME', x: 30, y: 0, width: 1380, height: 292,
    quad: [30, 0, 1410, 0, 1410, 292, 30, 292],
    tag: 'div', classList: [], attr: {},
    styles: {
      display: 'grid',
      gridTemplateColumns: '[full-start] 64px [content-start] 1252px [content-end] 64px [full-end]',
    },
    children: [inner],
  };
}

describe("grid placement: span, negative and named lines (notion.com footer)", () => {
  const root = convert(notionFooter());
  const byTag = (tag: string) => findNode(root, n => n.tag === tag)!;

  it("resolves named lines from the parent's template", () => {
    const inner = byTag('main');
    expect(inner.gridColumnStart).toBe(2);
    expect(inner.gridColumnEnd).toBe(3);
  });

  it("turns an end `span N` into a line", () => {
    const brand = byTag('section');
    expect(brand.gridColumnStart).toBe(1);
    expect(brand.gridColumnEnd).toBe(5);
  });

  it("turns `-1` into the last line", () => {
    const nav = byTag('nav');
    expect(nav.gridColumnStart).toBe(5);
    expect(nav.gridColumnEnd).toBe(13);
  });

  it("keeps an explicit row and a span end together", () => {
    const locale = byTag('aside');
    expect(locale.gridRowStart).toBe(2);
    expect(locale.gridColumnStart).toBe(11);
    expect(locale.gridColumnEnd).toBe(13);
  });

  it("turns a start `span N` before a definite end into a line", () => {
    const p = byTag('p');
    expect(p.gridColumnStart).toBe(5);
    expect(p.gridColumnEnd).toBe(7);
  });
});
