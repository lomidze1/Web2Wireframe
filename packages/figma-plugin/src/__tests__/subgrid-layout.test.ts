/**
 * stripe.com: the two "Ready to get started?" cards imported stacked.
 *
 * `div.footer-cta-section__feature-grid` is a CSS **subgrid** — it borrows its
 * parent's twelve 88px tracks rather than declaring its own:
 *
 *   parent  display:grid  grid-template-columns: 88px ×12   column-gap: 16px
 *   this    display:grid  grid-template-columns: "subgrid [] [] [] [] [] [] []"
 *                         column-gap: normal   grid-area: auto / span 6
 *   cards   grid-column-start: span 3  →  296px each, the second at x=312
 *
 * Chrome resolves an ordinary grid template to used pixels, which is why the
 * parent arrives as `88px ×12`. A subgrid stays symbolic: no sizes, only the
 * inherited line names. `parseGridTemplate` then reads the bare `subgrid`
 * keyword as ONE flex track, `gridColumnCount` becomes 1, and Figma stacks
 * both cards in a single column — the second landing at y=204, past the
 * frame's own 164px height.
 *
 * h2d never reaches that state: their `$grid` is an already-resolved track
 * list carrying a per-axis subgrid flag (`Zq`, app.beautified.js:59487), and
 * for this very node they drop the grid entirely and emit a measured row —
 * `HORIZONTAL, gap 16, padding 0`, cards at x=0 and x=312.
 */
import { describe, it, expect } from "vitest";
import { parseGridTemplate } from "@w2w/shared";

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

/** A card with a visible surface, so no pass gets to drop it as empty. */
const card = (x: number, cls: string) =>
  frame({ display: "block", backgroundColor: "rgb(240, 240, 245)" }, {
    classList: [cls],
    x, y: 0, width: 296, height: 164,
  });

function find(node: WireframeNode, cls: string): WireframeNode | null {
  if ((node.className ?? "").split(" ").includes(cls)) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, cls);
    if (hit) return hit;
  }
  return null;
}

/** The page wrapper keeps simplifyTree from folding the box under test away. */
const page = (child: Record<string, unknown>) =>
  frame({ display: "block", backgroundColor: "rgb(255, 255, 255)" }, {
    classList: ["page"],
    width: 1440,
    height: 900,
    children: [
      child,
      frame({ display: "block", backgroundColor: "rgb(250, 250, 250)" }, { y: 500, width: 1440, height: 60 }),
    ],
  });

const SUBGRID = "subgrid [] [] [] [] [] [] []";

// ---------------------------------------------------------------------------

describe("parseGridTemplate on a subgrid — the premise of this fix", () => {
  it("reads the bare keyword as a single track", () => {
    // Not a bug we fix in @w2w/shared: the computed value genuinely carries no
    // track sizes. The converter has to stop asking it for a column count.
    expect(parseGridTemplate(SUBGRID)).toHaveLength(1);
    expect(parseGridTemplate("88px 88px 88px")).toHaveLength(3);
  });
});

