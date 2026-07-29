/**
 * `layoutWrap = WRAP` is only legal on HORIZONTAL auto-layout frames — Figma
 * throws otherwise, and the throw is swallowed by the parent's per-child
 * try/catch, silently deleting the whole subtree.
 *
 * telex.ge hits this on `div#ab__fn-first-level-224`: the stylesheet says
 * `display: flex; flex-wrap: wrap`, but owl-carousel overrides it with an
 * inline `display: block`. The computed styles therefore carry
 * `display: block` (→ layoutMode NONE → VERTICAL frame in autoLayout mode)
 * together with a leftover `flex-wrap: wrap` — and the WRAP setter blew up,
 * leaving `div.ab-fn-parent` empty in the imported wireframe. Eleven subtrees
 * were lost to this in a single telex.ge import.
 */
import { describe, it, expect, vi } from "vitest";

// Figma API mock that enforces the real layoutWrap constraint.
interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  children: MockNode[];
  layoutMode: string;
  layoutWrap?: string;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function createMockFrameNode(): MockNode {
  const node = {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], children: [],
    layoutMode: "NONE",
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) { this._pluginData[key] = value; },
    getPluginData(key: string) { return this._pluginData[key] ?? ""; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: MockNode) { this.children.push(child); },
  } as MockNode;

  // Mirror Figma: setting WRAP on a non-HORIZONTAL frame throws.
  let wrap = "NO_WRAP";
  Object.defineProperty(node, "layoutWrap", {
    get: () => wrap,
    set: (value: string) => {
      if (value === "WRAP" && node.layoutMode !== "HORIZONTAL") {
        throw new Error(
          "in set_layoutWrap: Can only set layoutWrap = WRAP on nodes with layoutMode === HORIZONTAL",
        );
      }
      wrap = value;
    },
  });

  return node;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", appendChild() {} })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 1200, height: 240,
    quad: [0, 0, 1200, 0, 1200, 240, 0, 240],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

/**
 * `display: block` + `flex-wrap: wrap` — the computed-style combination a
 * flex container produces once JS overrides its display inline.
 */
function blockWithLeftoverFlexWrap(): Record<string, unknown> {
  return makeFrame({
    classList: ["ab-fn-parent"],
    children: [
      makeFrame({
        attr: { id: "ab__fn-first-level-224" },
        classList: ["ab-fn-first-level"],
        styles: { display: "block", flexWrap: "wrap", position: "relative" },
        children: [
          makeFrame({
            classList: ["carousel-item"],
            x: 0, y: 0, width: 200, height: 240,
            styles: { display: "block" },
          }),
        ],
      }),
    ],
  });
}

function mockContext(): RenderContext {
  return {
    fontsToLoad: new Set(),
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    pluginFont: { family: "Inter", weight: 400 },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

function names(node: { name: string; children?: unknown[] }): string[] {
  const out: string[] = [node.name];
  for (const c of (node.children ?? []) as Array<{ name: string; children?: unknown[] }>) {
    out.push(...names(c));
  }
  return out;
}

describe("flex-wrap guard (nodes.ts)", () => {
  it("keeps the subtree when a block container carries a leftover flex-wrap", async () => {
    const wf = convertW2WToWireframe(blockWithLeftoverFlexWrap() as never, {
      layoutMode: "autoLayout",
    }) as WireframeNode;

    // Precondition: the converter really does emit NONE + wrap here.
    const scroller = wf.children![0];
    expect(scroller.layoutMode).toBe("NONE");
    expect(scroller.flexWrap).toBe("wrap");

    const rendered = (await createNodeInFigma(wf, mockContext(), 0)) as unknown as {
      name: string;
      children: unknown[];
    } | null;

    expect(rendered).not.toBeNull();
    const flat = names(rendered as never);
    expect(flat.some((n) => n.includes("ab__fn-first-level-224"))).toBe(true);
    expect(flat.some((n) => n.includes("carousel-item"))).toBe(true);
  });

  it("still applies WRAP on a horizontal flex container", async () => {
    const tree = makeFrame({
      classList: ["row"],
      styles: { display: "flex", flexDirection: "row", flexWrap: "wrap" },
      children: [
        makeFrame({ classList: ["cell"], x: 0, y: 0, width: 200, height: 240, styles: { display: "block" } }),
      ],
    });
    const wf = convertW2WToWireframe(tree as never, { layoutMode: "autoLayout" }) as WireframeNode;
    expect(wf.layoutMode).toBe("HORIZONTAL");
    expect(wf.flexWrap).toBe("wrap");

    const rendered = (await createNodeInFigma(wf, mockContext(), 0)) as unknown as {
      layoutWrap: string;
      children: unknown[];
    } | null;

    expect(rendered).not.toBeNull();
    expect(rendered!.layoutWrap).toBe("WRAP");
    expect(rendered!.children.length).toBe(1);
  });

  it("places column-wrap children absolutely instead of stacking them", async () => {
    // telex.ge "ლიტერატურული ბლოგი": `flex-direction: column; flex-wrap: wrap`
    // lays one tall post beside a 3×2 grid of small ones. Figma cannot express
    // column-wrap, so the children must keep their captured 2-D coordinates
    // rather than collapse into a single auto-layout column.
    const cell = (x: number, y: number, w: number, h: number, cls: string) =>
      makeFrame({ classList: [cls], x, y, width: w, height: h, styles: { display: "block" } });

    const tree = makeFrame({
      classList: ["ut2-blog__recent-posts"],
      x: 0, y: 0, width: 1210, height: 460,
      styles: { display: "flex", flexDirection: "column", flexWrap: "wrap" },
      children: [
        cell(0, 0, 484, 460, "post-big"),
        cell(484, 0, 242, 230, "post-a"),
        cell(484, 230, 242, 230, "post-b"),
        cell(726, 0, 242, 230, "post-c"),
        cell(726, 230, 242, 230, "post-d"),
        cell(968, 0, 242, 230, "post-e"),
        cell(968, 230, 242, 230, "post-f"),
      ],
    });

    const wf = convertW2WToWireframe(tree as never, { layoutMode: "autoLayout" }) as WireframeNode;
    expect(wf.layoutMode).toBe("VERTICAL");
    expect(wf.flexWrap).toBe("wrap");

    const rendered = (await createNodeInFigma(wf, mockContext(), 0)) as unknown as {
      layoutMode: string;
      children: Array<{ x: number; y: number }>;
    } | null;

    expect(rendered).not.toBeNull();
    expect(rendered!.children.length).toBe(7);
    // Absolute placement — the 2-D grid survives.
    const coords = rendered!.children.map((c) => `${c.x},${c.y}`);
    expect(coords).toEqual([
      "0,0", "484,0", "484,230", "726,0", "726,230", "968,0", "968,230",
    ]);
  });
});
