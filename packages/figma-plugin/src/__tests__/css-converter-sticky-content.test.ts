/**
 * Only a sticky element at the top of the page is a header worth pinning.
 *
 * The renderer promotes every vertically-sticky element to a Figma fixed child
 * of the root and pins it at its CSS `top` — right for a sticky nav, wrong for
 * sticky CONTENT further down: notion.com's customer-logo wall (sticky at page
 * y≈1328) and vaayu.tech's 900px side-scroll sections (y≈810+) all landed at
 * the very top of the frame, covering the hero, and left holes where they
 * belonged. A static wireframe shows the page at scroll 0, where such an
 * element sits in its own flow slot — so that is where it stays.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function frame(tag: string, y: number, height: number, styles: Record<string, string>, children: unknown[] = []) {
  return {
    type: "FRAME", tag, classList: [tag], attr: {},
    x: 0, y, width: 1440, height,
    quad: [0, y, 1440, y, 1440, y + height, 0, y + height],
    styles: { display: "block", ...styles },
    children,
  };
}

function convert(sticky: ReturnType<typeof frame>): WireframeNode {
  const main = frame("main", 0, 4000, {}, [frame("section", 0, 1200, {}), sticky]);
  const root = convertW2WToWireframe(main as never, { layoutMode: "autoLayout" });
  const find = (n: WireframeNode): WireframeNode | null =>
    n.tag === sticky.tag ? n : (n.children ?? []).map(find).find(Boolean) ?? null;
  return find(root)!;
}

describe("sticky promotion is for page headers", () => {
  it("a sticky header at the top of the page stays sticky", () => {
    const header = convert(frame("header", 0, 64, { position: "sticky", top: "0px" }));
    expect(header.position).toBe("sticky");
    expect(header.cssTop).toBe(0);
  });

  it("sticky content further down the page stays in flow (notion logo wall)", () => {
    const wall = convert(frame("aside", 1328, 96, { position: "sticky", top: "64px" }));
    expect(wall.position).not.toBe("sticky");
  });

  it("a full-screen sticky scene stays in flow (vaayu side-scroll)", () => {
    const scene = convert(frame("article", 810, 900, { position: "sticky", top: "0px" }));
    expect(scene.position).not.toBe("sticky");
  });
});

/**
 * notion.com logo wall (owner's dump 2026-09-17): `position: sticky;
 * bottom: -48px` inside the hero. At scroll 0 the browser pins it to the
 * viewport bottom (captured y 852 — over the hero screenshot); in the page it
 * sits right after "The most ambitious companies run on Notion." (y 1265). A
 * static wireframe needs that natural slot: the bottom of the previous in-flow
 * sibling plus the margins between them.
 */
describe("bottom-sticky content takes its natural flow slot", () => {
  function hero(stickyStyles: Record<string, string>) {
    const p = { ...frame("p", 1245, 20, { marginTop: "32px" }) };
    const sticky = frame("aside", 852, 96, stickyStyles);
    const sentinel = frame("i", 1328, 1, { position: "relative", bottom: "48px", visibility: "hidden" });
    const wrapper = frame("span", 0, 0, { position: "relative", display: "contents" }, [sticky, sentinel]);
    const grid = frame("section", 64, 1149, {});
    return frame("header", 64, 1329, { paddingBottom: "16px" }, [grid, p, wrapper]);
  }

  function findTag(root: WireframeNode, tag: string): WireframeNode | null {
    if (root.tag === tag) return root;
    for (const c of root.children ?? []) { const h = findTag(c, tag); if (h) return h; }
    return null;
  }

  it("places the logo wall after the paragraph, not at the viewport bottom", () => {
    const main = frame("main", 0, 4000, {}, [hero({ position: "sticky", top: "auto", bottom: "-48px" })]);
    const root = convertW2WToWireframe(main as never, { layoutMode: "absolute" });
    const header = findTag(root, "header")!;
    const wall = findTag(root, "aside")!;
    // relative to the header (page y 64): 1265 - 64
    expect(wall.y).toBe(1265 - 64);
    expect(header).toBeTruthy();
  });

  it("a top-sticky element keeps its captured position", () => {
    const main = frame("main", 0, 4000, {}, [hero({ position: "sticky", top: "64px", bottom: "auto" })]);
    const root = convertW2WToWireframe(main as never, { layoutMode: "absolute" });
    expect(findTag(root, "aside")!.y).toBe(852 - 64);
  });
});
