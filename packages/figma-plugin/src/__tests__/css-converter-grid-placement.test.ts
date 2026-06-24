/**
 * Tests for css-converter.ts: CSS Grid child placement forwarding.
 *
 * The W2W extraction captures `grid-column-start/end` and `grid-row-start/end`
 * (snapshot.ts), but the css-converter previously dropped them — only the
 * container's grid-template/gap were forwarded. Without the child's grid line,
 * a centering grid (e.g. paco.me `192px 640px 192px` with the article on
 * `grid-column: 2`) places the article in the wrong (first) cell.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

describe("css-converter: grid child placement forwarding", () => {
  it("forwards numeric grid-column-start to the child WireframeNode", () => {
    const root = makeFrame({
      tag: "div",
      width: 1024,
      height: 400,
      styles: { display: "grid", gridTemplateColumns: "192px 640px 192px" },
      children: [
        makeFrame({
          tag: "article",
          x: 216,
          width: 640,
          height: 400,
          styles: { gridColumnStart: "2" },
        }),
      ],
    });

    const wf = convertW2WToWireframe(root as never);

    expect(wf.children).toHaveLength(1);
    expect(wf.children[0].gridColumnStart).toBe(2);
  });

  it("forwards grid-row-start/end and grid-column-end", () => {
    const root = makeFrame({
      tag: "div",
      width: 600,
      height: 400,
      styles: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr" },
      children: [
        makeFrame({
          tag: "div",
          width: 200,
          height: 200,
          styles: {
            gridColumnStart: "1",
            gridColumnEnd: "3",
            gridRowStart: "2",
            gridRowEnd: "3",
          },
        }),
      ],
    });

    const wf = convertW2WToWireframe(root as never);
    const c = wf.children[0];
    expect(c.gridColumnStart).toBe(1);
    expect(c.gridColumnEnd).toBe(3);
    expect(c.gridRowStart).toBe(2);
    expect(c.gridRowEnd).toBe(3);
  });

  it("treats 'auto' and non-integer grid lines as undefined", () => {
    const root = makeFrame({
      tag: "div",
      width: 600,
      height: 400,
      styles: { display: "grid", gridTemplateColumns: "1fr 1fr" },
      children: [
        makeFrame({
          tag: "div",
          width: 200,
          height: 200,
          styles: { gridColumnStart: "auto", gridColumnEnd: "span 2" },
        }),
      ],
    });

    const wf = convertW2WToWireframe(root as never);
    const c = wf.children[0];
    expect(c.gridColumnStart).toBeUndefined();
    expect(c.gridColumnEnd).toBeUndefined();
  });
});
