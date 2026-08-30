/**
 * Per-frame prototype scroll direction (h2d parity — MASTER-REPORT §9 V4).
 *
 * h2d sets `overflowDirection` on EVERY frame from that element's own CSS
 * overflow. We used to set it exactly once, hardcoded to VERTICAL on the import
 * root, so a horizontal carousel imported with its content intact but could not
 * be scrolled sideways in Presentation mode.
 *
 * The blocker was `parseOverflow`, which collapses `overflow-x`/`overflow-y`
 * into one most-restrictive-wins scalar — by render time "which axis scrolls"
 * was gone, and `overflow-x: auto; overflow-y: hidden` was indistinguishable
 * from its opposite. `WireframeNode.scrollDirection` carries the axes through
 * alongside that scalar, which still drives `clipsContent` and the sr-only
 * detection and is deliberately left untouched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks
// ============================================================================

interface MockNode {
  type: string;
  name: string;
  width: number;
  height: number;
  children: MockNode[];
  parent: MockNode | null;
  clipsContent?: boolean;
  overflowDirection?: string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  insertChild(index: number, child: MockNode): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
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
    _pluginData: {} as Record<string, string>,
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
import type { RenderContext, WireframeFrame, WireframeNode } from "../types";

// ============================================================================
// Fixtures
// ============================================================================

function box(
  tag: string,
  classList: string[],
  rect: [number, number, number, number],
  styles: Record<string, unknown>,
  children: Record<string, unknown>[] = [],
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
    children,
  };
}

/**
 * A scrollable container: painted (so the simplify pass keeps it) and holding a
 * painted child wider/taller than itself, the way a real carousel track is.
 */
function scroller(
  cls: string,
  y: number,
  overflowStyles: Record<string, unknown>,
): Record<string, unknown> {
  return box("div", [cls], [0, y, 1200, 300], {
    backgroundColor: "rgb(240, 240, 240)",
    ...overflowStyles,
  }, [
    box("div", [`${cls}-track`], [0, y, 3000, 280], {
      backgroundColor: "rgb(10, 20, 30)",
    }),
  ]);
}

