/**
 * Tests for z-index and stacking order in Figma rendering pipeline:
 * 1. sortChildrenForStacking helper in nodes.ts
 * 2. zIndex mapping in css-converter.ts
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { sortChildrenForStacking } from "../rendering/nodes";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal W2W frame node for css-converter tests */
function makeW2WFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

/** Minimal WireframeNode stub */
function makeNode(name: string, overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 100, height: 50,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Arial",
    textAlign: "left",
    lineHeight: 1.2,
    letterSpacing: 0,
    children: [],
    isPlaceholder: false,
    ...overrides,
  } as WireframeNode;
}

// ---------------------------------------------------------------------------
// css-converter: zIndex mapping
// ---------------------------------------------------------------------------

describe("css-converter: zIndex mapping", () => {
  it("maps numeric zIndex from W2W styles", () => {
    const node = makeW2WFrame({ styles: { zIndex: "10" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.zIndex).toBe(10);
  });

  it("maps string zIndex from W2W styles", () => {
    const node = makeW2WFrame({ styles: { zIndex: "999" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.zIndex).toBe(999);
  });

  it("omits zIndex when 'auto'", () => {
    const node = makeW2WFrame({ styles: { zIndex: "auto" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.zIndex).toBeUndefined();
  });

  it("omits zIndex when not present", () => {
    const node = makeW2WFrame({ styles: {} });
    const result = convertW2WToWireframe(node as any);
    expect(result.zIndex).toBeUndefined();
  });

  it("handles negative zIndex", () => {
    const node = makeW2WFrame({ styles: { zIndex: "-1" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.zIndex).toBe(-1);
  });

  it("handles zIndex: 0 (explicit zero)", () => {
    const node = makeW2WFrame({ styles: { zIndex: "0" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.zIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sortChildrenForStacking (replaces sortByZIndex)
// ---------------------------------------------------------------------------

describe("sortChildrenForStacking", () => {
  // --- z-index sorting (only in absolute/NONE mode) ---

  it("sorts by z-index in NONE (absolute) mode", () => {
    const children = [makeNode("high", { zIndex: 10 }), makeNode("low", { zIndex: 1 })];
    const sorted = sortChildrenForStacking(children, "NONE");
    expect(sorted.map(c => c.name)).toEqual(["low", "high"]);
  });

  it("does NOT z-index sort in VERTICAL auto-layout (preserves DOM order)", () => {
    const children = [
      makeNode("copy-wrapper", { zIndex: 2 }),  // text first in DOM
      makeNode("ctas"),                           // buttons second in DOM
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    // DOM order preserved — z-index doesn't affect layout flow
    expect(sorted.map(c => c.name)).toEqual(["copy-wrapper", "ctas"]);
  });

  it("does NOT z-index sort in HORIZONTAL auto-layout", () => {
    const children = [makeNode("a", { zIndex: 10 }), makeNode("b", { zIndex: 1 })];
    const sorted = sortChildrenForStacking(children, "HORIZONTAL");
    expect(sorted.map(c => c.name)).toEqual(["a", "b"]);
  });

  it("returns same array when no z-index and no abs images", () => {
    const children = [makeNode("a"), makeNode("b")];
    const sorted = sortChildrenForStacking(children);
    expect(sorted).toBe(children);
  });

  it("stable sort: equal z-index preserves order in NONE mode", () => {
    const children = [makeNode("first", { zIndex: 5 }), makeNode("second", { zIndex: 5 })];
    const sorted = sortChildrenForStacking(children, "NONE");
    expect(sorted.map(c => c.name)).toEqual(["first", "second"]);
  });

  // --- Background image reordering (works in ANY layout mode) ---

  it("apple.com pattern: abs image-wrapper moves before content", () => {
    const children = [
      makeNode("tile-content", { position: "relative" }),
      makeNode("tile-image-wrapper", {
        position: "absolute",
        children: [
          makeNode("picture", {
            children: [makeNode("img", { type: "placeholder", isPlaceholder: true })],
          }),
        ],
      }),
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    expect(sorted.map(c => c.name)).toEqual(["tile-image-wrapper", "tile-content"]);
  });

  it("abs placeholder moves to front even in HORIZONTAL layout", () => {
    const children = [
      makeNode("text", { position: "relative" }),
      makeNode("img", { position: "absolute", type: "placeholder", isPlaceholder: true }),
    ];
    const sorted = sortChildrenForStacking(children, "HORIZONTAL");
    expect(sorted.map(c => c.name)).toEqual(["img", "text"]);
  });

  it("abs element WITH text does NOT get moved", () => {
    const children = [
      makeNode("content", { position: "relative" }),
      makeNode("abs-with-text", {
        position: "absolute",
        children: [makeNode("text-child", { type: "text", textContent: "Hello" })],
      }),
    ];
    const sorted = sortChildrenForStacking(children);
    expect(sorted.map(c => c.name)).toEqual(["content", "abs-with-text"]);
  });

  it("all abs + image-only → no reorder (no content to be above)", () => {
    const children = [
      makeNode("img1", { position: "absolute", type: "placeholder", isPlaceholder: true }),
      makeNode("img2", { position: "absolute", type: "placeholder", isPlaceholder: true }),
    ];
    const sorted = sortChildrenForStacking(children);
    expect(sorted).toBe(children);
  });

  // --- The hoist needs in-flow content to sit behind ---

  /**
   * stripe.com bento card: EVERY child is absolutely positioned. DOM order is
   * [__border (opaque, no children), __inner (holds the artwork)], and the
   * browser paints them in exactly that order.
   *
   * Hoisting `__inner` — it is image-only, so Step 1 matched it — put the
   * opaque `__border` on top and buried the artwork under a flat #E5EDF5 box.
   * With no in-flow sibling there is nothing for a background layer to sit
   * behind, so DOM order is the only correct paint order.
   */
  it("absolute-only siblings keep DOM order (nothing to sit behind)", () => {
    const children = [
      makeNode("border", { position: "absolute" }),
      makeNode("inner", {
        position: "absolute",
        children: [makeNode("img", { type: "placeholder", isPlaceholder: true })],
      }),
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    expect(sorted.map(c => c.name)).toEqual(["border", "inner"]);
  });

  it("one in-flow sibling is enough to re-enable the hoist", () => {
    const children = [
      makeNode("border", { position: "absolute" }),
      makeNode("caption", { position: "relative" }),
      makeNode("inner", {
        position: "absolute",
        children: [makeNode("img", { type: "placeholder", isPlaceholder: true })],
      }),
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    expect(sorted.map(c => c.name)).toEqual(["inner", "border", "caption"]);
  });

  /**
   * notion.com bento card (user report 2026-09-17): an in-flow <picture> (the
   * card's base screenshot) followed by absolute image layers — the chart and
   * the "What are our biggest opportunities" pill — that CSS paints ON TOP.
   * The hoist exists to keep in-flow COPY above a background image; when the
   * in-flow sibling is itself only an image there is no copy to protect, and
   * hoisting buried both layers under the screenshot.
   */
  it("an image-only in-flow sibling does not trigger the hoist", () => {
    const img = () => makeNode("img", { type: "placeholder", isPlaceholder: true });
    const children = [
      makeNode("picture", { children: [img()] }),
      makeNode("chart-layer", { position: "absolute", children: [img()] }),
      makeNode("prompt-layer", { position: "absolute", children: [img()] }),
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    expect(sorted.map(c => c.name)).toEqual(["picture", "chart-layer", "prompt-layer"]);
  });

  it("a fixed sibling is out of flow too, so it does not re-enable the hoist", () => {
    const children = [
      makeNode("overlay", { position: "fixed" }),
      makeNode("inner", {
        position: "absolute",
        children: [makeNode("img", { type: "placeholder", isPlaceholder: true })],
      }),
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    expect(sorted.map(c => c.name)).toEqual(["overlay", "inner"]);
  });

  // --- Combined: abs images + z-index in NONE mode ---

  it("combined: abs images move first, then z-index sorting in NONE mode", () => {
    const children = [
      makeNode("content-high-z", { position: "relative", zIndex: 10 }),
      makeNode("content-low-z", { position: "static", zIndex: 1 }),
      makeNode("bg-image", { position: "absolute", type: "placeholder", isPlaceholder: true }),
    ];
    const sorted = sortChildrenForStacking(children, "NONE");
    expect(sorted.map(c => c.name)).toEqual(["bg-image", "content-low-z", "content-high-z"]);
  });

  it("combined: abs images move first, NO z-index sort in VERTICAL mode", () => {
    const children = [
      makeNode("content-high-z", { position: "relative", zIndex: 10 }),
      makeNode("content-low-z", { position: "static", zIndex: 1 }),
      makeNode("bg-image", { position: "absolute", type: "placeholder", isPlaceholder: true }),
    ];
    const sorted = sortChildrenForStacking(children, "VERTICAL");
    // bg-image moves first, but content keeps DOM order (no z-index sort)
    expect(sorted.map(c => c.name)).toEqual(["bg-image", "content-high-z", "content-low-z"]);
  });
});
