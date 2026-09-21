import { describe, it, expect, beforeAll } from "vitest";
import { auditTextContrast } from "../rendering/contrastAudit";

// Minimal stand-ins for the Figma nodes the audit reads. It only touches
// fills / opacity / visible / parent / fontSize / fontWeight / fillStyleId.
const MIXED = Symbol("mixed");

beforeAll(() => {
  (globalThis as unknown as { figma: { mixed: symbol } }).figma = { mixed: MIXED };
});

type FakeNode = Record<string, unknown>;

const solid = (r: number, g: number, b: number, opacity = 1) => ({
  type: "SOLID",
  visible: true,
  opacity,
  color: { r, g, b },
});

let nextId = 0;
const frame = (fills: unknown[], parent: FakeNode | null = null): FakeNode => ({
  id: `f${nextId++}`,
  type: "FRAME",
  fills,
  parent,
});

const text = (
  parent: FakeNode,
  fills: unknown,
  opts: { fontSize?: unknown; fontWeight?: unknown; style?: string } = {},
): FakeNode => ({
  id: `t${nextId++}`,
  type: "TEXT",
  visible: true,
  opacity: 1,
  fills,
  parent,
  fontSize: opts.fontSize ?? 16,
  fontWeight: opts.fontWeight ?? 400,
  fillStyleId: opts.style ?? "",
});

const run = (nodes: FakeNode[], limit?: number) =>
  auditTextContrast(nodes as unknown as TextNode[], limit);

const WHITE_BG = () => frame([solid(1, 1, 1)]);
const LIGHT_GREY = [solid(0.8, 0.8, 0.8)];
const BLACK = [solid(0, 0, 0)];

describe("auditTextContrast", () => {
  it("counts failing texts and the unique styles they use", () => {
    const bg = WHITE_BG();
    const res = run([
      text(bg, LIGHT_GREY, { style: "S:grey" }),
      text(bg, LIGHT_GREY, { style: "S:grey" }),
      text(bg, [solid(0.85, 0.85, 0.85)], { style: "S:paler" }),
      text(bg, BLACK, { style: "S:black" }),
    ]);
    expect(res).toEqual({ issues: 3, styles: 2, colors: 0, capped: false });
  });

  it("groups failures without a style by their color", () => {
    const bg = WHITE_BG();
    expect(
      run([
        text(bg, LIGHT_GREY),
        text(bg, LIGHT_GREY),
        text(bg, [solid(0.85, 0.85, 0.85)]),
        text(bg, LIGHT_GREY, { style: "S:grey" }),
      ]),
    ).toEqual({ issues: 4, styles: 1, colors: 2, capped: false });
  });

  it("treats the same color at another opacity as a different color", () => {
    const bg = WHITE_BG();
    expect(
      run([text(bg, [solid(0.6, 0.6, 0.6)]), text(bg, [solid(0.6, 0.6, 0.6, 0.5)])]).colors,
    ).toBe(2);
  });

  it("uses the nearest ancestor with a visible fill", () => {
    const outer = frame([solid(0, 0, 0)]);
    const inner = frame([], outer); // no fill → look further up
    // White text on the black outer frame passes.
    expect(run([text(inner, [solid(1, 1, 1)])]).issues).toBe(0);
  });

  it("applies the 3:1 threshold to large text", () => {
    const bg = WHITE_BG();
    const grey = [solid(0.58, 0.58, 0.58)]; // ≈ 3.03:1
    expect(run([text(bg, grey, { fontSize: 24 })]).issues).toBe(0);
    expect(run([text(bg, grey, { fontSize: 16 })]).issues).toBe(1);
  });

  it("skips gradient, image and translucent backgrounds", () => {
    const gradient = frame([{ type: "GRADIENT_LINEAR", visible: true, gradientStops: [] }]);
    const image = frame([{ type: "IMAGE", visible: true }]);
    const translucent = frame([solid(1, 1, 1, 0.5)]);
    const multi = frame([solid(1, 1, 1), solid(0, 0, 0, 0.2)]);
    expect(
      run([
        text(gradient, LIGHT_GREY),
        text(image, LIGHT_GREY),
        text(translucent, LIGHT_GREY),
        text(multi, LIGHT_GREY),
      ]).issues,
    ).toBe(0);
  });

  it("skips texts it cannot judge", () => {
    const bg = WHITE_BG();
    const hidden = { ...text(bg, LIGHT_GREY), visible: false };
    expect(
      run([
        text(bg, MIXED),
        text(bg, [{ type: "GRADIENT_LINEAR", visible: true }]),
        text(bg, LIGHT_GREY, { fontSize: MIXED }),
        text(bg, LIGHT_GREY, { fontWeight: MIXED }),
        text(frame([]), LIGHT_GREY), // no background anywhere
        hidden,
      ]).issues,
    ).toBe(0);
  });

  it("ignores invisible paints on the text", () => {
    const bg = WHITE_BG();
    const fills = [{ ...solid(1, 0, 0), visible: false }, solid(0, 0, 0)];
    expect(run([text(bg, fills)]).issues).toBe(0);
  });

  it("checks only the first `limit` texts and reports the cap", () => {
    const bg = WHITE_BG();
    const nodes = Array.from({ length: 5 }, () => text(bg, LIGHT_GREY));
    expect(run(nodes, 3)).toEqual({ issues: 3, styles: 0, colors: 1, capped: true });
    expect(run(nodes, 5).capped).toBe(false);
  });
});
