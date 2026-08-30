/**
 * `clip-path: inset(...)` end to end — capture → WireframeNode → Figma frame.
 *
 * `clipPath` reaches us in the payload (it is in the captured property list)
 * but nothing on the base render path read it: the only parser lived in the
 * hover-diff applier. A `clip-path` that hides an element therefore imported as
 * a full, visible rectangle — 91 of them on stripe.com alone — and a
 * `clip-path` that rounds an element's corners imported square.
 *
 * No vector mask is created. An `inset()` is an axis-aligned rounded rectangle,
 * which Figma already expresses with `clipsContent` + `cornerRadius`; a mask
 * would be a sibling node that takes an auto-layout slot and disturbs the child
 * stacking order the renderer sorts so carefully.
 */
import { describe, it, expect, vi } from "vitest";

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
  clipsContent: boolean;
  cornerRadius: number | symbol;
  topLeftRadius: number;
  topRightRadius: number;
  bottomRightRadius: number;
  bottomLeftRadius: number;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

/** When `poisonCornerRadius` is set, the `cornerRadius` setter throws — the
 *  stand-in for any Figma API failure while applying a clip. */
let poisonCornerRadius = false;

function createMockFrameNode(): MockNode {
  const node = {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], children: [],
    layoutMode: "NONE",
    clipsContent: false,
    topLeftRadius: 0, topRightRadius: 0,
    bottomRightRadius: 0, bottomLeftRadius: 0,
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) { this._pluginData[key] = value; },
    getPluginData(key: string) { return this._pluginData[key] ?? ""; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: MockNode) { this.children.push(child); },
  } as unknown as MockNode;

  let radius: number | symbol = 0;
  Object.defineProperty(node, "cornerRadius", {
    get: () => radius,
    set: (value: number) => {
      if (poisonCornerRadius) throw new Error("in set_cornerRadius: simulated failure");
      radius = value;
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

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function text(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0, y: 0, width: 260, height: 66,
    quad: [0, 0, 260, 0, 260, 66, 0, 66],
    value,
    ...overrides,
  };
}

/** border-radius as a capture reports it: one computed value per corner. */
function cssRadius(value: string): Record<string, string> {
  return {
    borderTopLeftRadius: value,
    borderTopRightRadius: value,
    borderBottomRightRadius: value,
    borderBottomLeftRadius: value,
  };
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

/** Every class name / tag in the converted tree. */
function names(node: WireframeNode, acc: string[] = []): string[] {
  acc.push(node.className || node.tag || node.name);
  for (const c of node.children || []) names(c, acc);
  return acc;
}

/** Every piece of text content in the converted tree. */
function texts(node: WireframeNode, acc: string[] = []): string[] {
  if (node.textContent) acc.push(node.textContent);
  for (const c of node.children || []) texts(c, acc);
  return acc;
}

function findByClass(node: WireframeNode, cls: string): WireframeNode | null {
  if (node.className === cls) return node;
  for (const c of node.children || []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Converter — the value reaches WireframeNode, and a total clip drops the node
// ---------------------------------------------------------------------------

describe("convertW2WToWireframe — clip-path carried onto WireframeNode", () => {
  it("carries a supported clip-path through", () => {
    const root = frame({
      children: [frame({ classList: ["card"], styles: { display: "block", clipPath: "inset(0px round 6px)" } })],
    });
    expect(findByClass(convertW2WToWireframe(root as never), "card")?.clipPath)
      .toBe("inset(0px round 6px)");
  });

  it("leaves clipPath undefined for `none`", () => {
    const root = frame({
      children: [frame({ classList: ["card"], styles: { display: "block", clipPath: "none" } })],
    });
    expect(findByClass(convertW2WToWireframe(root as never), "card")?.clipPath).toBeUndefined();
  });
});

describe("convertW2WToWireframe — a fully clipped element paints nothing", () => {
  const HIDDEN = { display: "block", clipPath: "inset(0px 0px 100%)" };

  it("drops it, and its text, in the default interaction mode", () => {
    const root = frame({
      children: [
        frame({ classList: ["clipped-away"], styles: HIDDEN, children: [text("Ghost copy")] }),
        frame({ classList: ["real"], width: 200, height: 100 }),
      ],
    });
    const converted = convertW2WToWireframe(root as never);
    expect(names(converted).join(" ")).not.toContain("clipped-away");
    expect(texts(converted).join(" ")).not.toContain("Ghost copy");
    expect(names(converted).join(" ")).toContain("real");
  });

  it("keeps it, marked hidden, in variants mode", () => {
    const root = frame({
      children: [frame({ classList: ["clipped-away"], styles: HIDDEN, children: [text("Ghost copy")] })],
    });
    const converted = convertW2WToWireframe(root as never, { interactionMode: "variants" });
    expect(findByClass(converted, "clipped-away")?.isHiddenInDefault).toBe(true);
  });

  it("keeps it when it wraps a position:fixed descendant", () => {
    // A fixed child is laid out against the viewport and escapes any ancestor
    // clip — the same escape hatch isScreenReaderOnlyBox already honours.
    const root = frame({
      children: [
        frame({
          classList: ["clipped-away"],
          styles: HIDDEN,
          children: [frame({ classList: ["fixed-nav"], styles: { display: "block", position: "fixed" }, height: 60 })],
        }),
      ],
    });
    expect(names(convertW2WToWireframe(root as never)).join(" ")).toContain("fixed-nav");
  });

  it("does not drop a node whose clip-path we cannot parse", () => {
    const root = frame({
      children: [
        frame({
          classList: ["diagonal-hero"],
          styles: { display: "block", clipPath: "polygon(0 0, 100% 0, 100% 80%, 0 100%)" },
          children: [text("Hero headline")],
        }),
      ],
    });
    const converted = convertW2WToWireframe(root as never);
    expect(names(converted).join(" ")).toContain("diagonal-hero");
    expect(texts(converted).join(" ")).toContain("Hero headline");
  });
});

// ---------------------------------------------------------------------------
// Renderer — clipsContent and cornerRadius, and never a lost node
// ---------------------------------------------------------------------------

async function render(styles: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const wf = convertW2WToWireframe(
    frame({
      children: [frame({ classList: ["target"], width: 200, height: 120, styles: { display: "block", ...styles }, ...extra })],
    }) as never,
    { layoutMode: "autoLayout", htmlLayerNames: true },
  ) as WireframeNode;
  const rendered = (await createNodeInFigma(wf, mockContext(), 0)) as unknown as MockNode;
  return { wf, rendered };
}

describe("createNodeInFigma — clip-path: inset()", () => {
  it("applies `round` as the frame's corner radius", async () => {
    const { rendered } = await render({ clipPath: "inset(0px round 6px)" });
    expect(rendered.children[0].cornerRadius).toBe(6);
  });

  it("takes the tighter of the CSS radius and the clip radius", async () => {
    // Both clips apply in CSS; their intersection is the smaller rounding.
    const { rendered } = await render({ clipPath: "inset(0px round 4px)", ...cssRadius("10px") });
    expect(rendered.children[0].cornerRadius).toBe(4);
  });

  it("keeps the CSS radius when it is already the tighter one", async () => {
    const { rendered } = await render({ clipPath: "inset(0px round 12px)", ...cssRadius("3px") });
    expect(rendered.children[0].cornerRadius).toBe(3);
  });

  it("clips content when the inset actually insets", async () => {
    const { rendered } = await render({ clipPath: "inset(6px 3.5503px round 5px)" });
    expect(rendered.children[0].clipsContent).toBe(true);
  });

  it("never turns clipping off — overflow:hidden survives a no-op clip-path", async () => {
    const { rendered } = await render({
      clipPath: "inset(0px -60px)",
      overflow: "hidden", overflowX: "hidden", overflowY: "hidden",
    });
    expect(rendered.children[0].clipsContent).toBe(true);
  });

  it("leaves a no-op clip-path alone", async () => {
    const { rendered } = await render({ clipPath: "inset(0px 0px 0%)" });
    expect(rendered.children[0].clipsContent).toBe(false);
    expect(rendered.children[0].cornerRadius).toBe(0);
  });
});

describe("createNodeInFigma — a failed clip degrades to an unclipped node", () => {
  it("keeps the node when the clip-path value is unparseable", async () => {
    const { rendered } = await render({ clipPath: "inset(calc(1px + 2%))" });
    const child = rendered.children[0];
    expect(child).toBeDefined();
    expect(child.width).toBe(200);
    expect(child.height).toBe(120);
    expect(child.clipsContent).toBe(false);
  });

  it("keeps the node when Figma rejects the corner radius", async () => {
    poisonCornerRadius = true;
    try {
      const { rendered } = await render({ clipPath: "inset(0px round 6px)" });
      // The whole point: an unmasked, unrounded rectangle — not a missing one.
      expect(rendered.children).toHaveLength(1);
      expect(rendered.children[0].width).toBe(200);
    } finally {
      poisonCornerRadius = false;
    }
  });
});
