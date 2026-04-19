/**
 * Regression tests for text node padding rendering (nodes.ts).
 *
 * Bug: <p> with padding-top (e.g. Apple footer footnote paragraphs using
 * `padding-top: 0.8em`) collapsed — the coalesced text node ignored
 * padding.top, so vertical gaps between paragraphs disappeared.
 *
 * Scenario: #ac-globalfooter .ac-gf-sosumi li p:nth-child(n+2)
 *           padding-top: 0.8em (9.6px with 12px font-size)
 *
 * Root cause: type:'text' nodes without background styling rendered via
 * plain TextNode, which has no padding support. Fix wraps such nodes in a
 * Frame with the TextNode positioned at padding.top/padding.left.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks
// ============================================================================

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
  characters?: string;
  fontSize?: number;
  fontName?: unknown;
  textAutoResize?: string;
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function createMockTextNode(): MockNode {
  const node: MockNode = {
    type: "TEXT",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    fills: [],
    strokes: [],
    children: [],
    characters: "",
    fontSize: 16,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild() {
      // TextNode can't have children — noop
    },
  };
  return node;
}

function createMockFrameNode(): MockNode {
  const node: MockNode = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    children: [],
    layoutMode: "NONE",
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockNode) {
      this.children.push(child);
    },
  };
  return node;
}

// Install global figma mock BEFORE importing module under test
vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => createMockTextNode()),
  createRectangle: vi.fn(() => createMockFrameNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  mixed: Symbol("figma.mixed"),
});

// Import AFTER mocking
import { createNodeInFigma } from "../rendering/nodes";
import type { WireframeNode, RenderContext } from "../types";

// ============================================================================
// Helpers
// ============================================================================

function makeTextNode(overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-p",
    name: "p",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 980,
    height: 41.59,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 9.6, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "rgba(0, 0, 0, 0.56)",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent:
      "Apple Payments Services LLC, a subsidiary of Apple Inc., is a service provider of Goldman Sachs Bank USA for Apple Card and Savings accounts. Neither Apple Inc. nor Apple Payments Services LLC is a bank.",
    fontSize: 12,
    fontWeight: 400,
    fontFamily: "SF Pro Text",
    textAlign: "left",
    lineHeight: 16.0005,
    letterSpacing: -0.12,
    children: [],
    ...overrides,
  } as WireframeNode;
}

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      text: "#11151A",
      background: "#F1F2F0",
      secondary: "#BDC1B2",
      surface: "#AAB5C3",
      accent: "#AFC6DC",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "original",
    fontMode: "plugin",
    textMode: "semantic",
    assetMode: "placeholders",
    assetsMap: new Map(),
    ...overrides,
  } as RenderContext;
}

// ============================================================================
// Tests
// ============================================================================

describe("text node padding (Apple footer footnote regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps text in frame with TextNode offset by padding.top", async () => {
    const node = makeTextNode({
      padding: { top: 9.6, right: 0, bottom: 0, left: 0 },
    });
    const result = (await createNodeInFigma(node, makeContext(), 0)) as MockNode;

    expect(result).toBeDefined();
    expect(result.type).toBe("FRAME");
    expect(result.children.length).toBeGreaterThan(0);

    const textChild = result.children.find((c) => c.type === "TEXT");
    expect(textChild).toBeDefined();
    expect(textChild!.y).toBeCloseTo(9.6, 5);
    expect(textChild!.x).toBe(0);
  });

  it("applies both paddingLeft and paddingTop symmetrically", async () => {
    const node = makeTextNode({
      padding: { top: 5, right: 0, bottom: 0, left: 10 },
    });
    const result = (await createNodeInFigma(node, makeContext(), 0)) as MockNode;

    const textChild = result.children.find((c) => c.type === "TEXT");
    expect(textChild!.x).toBe(10);
    expect(textChild!.y).toBe(5);
  });

  it("returns plain TextNode when no padding (no regression)", async () => {
    const node = makeTextNode({
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const result = (await createNodeInFigma(node, makeContext(), 0)) as MockNode;

    expect(result).toBeDefined();
    // No padding → no wrapper frame, returns TextNode directly
    expect(result.type).toBe("TEXT");
  });

  it("returns plain TextNode when padding is undefined", async () => {
    const node = makeTextNode({ padding: undefined });
    const result = (await createNodeInFigma(node, makeContext(), 0)) as MockNode;

    expect(result).toBeDefined();
    expect(result.type).toBe("TEXT");
  });

  it("wraps when only paddingBottom is set (bottom spacing)", async () => {
    const node = makeTextNode({
      padding: { top: 0, right: 0, bottom: 12, left: 0 },
    });
    const result = (await createNodeInFigma(node, makeContext(), 0)) as MockNode;

    expect(result.type).toBe("FRAME");
    const textChild = result.children.find((c) => c.type === "TEXT");
    expect(textChild!.y).toBe(0);
    expect(textChild!.x).toBe(0);
  });

  it("preserves frame dimensions matching node width/height", async () => {
    const node = makeTextNode({
      width: 980,
      height: 41.59,
      padding: { top: 9.6, right: 0, bottom: 0, left: 0 },
    });
    const result = (await createNodeInFigma(node, makeContext(), 0)) as MockNode;

    expect(result.type).toBe("FRAME");
    expect(result.width).toBeCloseTo(980, 2);
    expect(result.height).toBeCloseTo(41.59, 2);
  });
});