/** `<html>` → `<body>` → the given sections. */
function page(
  sections: Record<string, unknown>[],
  htmlStyles: Record<string, unknown> = {},
): Record<string, unknown> {
  return box("html", [], [0, 0, 1200, 2000], htmlStyles, [
    box("body", [], [0, 0, 1200, 2000], {}, sections),
  ]);
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

function convert(raw: Record<string, unknown>): WireframeNode {
  return convertW2WToWireframe(raw as never, {
    layoutMode: "autoLayout",
    interactionMode: "none",
    htmlLayerNames: true,
  });
}

async function render(tree: WireframeNode): Promise<MockNode> {
  const frameData = {
    viewportWidth: 1200,
    viewportHeight: 900,
    tree,
    assets: {},
  } as unknown as WireframeFrame;
  const root = await createWireframeFrame(
    frameData,
    "https://example.com",
    mockContext,
    0,
  );
  return root as unknown as MockNode;
}

function findNode(tree: WireframeNode, cls: string): WireframeNode {
  const walk = (n: WireframeNode): WireframeNode | null => {
    if ((n.className || "").split(" ").includes(cls)) return n;
    for (const c of n.children || []) {
      const hit = walk(c as WireframeNode);
      if (hit) return hit;
    }
    return null;
  };
  const found = walk(tree);
  if (!found) throw new Error(`fixture node .${cls} did not survive conversion`);
  return found;
}

function findFrame(root: MockNode, name: string): MockNode {
  const walk = (n: MockNode): MockNode | null => {
    if (n.name === name) return n;
    for (const c of n.children || []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  const found = walk(root);
  if (!found) throw new Error(`frame "${name}" was not rendered`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Change 1 — the converter carries the axes through
// ============================================================================

describe("converter derives a per-axis scroll direction", () => {
  it("overflow-x: auto alone → HORIZONTAL", () => {
    const tree = convert(page([scroller("carousel", 0, { overflowX: "auto", overflowY: "hidden" })]));
    expect(findNode(tree, "carousel").scrollDirection).toBe("HORIZONTAL");
  });

  it("overflow-y: scroll alone → VERTICAL", () => {
    const tree = convert(page([scroller("panel", 0, { overflowX: "hidden", overflowY: "scroll" })]));
    expect(findNode(tree, "panel").scrollDirection).toBe("VERTICAL");
  });

  it("both axes scrollable → BOTH", () => {
    const tree = convert(page([scroller("map", 0, { overflowX: "auto", overflowY: "scroll" })]));
    expect(findNode(tree, "map").scrollDirection).toBe("BOTH");
  });

  it("overflow: hidden → no direction at all", () => {
    const tree = convert(page([scroller("clipped", 0, { overflow: "hidden" })]));
    expect(findNode(tree, "clipped").scrollDirection).toBeUndefined();
  });

  it("leaves the collapsed `overflow` scalar untouched (clipsContent still depends on it)", () => {
    const tree = convert(page([scroller("carousel", 0, { overflowX: "auto", overflowY: "hidden" })]));
    // Most-restrictive-wins: one hidden axis still makes the whole box clip.
    expect(findNode(tree, "carousel").overflow).toBe("hidden");
  });
});

// ============================================================================
// Change 2 — the renderer applies it per frame
// ============================================================================

describe("renderer sets overflowDirection per frame", () => {
  it("a horizontal carousel scrolls sideways", async () => {
    const root = await render(convert(page([scroller("carousel", 0, { overflowX: "auto", overflowY: "hidden" })])));
    expect(findFrame(root, "div.carousel").overflowDirection).toBe("HORIZONTAL");
  });

  it("a vertical side panel scrolls down", async () => {
    const root = await render(convert(page([scroller("panel", 0, { overflowX: "hidden", overflowY: "scroll" })])));
    expect(findFrame(root, "div.panel").overflowDirection).toBe("VERTICAL");
  });

  it("a two-axis scroller scrolls both ways", async () => {
    const root = await render(convert(page([scroller("map", 0, { overflowX: "auto", overflowY: "scroll" })])));
    expect(findFrame(root, "div.map").overflowDirection).toBe("BOTH");
  });

  it("overflow: hidden sets no direction", async () => {
    const root = await render(convert(page([scroller("clipped", 0, { overflow: "hidden" })])));
    const frame = findFrame(root, "div.clipped");
    expect(frame.clipsContent).toBe(true);
    expect(frame.overflowDirection).toBeUndefined();
  });

  it("a scrollable frame that does not clip sets no direction", async () => {
    // A scroll root (`isScrollingElt`) keeps its declared overflow but is
    // deliberately NOT clipped, so its taller content survives. A scroll
    // direction there would be a Figma no-op — noise in the prototype panel.
    // Two children on purpose: a single-child box with no clipping is folded
    // into its child by the simplify pass, and the frame under test would
    // never reach the renderer.
    const inner = box("div", ["inner-scroll-root"], [0, 0, 1200, 900], {
      backgroundColor: "rgb(240, 240, 240)",
      overflowY: "scroll",
    }, [
      box("div", ["inner-track-a"], [0, 0, 1200, 900], {
        backgroundColor: "rgb(10, 20, 30)",
      }),
      box("div", ["inner-track-b"], [0, 900, 1200, 900], {
        backgroundColor: "rgb(30, 20, 10)",
      }),
    ]);
    (inner as { isScrollingElt?: boolean }).isScrollingElt = true;

    const root = await render(convert(page([inner])));
    const frame = findFrame(root, "div.inner-scroll-root");
    expect(frame.clipsContent).toBe(false);
    expect(frame.overflowDirection).toBeUndefined();
  });
});

// ============================================================================
// Change 2b — the import root keeps a VERTICAL floor
// ============================================================================

describe("import root scroll direction", () => {
  it("still scrolls vertically when <html> declares no overflow", async () => {
    const root = await render(convert(page([scroller("plain", 0, {})])));
    expect(root.clipsContent).toBe(true);
    expect(root.overflowDirection).toBe("VERTICAL");
  });

  it("widens to BOTH when <html> itself scrolls horizontally", async () => {
    const root = await render(
      convert(page([scroller("plain", 0, {})], { overflowX: "auto" })),
    );
    expect(root.overflowDirection).toBe("BOTH");
  });

  it("is never narrowed below VERTICAL by an <html> that only scrolls sideways", async () => {
    const root = await render(
      convert(page([scroller("plain", 0, {})], { overflowX: "scroll", overflowY: "hidden" })),
    );
    // A normal page must not stop scrolling down — that regression would be
    // far worse than the sideways-scroll bug this fixes.
    expect(root.overflowDirection).toBe("BOTH");
  });
});
