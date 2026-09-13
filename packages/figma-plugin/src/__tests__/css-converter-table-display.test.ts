/**
 * `display: table-*` children fill their parent's width.
 *
 * `getSizing`'s `isBlockChild` list covers `block`, `list-item`, `flex`, `grid`
 * and empty — so `table-cell`, `table-row` and friends matched no branch and
 * fell through to the `undefined` tail, keeping their own measured width. Once
 * a table has been merged into a Figma auto-layout, its cells stop tracking
 * their row and shrink to their own text.
 *
 * This is h2d's single table rule — `display.startsWith("table-")` → width FILL.
 * Bare `table` and `inline-table` are shrink-to-fit in CSS and stay excluded.
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

function frame(
  tag: string,
  box: { x: number; y: number; width: number; height: number },
  styles: Record<string, unknown>,
  children: unknown[] = [],
) {
  const { x, y, width, height } = box;
  return {
    type: 'FRAME',
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    tag,
    classList: [],
    attr: {},
    styles,
    children,
  };
}

/**
 * `<div><table><tr><td/><th/></tr><tr><td/><th/></tr></table></div>`
 *
 * The table is narrower than its block parent and each cell is narrower than
 * its row, so FILL and no-FILL are distinguishable on both. Two rows, two cells
 * per row: single-child chains get collapsed by the tree simplifier, which
 * would take the `<table>` node out of the tree entirely.
 */
function table(
  tableStyles: Record<string, unknown> = {},
  firstCellStyles: Record<string, unknown> = {},
) {
  const row = (y: number, cellStyles: Record<string, unknown>) => frame(
    'tr', { x: 0, y, width: 500, height: 60 }, { display: 'table-row' },
    [
      frame('td', { x: 0, y, width: 200, height: 60 },
        { display: 'table-cell', ...cellStyles }),
      frame('th', { x: 200, y, width: 300, height: 60 },
        { display: 'table-cell' }),
    ],
  );
  const tbl = frame('table', { x: 0, y: 0, width: 500, height: 120 },
    { display: 'table', ...tableStyles }, [row(0, firstCellStyles), row(60, {})]);
  return frame('div', { x: 0, y: 0, width: 800, height: 120 },
    { display: 'block' }, [tbl]);
}

const at = (tag: string) => (root: WireframeNode) =>
  findNode(root, n => n.tag === tag)!;

const td = at('td');
const tr = at('tr');
const tbl = at('table');

describe("display: table-*", () => {
  it("fills a table-cell inside a table-row", () => {
    expect(td(convert(table())).layoutSizingHorizontal).toBe('FILL');
  });

  it("keeps the browser-measured height on a table-cell", () => {
    // The browser already stretched the cell to its row's height, so the
    // measurement is the right one — Figma must not re-derive it.
    expect(td(convert(table())).layoutSizingVertical).toBe('FIXED');
  });

  it("fills a table-row inside a table", () => {
    expect(tr(convert(table())).layoutSizingHorizontal).toBe('FILL');
  });

  it("leaves bare display: table unchanged", () => {
    // Shrink-to-fit in CSS — the `table-` prefix must not match it.
    expect(tbl(convert(table())).layoutSizingHorizontal).toBeUndefined();
  });

  it("leaves display: inline-table unchanged", () => {
    expect(
      tbl(convert(table({ display: 'inline-table' }))).layoutSizingHorizontal,
    ).toBeUndefined();
  });

  it("keeps FIXED on a table-cell that also floats", () => {
    // A float uses its computed width whatever its display says.
    expect(
      td(convert(table({}, { cssFloat: 'left' }))).layoutSizingHorizontal,
    ).toBe('FIXED');
  });
});
