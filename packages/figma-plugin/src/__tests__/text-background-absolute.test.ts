/**
 * Regression tests for createTextWithBackground in absolute (freeform) mode.
 *
 * Bug: When importing in absolute mode, text nodes with background styling
 * (buttons like `a.btn`) were rendered with auto-layout (HORIZONTAL) wrapper,
 * even though every other frame correctly used layoutMode="NONE" + x/y.
 *
 * Fix: in absolute mode the wrapper stays layoutMode="NONE" and the inner
 * TextNode is positioned by x/y derived from node.padding, mirroring the
 * existing precedent for text-with-padding-no-background (nodes.ts:255-270).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks — TextNode tracks layoutSizing* writes via setter spies
// ============================================================================

interface SpyTextNode {
  type: "TEXT";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  children: SpyTextNode[];
  characters?: string;
  fontSize?: number;
  fontName?: unknown;
  textAutoResize?: string;
  textAlignHorizontal?: string;
  layoutMode?: string;
  // Spy tracking — set by setters defined below
  __layoutSizingHorizontalWrites: number;
  __layoutSizingVerticalWrites: number;
  __lastLayoutSizingHorizontal?: string;
  __lastLayoutSizingVertical?: string;
  resize(w: number, h: number): void;
  appendChild(child: SpyTextNode): void;
}

interface SpyFrameNode {
  type: "FRAME";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  children: (SpyTextNode | SpyFrameNode)[];
  layoutMode: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  strokeWeight?: number;
  strokeAlign?: string;
  dashPattern?: number[];
  resize(w: number, h: number): void;
  appendChild(child: SpyTextNode | SpyFrameNode): void;
}

function createMockTextNode(): SpyTextNode {
  const node = {
    type: "TEXT" as const,
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    fills: [],
    strokes: [],
    children: [] as SpyTextNode[],
    characters: "",
    fontSize: 16,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    textAlignHorizontal: "LEFT",
    __layoutSizingHorizontalWrites: 0,
    __layoutSizingVerticalWrites: 0,
    __lastLayoutSizingHorizontal: undefined,
    __lastLayoutSizingVertical: undefined,
    resize(this: SpyTextNode, w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild() {
      // TextNode can't have children — noop
    },
  } as SpyTextNode;

  // Track writes to layoutSizingHorizontal / layoutSizingVertical
  Object.defineProperty(node, "layoutSizingHorizontal", {
    get() {
      return node.__lastLayoutSizingHorizontal;
    },
    set(v: string) {
      node.__layoutSizingHorizontalWrites += 1;
      node.__lastLayoutSizingHorizontal = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(node, "layoutSizingVertical", {
    get() {
      return node.__lastLayoutSizingVertical;
    },
    set(v: string) {
      node.__layoutSizingVerticalWrites += 1;
      node.__lastLayoutSizingVertical = v;
    },
    enumerable: true,
    configurable: true,
  });

  return node;
}

function createMockFrameNode(): SpyFrameNode {
  const node: SpyFrameNode = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    effects: [],
    children: [],
    layoutMode: "NONE",
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: SpyTextNode | SpyFrameNode) {
      this.children.push(child);
    },
  };
  return node;
}

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
import { createTextWithBackground } from "../rendering/text";
import type { WireframeNode, RenderContext, FigmaFill } from "../types";

// ============================================================================
// Helpers
// ============================================================================

function makeButtonNode(overrides?: Partial<WireframeNode>): WireframeNode {
  const fill: FigmaFill = {
    type: "SOLID",
    visible: true,
    opacity: 1,
    color: { r: 0.2, g: 0.4, b: 0.8, a: 1 },
  };
  return {
    id: "btn-1",
    name: "Button",
    type: "text",
    tag: "a",
    className: "btn",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 8, right: 16, bottom: 8, left: 16 },
    fills: [fill],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#ffffff",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 8,
    opacity: 1,
    textContent: "Get Plus",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "Inter",
    textAlign: "center",
    lineHeight: 20,
    letterSpacing: 0,
    isPlaceholder: false,
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

describe("createTextWithBackground — absolute (freeform) mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wrapper layoutMode === 'NONE' in absolute mode", async () => {
    const result = await createTextWithBackground(
      makeButtonNode(),
      makeContext({ layoutMode: "absolute" })
    );

    expect(result).not.toBeNull();
    const frame = result as unknown as SpyFrameNode;
    expect(frame.type).toBe("FRAME");
    expect(frame.layoutMode).toBe("NONE");
  });

  it("wrapper layoutMode === 'HORIZONTAL' in autoLayout mode (regression)", async () => {
    const result = await createTextWithBackground(
      makeButtonNode(),
      makeContext({ layoutMode: "autoLayout" })
    );

    const frame = result as unknown as SpyFrameNode;
    expect(frame.layoutMode).toBe("HORIZONTAL");
    expect(frame.primaryAxisAlignItems).toBe("CENTER");
    expect(frame.counterAxisAlignItems).toBe("CENTER");
  });

  it("absolute mode: text child positioned at (padding.left, padding.top)", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({ padding: { top: 8, right: 16, bottom: 8, left: 16 } }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text).toBeDefined();
    expect(text!.x).toBe(16);
    expect(text!.y).toBe(8);
  });

  it("absolute mode: text child resized to (wrapperW - padX, wrapperH - padY)", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({
        width: 120,
        height: 40,
        padding: { top: 8, right: 16, bottom: 8, left: 16 },
      }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text).toBeDefined();
    expect(text!.width).toBe(120 - 16 - 16); // 88
    expect(text!.height).toBe(40 - 8 - 8); // 24
  });

  it("absolute mode + no padding: text positioned at (0, 0), full wrapper size", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({
        width: 100,
        height: 30,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text).toBeDefined();
    expect(text!.x).toBe(0);
    expect(text!.y).toBe(0);
    expect(text!.width).toBe(100);
    expect(text!.height).toBe(30);
  });

  it("absolute mode: layoutSizingHorizontal/Vertical NOT written on text child", async () => {
    const result = await createTextWithBackground(
      makeButtonNode(),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text).toBeDefined();
    expect(text!.__layoutSizingHorizontalWrites).toBe(0);
    expect(text!.__layoutSizingVerticalWrites).toBe(0);
  });

  it("autoLayout mode: layoutSizingHorizontal/Vertical written on text child (regression)", async () => {
    const result = await createTextWithBackground(
      makeButtonNode(),
      makeContext({ layoutMode: "autoLayout", textMode: "semantic" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text).toBeDefined();
    expect(text!.__layoutSizingHorizontalWrites).toBeGreaterThan(0);
    expect(text!.__layoutSizingVerticalWrites).toBeGreaterThan(0);
  });

  it("absolute mode: cornerRadius and fills still applied to wrapper", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({ borderRadius: 12 }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    expect(frame.cornerRadius).toBe(12);
    expect(frame.fills.length).toBeGreaterThan(0);
  });

  it("absolute mode: wrapper still resized to node.width/height", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({ width: 200, height: 48 }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    expect(frame.width).toBe(200);
    expect(frame.height).toBe(48);
  });

  it("absolute mode: justifyContent='center' → textAlignHorizontal='CENTER' (flex centering)", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({
        textAlign: "left", // CSS default for buttons
        justifyContent: "center", // visual centering source
      }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text).toBeDefined();
    expect(text!.textAlignHorizontal).toBe("CENTER");
  });

  it("absolute mode: justifyContent='flex-end' → textAlignHorizontal='RIGHT'", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({ textAlign: "left", justifyContent: "flex-end" }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect(text!.textAlignHorizontal).toBe("RIGHT");
  });

  it("absolute mode: alignItems='center' → textAlignVertical='CENTER'", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({ alignItems: "center" }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    expect((text as unknown as { textAlignVertical?: string }).textAlignVertical).toBe("CENTER");
  });

  it("absolute mode: no justifyContent → textAlignHorizontal NOT overridden by us", async () => {
    // When CSS doesn't specify flex centering, leave whatever createTextNode
    // derived from node.textAlign untouched.
    const result = await createTextWithBackground(
      makeButtonNode({ textAlign: "left", justifyContent: undefined }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    const text = frame.children.find((c) => c.type === "TEXT") as SpyTextNode | undefined;
    // Mock initial value is "LEFT"; createTextNode may set it from textAlign.
    // What matters: we did NOT force CENTER on this left-aligned button.
    expect(text!.textAlignHorizontal).not.toBe("CENTER");
    expect(text!.textAlignHorizontal).not.toBe("RIGHT");
  });

  it("absolute mode: wrapper has no padding/itemSpacing/axis-alignment props applied", async () => {
    const result = await createTextWithBackground(
      makeButtonNode({ padding: { top: 8, right: 16, bottom: 8, left: 16 } }),
      makeContext({ layoutMode: "absolute" })
    );

    const frame = result as unknown as SpyFrameNode;
    // Padding belongs on the text x/y, not on the wrapper, in absolute mode
    expect(frame.paddingTop).toBeUndefined();
    expect(frame.paddingLeft).toBeUndefined();
    expect(frame.primaryAxisAlignItems).toBeUndefined();
    expect(frame.counterAxisAlignItems).toBeUndefined();
  });
});
