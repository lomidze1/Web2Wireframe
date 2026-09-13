/**
 * Defect 3 (h2d parity): after auto-layout is applied, a frame can come out
 * smaller than the size captured from the browser — nothing detected it, so
 * containers silently collapsed.
 *
 * Port of h2d's `nS` guard (main-rawbundle.beautified.js:17694-17698): compare
 * the post-layout size against the captured size; smaller by more than the
 * 10px tolerance → force `minWidth` (VERTICAL) / `minHeight` (HORIZONTAL) to
 * the captured value. The guard must never lower a larger CSS-derived
 * min-width/min-height, and the CSS application must not lower a larger
 * guard-derived value either.
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
  layoutMode?: string;
  minWidth?: number | null;
  minHeight?: number | null;
  effects?: unknown[];
  opacity?: number;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
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
    minWidth: null,
    minHeight: null,
    effects: [],
    opacity: 1,
    _pluginData: {},
    setPluginData(key, value) {
      this._pluginData[key] = value;
    },
    getPluginData(key) {
      return this._pluginData[key] ?? "";
    },
    resize(w, h) {
      this.width = w;
      this.height = h;
    },
    appendChild(child) {
      this.children.push(child);
    },
  };

  // Simulate Figma hug sizing: a HUG axis collapses to content size — which
  // for these tests is smaller than the captured size the frame was resized to.
  let hugH = "FIXED";
  Object.defineProperty(node, "layoutSizingHorizontal", {
    get: () => hugH,
    set: (v: string) => {
      hugH = v;
      if (v === "HUG") node.width = 60; // content narrower than captured
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

import { applyCapturedMinSize, createNodeInFigma } from "../rendering/nodes";
import type { WireframeNode, RenderContext } from "../types";

function makeNode(name: string, overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 400,
    height: 100,
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
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 1.2,
    letterSpacing: 0,
    children: [],
    isPlaceholder: false,
    ...overrides,
  } as WireframeNode;
}

const mockContext = {
  fontsToLoad: new Set(),
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
  pluginColors: { text: "#000", primary: "#000", secondary: "#888", background: "#FFF" },
  pluginFont: { family: "Inter", weight: 400 },
  colorStyleMap: new Map(),
  textStyleMap: new Map(),
  variableValueMap: new Map(),
} as unknown as RenderContext;

function mockFrame(overrides: Partial<MockNode> = {}): MockNode {
  return { ...createMockFrameNode(), ...overrides };
}

describe("applyCapturedMinSize (h2d nS port)", () => {
  it("VERTICAL frame narrower than captured by >10px → minWidth = captured", () => {
    const frame = mockFrame({ layoutMode: "VERTICAL", width: 187.31 });
    applyCapturedMinSize(frame as unknown as FrameNode, 202.23, 100);
    expect(frame.minWidth).toBe(202.23);
  });

  it("within the 10px tolerance → untouched", () => {
    const frame = mockFrame({ layoutMode: "VERTICAL", width: 195 });
    applyCapturedMinSize(frame as unknown as FrameNode, 202, 100);
    expect(frame.minWidth).toBeNull();
  });

  it("does not lower an existing larger minWidth", () => {
    const frame = mockFrame({ layoutMode: "VERTICAL", width: 100, minWidth: 500 });
    applyCapturedMinSize(frame as unknown as FrameNode, 300, 100);
    expect(frame.minWidth).toBe(500);
  });

  it("raises an existing smaller minWidth", () => {
    const frame = mockFrame({ layoutMode: "VERTICAL", width: 100, minWidth: 150 });
    applyCapturedMinSize(frame as unknown as FrameNode, 300, 100);
    expect(frame.minWidth).toBe(300);
  });

  it("HORIZONTAL frame shorter than captured → minHeight = captured", () => {
    const frame = mockFrame({ layoutMode: "HORIZONTAL", height: 40 });
    applyCapturedMinSize(frame as unknown as FrameNode, 400, 80);
    expect(frame.minHeight).toBe(80);
    expect(frame.minWidth).toBeNull();
  });

  it("no-op on frames without auto-layout", () => {
    const frame = mockFrame({ layoutMode: "NONE", width: 50, height: 50 });
    applyCapturedMinSize(frame as unknown as FrameNode, 400, 400);
    expect(frame.minWidth).toBeNull();
    expect(frame.minHeight).toBeNull();
  });
});

describe("createNodeInFigma applies the guard after hug sizing settles", () => {
  it("HUG-width VERTICAL container that collapsed gets minWidth = captured, and a smaller CSS min-width does not lower it", async () => {
    // Parent is a VERTICAL auto-layout container; the child is a VERTICAL
    // container captured at 400px whose HUG sizing collapses it to 60px
    // (see the mock's layoutSizingHorizontal setter). cssMinWidth is SMALLER
    // than the captured width — it must not clobber the guard's value.
    const parent = makeNode("section", {
      layoutMode: "VERTICAL",
      width: 800,
      height: 400,
      children: [
        makeNode("card", {
          layoutMode: "VERTICAL",
          width: 400,
          height: 200,
          layoutSizingHorizontal: "HUG",
          cssMinWidth: 50,
          children: [makeNode("inner", { width: 60, height: 180 })],
        }),
      ],
    });

    const rendered = (await createNodeInFigma(parent, mockContext, 0)) as unknown as {
      children: Array<{ name: string; minWidth: number | null }>;
    } | null;

    expect(rendered).not.toBeNull();
    const card = rendered!.children.find((c) => c.name === "card")!;
    expect(card.minWidth).toBe(400);
  });
});