describe("a subgrid container", () => {
  it("becomes a measured row when its children sit side by side", () => {
    const tree = convertW2WToWireframe(
      page(
        frame({ display: "grid", gridTemplateColumns: SUBGRID, rowGap: "40px" }, {
          classList: ["feature-grid"],
          width: 608, height: 164,
          children: [card(0, "card-a"), card(312, "card-b")],
        }),
      ) as never,
      { htmlLayerNames: true },
    );
    const grid = find(tree, "feature-grid")!;

    // h2d: HORIZONTAL, gap 16, padding 0 — the CSS column-gap is `normal`, so
    // 16 can only come from the measurement (312 - 296).
    expect(grid.layoutMode).toBe("HORIZONTAL");
    expect(grid.itemSpacing).toBe(16);
    expect(grid.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(grid.children.map((c) => Math.round(c.x))).toEqual([0, 312]);
    expect(grid.children.map((c) => Math.round(c.width))).toEqual([296, 296]);
  });

  it("becomes a column when its children are stacked", () => {
    const tree = convertW2WToWireframe(
      page(
        frame({ display: "grid", gridTemplateColumns: SUBGRID }, {
          classList: ["stacked-grid"],
          width: 296, height: 344,
          children: [
            frame({ display: "block", backgroundColor: "rgb(240, 240, 245)" }, { classList: ["card-a"], width: 296, height: 164 }),
            frame({ display: "block", backgroundColor: "rgb(240, 240, 245)" }, { classList: ["card-b"], y: 180, width: 296, height: 164 }),
          ],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, "stacked-grid")!.layoutMode).toBe("VERTICAL");
  });

  it("is recognised whatever line names follow the keyword", () => {
    const tree = convertW2WToWireframe(
      page(
        frame({ display: "grid", gridTemplateColumns: "subgrid" }, {
          classList: ["bare-subgrid"],
          width: 608, height: 164,
          children: [card(0, "card-a"), card(312, "card-b")],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, "bare-subgrid")!.layoutMode).toBe("HORIZONTAL");
  });
});

describe("ordinary grids are untouched", () => {
  it("keeps GRID for a template with real tracks", () => {
    const tree = convertW2WToWireframe(
      page(
        frame({ display: "grid", gridTemplateColumns: "296px 296px", columnGap: "16px" }, {
          classList: ["real-grid"],
          width: 608, height: 164,
          children: [card(0, "card-a"), card(312, "card-b")],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, "real-grid")!.layoutMode).toBe("GRID");
  });

  it("keeps GRID when the template is `none`", () => {
    const tree = convertW2WToWireframe(
      page(
        frame({ display: "grid", gridTemplateColumns: "none" }, {
          classList: ["auto-grid"],
          width: 608, height: 164,
          children: [card(0, "card-a"), card(312, "card-b")],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, "auto-grid")!.layoutMode).toBe("GRID");
  });

  it("does not mistake a track named `subgridish` for the keyword", () => {
    const tree = convertW2WToWireframe(
      page(
        frame({ display: "grid", gridTemplateColumns: "[subgridish] 296px 296px" }, {
          classList: ["named-grid"],
          width: 608, height: 164,
          children: [card(0, "card-a"), card(312, "card-b")],
        }),
      ) as never,
      { htmlLayerNames: true },
    );

    expect(find(tree, "named-grid")!.layoutMode).toBe("GRID");
  });
});

describe("stripe.com's CTA section, end to end", () => {
  it("puts the two feature cards side by side", () => {
    const tree = convertW2WToWireframe(
      page(
        frame(
          {
            display: "grid",
            gridTemplateColumns:
              "88px 88px 88px 88px 88px 88px 88px 88px 88px 88px 88px 88px",
            columnGap: "16px",
          },
          {
            classList: ["section-container"],
            width: 1266, height: 380,
            children: [
              frame({ display: "grid", gridTemplateColumns: SUBGRID, rowGap: "40px" }, {
                classList: ["footer-cta-section__feature-grid"],
                x: 641, width: 608, height: 164,
                children: [
                  frame({ display: "block", backgroundColor: "rgb(240, 240, 245)" }, {
                    classList: ["footer-cta-section__feature-card"],
                    x: 641, width: 296, height: 164,
                  }),
                  frame({ display: "block", backgroundColor: "rgb(240, 240, 245)" }, {
                    classList: ["footer-cta-section__feature-card"],
                    x: 953, width: 296, height: 164,
                  }),
                ],
              }),
            ],
          },
        ),
      ) as never,
      { htmlLayerNames: true },
    );
    const grid = find(tree, "footer-cta-section__feature-grid")!;

    expect(grid.layoutMode).toBe("HORIZONTAL");
    expect(grid.itemSpacing).toBe(16);
    expect(grid.children).toHaveLength(2);
    expect(grid.children.map((c) => Math.round(c.x))).toEqual([0, 312]);
  });
});
