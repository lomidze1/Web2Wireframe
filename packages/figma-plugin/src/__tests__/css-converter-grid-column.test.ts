/**
 * Grid-column inference.
 *
 * Some captures lose a grid child's explicit `grid-column` (the computed
 * `grid-column-start` isn't recorded). paco.me centers its article with
 * `main-grid { grid-template-columns: 192px 640px 192px }` + article on
 * `grid-column: 2`; without the start line the article auto-places into column
 * 1 and renders left-aligned. The converter must recover the column from the
 * child's geometry — its left offset within the grid matches a track boundary.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

interface RawNode {
  type: "FRAME";
  x: number;
  y: number;
  width: number;
  height: number;
  quad: number[];
  tag: string;
  classList: string[];
  attr: Record<string, unknown>;
  styles: Record<string, string | number | undefined>;
  children: RawNode[];
  isScrollingElt?: boolean;
}

function frame(
  tag: string,
  geom: { x?: number; y?: number; width: number; height: number },
  styles: Record<string, string | number | undefined>,
  children: RawNode[] = [],
  extra: Partial<RawNode> = {},
): RawNode {
  const x = geom.x ?? 0;
  const y = geom.y ?? 0;
  return {
    type: "FRAME",
    x,
    y,
    width: geom.width,
    height: geom.height,
    quad: [x, y, x + geom.width, y, x + geom.width, y + geom.height, x, y + geom.height],
    tag,
    classList: [],
    attr: {},
    styles,
    children,
    ...extra,
  };
}

interface ConvertedNode {
  className?: string;
  gridColumnStart?: number;
  children?: ConvertedNode[];
}

function findByClass(node: ConvertedNode, cls: string): ConvertedNode | null {
  if (node.className?.split(" ").includes(cls)) return node;
  for (const c of node.children ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

/**
 * paco.me grid: main-grid `192px 640px 192px` (gap 24), child placed in a given
 * column by setting its x to that column's left edge.
 *   col 1 → offset 0, col 2 → offset 216 (192+24), col 3 → offset 856.
 */
function gridTree(childOffset: number, childStartStyle?: string): RawNode {
  const child = frame(
    "article",
    { x: childOffset, y: 0, width: 640, height: 400 },
    childStartStyle
      ? { display: "block", gridColumnStart: childStartStyle }
      : { display: "block" },
    [],
    { classList: ["article"] },
  );
  const grid = frame(
    "div",
    { x: 0, y: 0, width: 1072, height: 400 },
    {
      display: "grid",
      gridTemplateColumns: "192px 640px 192px",
      columnGap: "24px",
    },
    [child],
    { classList: ["main-grid"] },
  );
  const body = frame("body", { x: 0, y: 0, width: 1440, height: 800 }, { height: "100%" }, [grid]);
  return frame("html", { x: 0, y: 0, width: 1440, height: 800 }, { height: "100%" }, [body], {
    isScrollingElt: true,
  });
}

// Apple-like promo grids lose explicit grid-row/grid-column and
// must be reconstructable from geometry when tracks are fixed pixels.
function gridTreeWithCell(
  cell: { colOffset: number; rowOffset: number },
  childStyles: Record<string, string | number | undefined> = { display: "block" },
): RawNode {
  const child = frame(
    "article",
    { x: cell.colOffset, y: cell.rowOffset, width: 614.5, height: 580 },
    childStyles,
    [],
    { classList: ["article"] },
  );
  const grid = frame(
    "div",
    { x: 0, y: 0, width: 1265, height: 1764 },
    {
      display: "grid",
      gridTemplateColumns: "614.5px 614.5px",
      gridTemplateRows: "580px 580px 580px",
      columnGap: "12px",
      rowGap: "12px",
    },
    [child],
    { classList: ["promo-grid"] },
  );
  const body = frame("body", { x: 0, y: 0, width: 1440, height: 2200 }, { height: "100%" }, [grid]);
  return frame("html", { x: 0, y: 0, width: 1440, height: 2200 }, { height: "100%" }, [body], {
    isScrollingElt: true,
  });
}

describe("convertW2WToWireframe — grid-column inference", () => {
  it("infers grid-column 2 from geometry when the start line is missing", () => {
    const root = convertW2WToWireframe(gridTree(216) as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, "article")!.gridColumnStart).toBe(2);
  });

  it("infers grid-column 1 for a child at the grid's left edge", () => {
    const root = convertW2WToWireframe(gridTree(0) as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, "article")!.gridColumnStart).toBe(1);
  });

  it("keeps an explicit grid-column-start over the geometric guess", () => {
    // Child geometrically at column 1 (offset 0) but explicitly placed on line 2.
    const root = convertW2WToWireframe(gridTree(0, "2") as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, "article")!.gridColumnStart).toBe(2);
  });

  it("does not infer a column when the parent is not a grid", () => {
    const child = frame(
      "div",
      { x: 216, y: 0, width: 640, height: 400 },
      { display: "block" },
      [],
      { classList: ["child"] },
    );
    const parent = frame("div", { x: 0, y: 0, width: 1072, height: 400 }, { display: "block" }, [child]);
    const body = frame("body", { x: 0, y: 0, width: 1440, height: 800 }, { height: "100%" }, [parent]);
    const html = frame("html", { x: 0, y: 0, width: 1440, height: 800 }, { height: "100%" }, [body], {
      isScrollingElt: true,
    });
    const root = convertW2WToWireframe(html as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, "child")!.gridColumnStart).toBeUndefined();
  });

  it("infers grid-row 2 from geometry when the start line is missing", () => {
    // Row 2 starts at 592 = 580px track + 12px gap.
    const root = convertW2WToWireframe(
      gridTreeWithCell({ colOffset: 626.5, rowOffset: 592 }) as never,
      { layoutMode: "autoLayout" },
    );
    expect(findByClass(root, "article")!.gridRowStart).toBe(2);
  });

  it("keeps an explicit grid-row-start over the geometric guess", () => {
    // Geometry says row 1, explicit line says row 3.
    const root = convertW2WToWireframe(
      gridTreeWithCell(
        { colOffset: 0, rowOffset: 0 },
        { display: "block", gridRowStart: "3" },
      ) as never,
      { layoutMode: "autoLayout" },
    );
    expect(findByClass(root, "article")!.gridRowStart).toBe(3);
  });
});
