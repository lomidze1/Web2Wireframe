/**
 * Regression: `position: fixed` elements must NOT get a flow spacer.
 *
 * FIX E (`insertFixedSpacer`) drops a same-size transparent frame into the
 * slot a promoted element used to occupy, so siblings below don't slide up.
 * That is right for `position: sticky` — a sticky box DOES take space in the
 * document flow — and wrong for `position: fixed`, which is out of flow and
 * takes none.
 *
 * glinc.io (1440px): `body::before` and `body::after` are decorative
 * `position: fixed; inset: 0` overlays, captured at 1440x900 each. Both were
 * promoted to root-level fixed children AND left a 900px spacer behind, so
 * the flow inside `body` started 1800px late. With the sticky header's
 * legitimate 69px spacer that pushed every section down 969px: the top of the
 * frame rendered as an empty band of the body's teal background, and the
 * bottom of the page overflowed `body`'s fixed 3682.83px height.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks
// ============================================================================

interface PluginDataStore {
  [key: string]: string;
}

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  children: MockNode[];
  parent: MockNode | null;
  layoutMode: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  layoutPositioning?: string;
  visible?: boolean;
  clipsContent?: boolean;
  overflowDirection?: string;
  numberOfFixedChildren?: number;
  opacity?: number;
  constraints?: unknown;
  _pluginData: PluginDataStore;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  insertChild(index: number, child: MockNode): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  setFillStyleIdAsync(id: string): Promise<void>;
  setEffectStyleIdAsync(id: string): Promise<void>;
}

function createMockFrameNode(): MockNode {
  const node = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [] as unknown[],
    strokes: [] as unknown[],
    effects: [] as unknown[],
    children: [] as MockNode[],
    parent: null as MockNode | null,
    layoutMode: "NONE",
    visible: true,
    opacity: 1,
    constraints: { horizontal: "MIN", vertical: "MIN" },
    _pluginData: {} as PluginDataStore,
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockNode) {
      if (child.parent && child.parent !== this) {
        const i = child.parent.children.indexOf(child);
        if (i >= 0) child.parent.children.splice(i, 1);
      }
      this.children.push(child);
      child.parent = this as unknown as MockNode;
    },
    insertChild(index: number, child: MockNode) {
      if (child.parent && child.parent !== this) {
        const i = child.parent.children.indexOf(child);
        if (i >= 0) child.parent.children.splice(i, 1);
      }
      this.children.splice(index, 0, child);
      child.parent = this as unknown as MockNode;
    },
    setPluginData(key: string, value: string) {
      this._pluginData[key] = value;
    },
    getPluginData(key: string) {
      return this._pluginData[key] ?? "";
    },
    async setFillStyleIdAsync() { /* noop */ },
    async setEffectStyleIdAsync() { /* noop */ },
  } as unknown as MockNode;
  return node;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT" })),
  createRectangle: vi.fn(() => createMockFrameNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  viewport: { center: { x: 0, y: 0 } },
  mixed: Symbol("figma.mixed"),
});

// Import AFTER the figma mock
import { convertW2WToWireframe } from "../rendering/css-converter";
import { createWireframeFrame } from "../rendering/nodes";
import type { RenderContext, WireframeFrame } from "../types";

// ============================================================================
// Fixtures — the glinc.io body shape, trimmed to what the defect needs
// ============================================================================

function box(
  tag: string,
  classList: string[],
  rect: [number, number, number, number],
  styles: Record<string, unknown>,
): Record<string, unknown> {
  const [x, y, width, height] = rect;
  return {
    type: "FRAME",
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    tag,
    classList,
    attr: {},
    styles: { display: "block", ...styles },
    children: [],
  };
}

