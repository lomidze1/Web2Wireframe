/**
 * stripe.com: an SVG's measured position is thrown away by auto-layout.
 *
 * A `type: "SVG"` capture node carries NO styles at all — only geometry. So
 * `position`, `display` and `margin` never reach the converter, and the only
 * record of where the browser put the icon is its rect. The converter keeps
 * that rect faithfully, but the parent gets auto-layout and Figma re-places
 * every child, so the offset survives only if it is expressed as padding.
 *
 * Three live symptoms, one cause:
 *   A  span.hds-nowrap-svg      chevron measured at y=6    → imported at y=0
 *   B  div.case-study-card__mediaLogo  logo at y=376       → imported at y=0
 *   C  div.book-of-the-week__content   logo at (482, -64)  → imported at (0, 80)
 *
 * h2d's output for the same three (their dump, root #1 of the -vs- capture):
 *   span.hds-nowrap-svg            5x16   pad 6/0/2/0        ↳ 5x8    @ y=6
 *   div.case-study-card__mediaLogo 332x448 pad 376/212/12/20 ↳ 100x60 @ 20,376
 *   div.book-of-the-week__content  608x585 pad 80/0/80/0
 *     ↳ logo 86x136 @ 482,-64  layoutPositioning ABSOLUTE
 *     ↳ text 608x425 @ 0,80    AUTO
 *
 * Their `Yh` (app.beautified.js:61241) takes a single child's measured insets
 * as the padding with no display test at all; C is out of flow for them
 * because their SVG descriptors carry `$position`. Ours do not, so C is
 * recognised by geometry: the rect leaves the parent's box.
 */
import { describe, it, expect } from "vitest";

import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function frame(
  styles: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const width = (overrides.width as number) ?? 100;
  const height = (overrides.height as number) ?? 50;
  const x = (overrides.x as number) ?? 0;
  const y = (overrides.y as number) ?? 0;
  return {
    type: "FRAME",
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    tag: "div",
    classList: [],
    attr: {},
    styles,
    children: [],
    ...overrides,
  };
}

function svg(x: number, y: number, width: number, height: number): Record<string, unknown> {
  return {
    type: "SVG",
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    svg: `<svg width="${width}" height="${height}"><path d="M0 0h1v1H0z"/></svg>`,
  };
}

/** Everything is wrapped so simplifyTree never folds the box under test away. */
function root(child: Record<string, unknown>): Record<string, unknown> {
  return frame(
    { display: "block", backgroundColor: "rgb(9, 9, 9)" },
    { classList: ["root"], width: 1440, height: 2000, children: [child, frame({ display: "block", backgroundColor: "rgb(8, 8, 8)" }, { y: 1000, width: 1440, height: 40 })] },
  );
}

function find(node: WireframeNode, predicate: (n: WireframeNode) => boolean): WireframeNode | null {
  if (predicate(node)) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, predicate);
    if (hit) return hit;
  }
  return null;
}

const byClass = (cls: string) => (n: WireframeNode) => (n.className ?? "").split(" ").includes(cls);
const isSvg = (n: WireframeNode) => n.tag === "svg";

// ---------------------------------------------------------------------------
// C — an SVG whose rect leaves the parent's box is out of flow
// ---------------------------------------------------------------------------

