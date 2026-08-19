/**
 * Floated children must force HORIZONTAL layout — even when they classify as
 * inline-text frames, and even inside TEXT_COALESCE parents (a, span, p…).
 *
 * telex.ge regression #1 (navbar): `a.ac-title` contains a float:left icon
 * `<i class="ut2-icon-outline-cart">` (glyph + absolute "0" badge) followed by
 * an inline `<span>კალათა</span>`. The `<i>` counted as an *inline-text frame*
 * (its subtree is all text), so the float never registered; the all-inline
 * rule is gated off for `a` parents → layout fell to NONE → the renderer
 * stacked icon and label VERTICALLY, pushing "კალათა" out of the 50px navbar.
 *
 * telex.ge regression #2 (footer): `div.row-fluid` with 4 float:left
 * `div.span4` columns must become HORIZONTAL with FIXED column widths.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 1200, height: 100,
    quad: [0, 0, 1200, 0, 1200, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1440, height: 900, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1440, height: 900,
    styles: { height: "100%" },
    children: [body],
    isScrollingElt: true,
  });
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.className === "string" && obj.className.split(" ").includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

function text(value: string, x: number, y: number, w: number, h: number): Record<string, unknown> {
  return {
    type: "TEXT", x, y, width: w, height: h,
    quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    value, font: "BPG Nino Mtavruli",
  };
}

describe("float:left icon inside <a> (telex navbar cart/account)", () => {
  function cartLink(): Record<string, unknown> {
    return makeFrame({
      tag: "a", classList: ["ac-title", "ty-hand"],
      x: 1327, y: 101, width: 106, height: 28,
      styles: { display: "block", fontSize: "15px" },
      children: [
        // float:left icon — subtree is "all text" (glyph + badge), which is
        // exactly what used to hide the float signal.
        makeFrame({
          tag: "i", classList: ["ut2-icon-outline-cart"],
          x: 1327, y: 101, width: 33, height: 28,
          styles: { display: "block", cssFloat: "left", position: "relative", fontSize: "28px", fontFamily: "uni2-icons" },
          children: [
            makeFrame({
              tag: "span", classList: ["ty-minicart-count"],
              x: 1341, y: 97, width: 14, height: 14,
              styles: { display: "flex", position: "absolute", top: "-4px", right: "5px", fontSize: "11px" },
              children: [text("0", 1345, 98, 7, 12)],
            }),
          ],
        }),
        makeFrame({
          tag: "span", classList: ["cart-label"],
          x: 1360, y: 107, width: 57, height: 16,
          styles: { display: "inline" },
          children: [text("კალათა", 1360, 107, 57, 16)],
        }),
      ],
    });
  }

  it("gives the <a> HORIZONTAL layout so icon and label stay on one row", () => {
    const root = convertW2WToWireframe(page([cartLink()]) as never, { layoutMode: "autoLayout" });
    const link = findByClass(root, "ac-title");
    expect(link).not.toBeNull();
    expect(link!.layoutMode).toBe("HORIZONTAL");
  });
});

describe("float:left columns in block row (telex footer)", () => {
  function column(i: number, cls: string, headerText: string): Record<string, unknown> {
    const x = 120 + i * 306.5;
    return makeFrame({
      tag: "div", classList: ["span4", cls],
      x, y: 9341, width: 281, height: 184,
      styles: {
        display: "block", cssFloat: "left", width: "281.469px",
        marginLeft: i === 0 ? "0px" : "25.5312px",
      },
      children: [
        makeFrame({
          tag: "div", classList: ["ty-footer-general"],
          x, y: 9341, width: 281, height: 184,
          styles: { display: "block" },
          children: [
            makeFrame({
              tag: "span", classList: ["ty-footer-general__header"],
              x, y: 9341, width: 281, height: 20,
              styles: { display: "block" },
              children: [text(headerText, x, 9341, 150, 20)],
            }),
          ],
        }),
      ],
    });
  }

  function footerRow(): Record<string, unknown> {
    return makeFrame({
      tag: "div", classList: ["row-fluid"],
      x: 120, y: 9341, width: 1200, height: 214,
      styles: { display: "block" },
      children: [
        column(0, "my-account-grid", "ჩვენ შესახებ"),
        column(1, "demo-store-grid", "მომსახურების პირობები"),
        column(2, "customer-service-grid", "ჩემი გვერდი"),
        column(3, "about-grid", "დაგვიკავშირდით"),
      ],
    });
  }

  it("renders the row as HORIZONTAL with FIXED-width columns", () => {
    const root = convertW2WToWireframe(page([footerRow()]) as never, { layoutMode: "autoLayout" });
    const row = findByClass(root, "row-fluid");
    expect(row).not.toBeNull();
    expect(row!.layoutMode).toBe("HORIZONTAL");

    const col2 = findByClass(root, "demo-store-grid");
    expect(col2).not.toBeNull();
    expect(col2!.layoutSizingHorizontal).toBe("FIXED");
    expect(col2!.width).toBe(281);
  });

  it("keeps the inter-column gap (margin-left) so columns don't jam", () => {
    const root = convertW2WToWireframe(page([footerRow()]) as never, { layoutMode: "autoLayout" });
    const row = findByClass(root, "row-fluid") as { itemSpacing?: number } | null;
    const col1 = findByClass(root, "my-account-grid") as { margin?: { right?: number } } | null;
    const col2 = findByClass(root, "demo-store-grid") as { margin?: { left?: number } } | null;
    expect(col2).not.toBeNull();
    // The 25.5px gap is uniform across all four columns, so
    // collapseMarginWrappers folds it into the row's itemSpacing instead of
    // giving every column a `:margin` wrapper. Assert the rendered gap, not
    // which property happens to carry it.
    const gap =
      (row!.itemSpacing ?? 0) + (col1!.margin?.right ?? 0) + (col2!.margin?.left ?? 0);
    expect(Math.round(gap)).toBe(26);
  });
});
