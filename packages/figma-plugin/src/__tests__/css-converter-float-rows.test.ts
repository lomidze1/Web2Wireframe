/**
 * A float only means "horizontal" within a single visual line.
 *
 * telex.ge product cards (`div.ut2-gl__body`) stack image → rating → name →
 * price vertically. Cards that also have a YouTube badge carry ONE extra
 * `<img class="ab__vg-icon-video" style="float:left">` (14×14) between the
 * image and the rating row. `inferLayoutFromChildren` returned HORIZONTAL for
 * any float at all, so that single icon turned the whole 241px-wide card into
 * a row of 841px of content: the stars, title and price were pushed outside
 * the clipped frame — visible in the layer list, invisible on canvas.
 *
 * The browser stacks those children (y = 937 → 1162 → 1178 → 1215); the float
 * only shifts the rating row's inline content sideways. So the float rule is
 * gated on the children actually occupying a single horizontal band.
 *
 * The second test pins the case the float rule exists for (telex.ge navbar):
 * a float:left icon and its label really do share one line.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", {
  createFrame: vi.fn(),
  createText: vi.fn(),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 100,
    quad: [0, 0, 100, 0, 100, 100, 0, 100],
    tag: "div", classList: [], attr: {}, styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1440, height: 2000, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1440, height: 2000,
    styles: { height: "100%" }, children: [body], isScrollingElt: true,
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

/** Real telex.ge geometry, x normalised to 0. `withVideoIcon` adds the badge. */
function productCard(withVideoIcon: boolean): Record<string, unknown> {
  const kids: Record<string, unknown>[] = [
    makeFrame({ classList: ["ut2-gl__image"], x: 0, y: 937, width: 211, height: 211,
      styles: { display: "block", position: "relative" } }),
  ];
  if (withVideoIcon) {
    kids.push(makeFrame({
      tag: "img", classList: ["ab__vg-icon-video"],
      x: 0, y: 1162, width: 14, height: 14,
      styles: { display: "block", position: "relative", cssFloat: "left" },
    }));
  }
  kids.push(
    makeFrame({ classList: ["ut2-gl__rating"], x: withVideoIcon ? 17 : 0, y: 1158,
      width: withVideoIcon ? 194 : 211, height: 20, styles: { display: "flex" } }),
    makeFrame({ classList: ["ut2-gl__name"], x: 0, y: 1178, width: 211, height: 32,
      styles: { display: "block" },
      children: [{ type: "TEXT", x: 0, y: 1179, width: 175, height: 14,
        quad: [0, 1179, 175, 1179, 175, 1193, 0, 1193],
        value: "კულინარია ჩემი ოჯახისთვის", font: "Arial" }] }),
    makeFrame({ classList: ["ut2-gl__price"], x: 0, y: 1215, width: 211, height: 42,
      styles: { display: "block" },
      children: [{ type: "TEXT", x: 0, y: 1237, width: 39, height: 19,
        quad: [0, 1237, 39, 1237, 39, 1256, 0, 1256],
        value: "49,95₾", font: "Arial" }] }),
  );

  return makeFrame({
    classList: ["ut2-gl__item"], x: 0, y: 922, width: 241, height: 353,
    styles: { display: "block", position: "relative" },
    children: [makeFrame({
      classList: ["ut2-gl__body"], x: 0, y: 922, width: 241, height: 350,
      styles: { display: "block", position: "relative" },
      children: kids,
    })],
  });
}

describe("float-driven layout inference", () => {
  it("does not turn a stacked product card into a row because of one floated icon", () => {
    const root = convertW2WToWireframe(page([productCard(true)]) as never, { layoutMode: "autoLayout" });
    const body = findByClass(root, "ut2-gl__body");
    expect(body).not.toBeNull();

    // The children are stacked, so the card body must not become a row.
    expect(body!.layoutMode).not.toBe("HORIZONTAL");

    // And the content must still fit the card instead of overflowing sideways.
    const kids = (body!.children as Record<string, unknown>[]) ?? [];
    expect(kids.length).toBe(5);
    for (const k of kids) {
      expect(Number(k.width)).toBeLessThanOrEqual(Number(body!.width));
    }
  });

  it("matches the plain card: one floated icon must not change the layout mode", () => {
    const withIcon = convertW2WToWireframe(page([productCard(true)]) as never, { layoutMode: "autoLayout" });
    const without = convertW2WToWireframe(page([productCard(false)]) as never, { layoutMode: "autoLayout" });

    expect(findByClass(withIcon, "ut2-gl__body")!.layoutMode).toBe(
      findByClass(without, "ut2-gl__body")!.layoutMode,
    );
  });

  it("still infers HORIZONTAL when a float and its label share one line (telex.ge navbar)", () => {
    const navItem = makeFrame({
      tag: "a", classList: ["ac-title"], x: 0, y: 100, width: 180, height: 24,
      styles: { display: "block" },
      children: [
        makeFrame({ tag: "i", classList: ["ac-icon"], x: 0, y: 102, width: 20, height: 20,
          styles: { display: "block", cssFloat: "left" } }),
        makeFrame({ tag: "span", classList: ["ac-label"], x: 26, y: 100, width: 154, height: 24,
          styles: { display: "inline-block" } }),
      ],
    });

    const root = convertW2WToWireframe(page([navItem]) as never, { layoutMode: "autoLayout" });
    expect(findByClass(root, "ac-title")!.layoutMode).toBe("HORIZONTAL");
  });
});