describe("an escaping SVG becomes absolute", () => {
  /** stripe.com's book-of-the-week: logo pinned above the card's top-right. */
  const bookOfTheWeek = (logo = svg(482, -64, 86, 136)) =>
    root(
      frame(
        { display: "flex", flexDirection: "column", paddingTop: "80px", paddingBottom: "80px" },
        {
          classList: ["book-of-the-week__content"],
          width: 608,
          height: 585,
          children: [
            logo,
            frame({ display: "block", backgroundColor: "rgb(7, 7, 7)" }, {
              classList: ["book-of-the-week__text"],
              y: 80, width: 608, height: 425,
            }),
          ],
        },
      ),
    );

  it("marks the logo absolute and keeps its measured offset", () => {
    const tree = convertW2WToWireframe(bookOfTheWeek() as never, { htmlLayerNames: true });
    const logo = find(tree, isSvg)!;

    expect(logo.position).toBe("absolute");
    expect(logo.x).toBe(482);
    expect(logo.y).toBe(-64);
  });

  it("leaves the parent's padding to the child that is still in flow", () => {
    // h2d: pad 80/0/80/0 — measured from the text alone, the logo excluded.
    const tree = convertW2WToWireframe(bookOfTheWeek() as never, { htmlLayerNames: true });
    const content = find(tree, byClass("book-of-the-week__content"))!;

    expect(content.padding).toEqual({ top: 80, right: 0, bottom: 80, left: 0 });
  });

  it("leaves a lone overflowing SVG alone — there is no flow to disturb", () => {
    // linear.app's `Dc5tqa_primaryLogo`: a 1200px mark bleeding out of a 480px
    // box, and the only child. Nothing else moves, so nothing needs saying.
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "block" }, {
          classList: ["primaryLogo"],
          width: 480, height: 480,
          children: [svg(-360, -360, 1200, 1200)],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, isSvg)!.position).toBeUndefined();
  });

  it("leaves an SVG that fits inside its parent in flow", () => {
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "flex" }, {
          classList: ["row"],
          width: 200, height: 40,
          children: [
            svg(12, 12, 16, 16),
            frame({ display: "block", backgroundColor: "rgb(6, 6, 6)" }, { x: 40, width: 120, height: 40 }),
          ],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, isSvg)!.position).toBeUndefined();
  });

  it("ignores a sub-pixel overhang", () => {
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "flex" }, {
          classList: ["row"],
          width: 200, height: 40,
          children: [
            svg(0, -0.4, 16, 16),
            frame({ display: "block", backgroundColor: "rgb(5, 5, 5)" }, { x: 40, width: 120, height: 40 }),
          ],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, isSvg)!.position).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A + B — a block box with one SVG child keeps the measured insets
// ---------------------------------------------------------------------------

describe("a block box holding one SVG takes its padding from the measurement", () => {
  it("A — the chevron's 6px baseline offset survives", () => {
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "block", lineHeight: "16px" }, {
          tag: "span",
          classList: ["hds-nowrap-svg"],
          width: 5, height: 16,
          children: [svg(0, 6, 5, 8)],
        }),
      ) as never,
      { htmlLayerNames: true },
    );
    const span = find(tree, byClass("hds-nowrap-svg"))!;

    // h2d: pad 6/0/2/0
    expect(span.padding).toEqual({ top: 6, right: 0, bottom: 2, left: 0 });
  });

  it("B — a logo parked 376px down its card survives", () => {
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "block" }, {
          classList: ["case-study-card__mediaLogo"],
          width: 332, height: 448,
          children: [svg(20, 376, 100, 60)],
        }),
      ) as never,
      { htmlLayerNames: true },
    );
    const card = find(tree, byClass("case-study-card__mediaLogo"))!;

    // h2d: pad 376/212/12/20
    expect(card.padding).toEqual({ top: 376, right: 212, bottom: 12, left: 20 });
  });

  it("does not extend the rule to a text child — margin collapsing owns that axis", () => {
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "block" }, {
          tag: "h4",
          classList: ["heading"],
          width: 630, height: 28,
          children: [
            { type: "TEXT", x: 0, y: 4, width: 59, height: 20, quad: [0, 4, 59, 4, 59, 24, 0, 24], value: "Heading", font: "16px Inter" },
          ],
        }),
      ) as never,
      { htmlLayerNames: true },
    );
    const heading = find(tree, (n) => (n.className ?? "").includes("heading"))!;

    expect(heading.padding.top).toBe(0);
    expect(heading.padding.bottom).toBe(0);
  });

  it("keeps the existing inline-level behaviour", () => {
    const tree = convertW2WToWireframe(
      root(
        frame({ display: "inline-block" }, {
          tag: "span",
          classList: ["inline-icon"],
          width: 20, height: 20,
          children: [svg(2, 3, 16, 14)],
        }),
      ) as never,
      { htmlLayerNames: true },
    );
    const span = find(tree, byClass("inline-icon"))!;

    expect(span.padding).toEqual({ top: 3, right: 2, bottom: 3, left: 2 });
  });
});