/** `<html>` → `<body>` → [fixed ::before, sticky header, content, fixed ::after] */
function makeGlincBody(): Record<string, unknown> {
  return {
    ...box("html", [], [0, 0, 1440, 3682.83], {}),
    children: [
      {
        ...box("body", [], [0, 0, 1440, 3682.83], {
          backgroundColor: "rgb(14, 58, 63)",
        }),
        children: [
          // body::before — decorative, position: fixed, full viewport
          box("span", ["__w2w-pseudo-before"], [0, 0, 1440, 900], {
            position: "fixed",
            top: "0px",
            left: "0px",
          }),
          // sticky site header — really occupies 69px of flow
          box("header", ["site-header"], [0, 0, 1440, 69], {
            display: "flex",
            position: "sticky",
            top: "0px",
          }),
          // page content
          box("div", ["main"], [0, 69, 1440, 3488.83], {}),
          // body::after — decorative, position: fixed, full viewport
          box("span", ["__w2w-pseudo-after"], [0, 0, 1440, 900], {
            position: "fixed",
            top: "0px",
            left: "0px",
          }),
        ],
      },
    ],
  };
}

const mockContext = {
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
  fontFamily: "Inter",
  pluginColors: {
    text: "#000",
    background: "#FFF",
    secondary: "#888",
    surface: "#EEE",
    accent: "#00F",
  },
  colorStyleMap: new Map(),
  textStyleMap: new Map(),
  variableValueMap: new Map(),
  assets: {},

} as unknown as RenderContext;

async function renderGlinc(): Promise<MockNode> {

  const tree = convertW2WToWireframe(makeGlincBody() as any, {
    layoutMode: "autoLayout",
    interactionMode: "none",
    // htmlLayerNames: spacer/promotion assertions trace subtrees by their
    // DOM-derived names ("header", "__w2w-pseudo-*") after render, where
    // only `name` survives on the SceneNode.
    htmlLayerNames: true,
  });
  const frameData = {
    viewportWidth: 1440,
    viewportHeight: 900,
    tree,
    assets: {},
  } as unknown as WireframeFrame;
  const root = await createWireframeFrame(
    frameData,
    "https://glinc.io",
    mockContext,
    0,
  );
  return root as unknown as MockNode;
}

/** Every spacer FIX E inserted, anywhere in the tree. */
function collectSpacers(node: MockNode): MockNode[] {
  const out: MockNode[] = [];
  const walk = (n: MockNode): void => {
    if (n.getPluginData?.("w2w_sticky_spacer") === "1") out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(node);
  return out;
}

// ============================================================================
// Tests
// ============================================================================

describe("out-of-flow fixed elements get no flow spacer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts no spacer for a position:fixed full-viewport overlay", async () => {
    const root = await renderGlinc();
    const spacers = collectSpacers(root);

    const pseudoSpacers = spacers.filter((s) =>
      s.name.includes("__w2w-pseudo"),
    );
    expect(pseudoSpacers).toEqual([]);
  });

  it("still inserts a spacer for the sticky header it replaced", async () => {
    const root = await renderGlinc();
    const spacers = collectSpacers(root);

    expect(spacers).toHaveLength(1);
    expect(spacers[0].name).toContain("header");
    expect(spacers[0].height).toBe(69);
  });

  it("leaves no phantom flow height above the page content", async () => {
    const root = await renderGlinc();
    const spacers = collectSpacers(root);
    const phantomHeight = spacers.reduce((sum, s) => sum + s.height, 0);

    // Only the sticky header's own 69px — not 69 + 900 + 900.
    expect(phantomHeight).toBe(69);
  });

  it("still promotes every fixed/sticky element to a root fixed child", async () => {
    const root = await renderGlinc();

    // 2 decorative overlays + 1 sticky header.
    expect(root.numberOfFixedChildren).toBe(3);
    const promoted = root.children.slice(-3).map((c) => c.name);
    expect(promoted.some((n) => n.includes("__w2w-pseudo-before"))).toBe(true);
    expect(promoted.some((n) => n.includes("__w2w-pseudo-after"))).toBe(true);
    expect(promoted.some((n) => n.includes("header"))).toBe(true);
  });
});
