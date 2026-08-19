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

  it("ignores spans, matching parseGridLine's existing strictness", () => {
    const root = convert(frGrid({ gridArea: '2 / span 2 / 3 / span 2' }));
    const c = child(root)!;
    expect(c.gridRowStart).toBe(2);
    expect(c.gridColumnStart).toBeUndefined();
  });

  it("accepts negative line numbers", () => {
    const root = convert(frGrid({ gridArea: '1 / -2 / 2 / -1' }));
    const c = child(root)!;
    expect(c.gridColumnStart).toBe(-2);
    expect(c.gridColumnEnd).toBe(-1);
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
