/**
 * Defect 1 (h2d parity): a container whose layout could not be determined
 * (converter layoutMode "NONE") must NOT be forced into a VERTICAL stack when
 * the captured geometry contradicts one.
 *
 * h2d's `U8` derives the axis from measured child rects and ABORTS auto-layout
 * when the geometry supports none — the frame stays plain and children keep
 * their captured x/y (pixel-perfect). We previously restacked overlapping
 * children (badge over avatar, layered hero sections) into a column.
 *
 * A NONE container whose in-flow children DO form a clean vertical stack keeps
 * the VERTICAL fallback — that is the correct reading of block flow.
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
  effects?: unknown[];
  opacity?: number;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function createMockFrameNode(): MockNode {
  return {
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
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", appendChild() {} })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma, geometrySupportsVerticalStack } from "../rendering/nodes";
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

describe("geometrySupportsVerticalStack", () => {
  it("accepts a clean vertical stack", () => {
    const children = [
      makeNode("a", { y: 0, height: 100 }),
      makeNode("b", { y: 100, height: 50 }),
      makeNode("c", { y: 160, height: 40 }),
    ];
    expect(geometrySupportsVerticalStack(children)).toBe(true);
  });

  it("rejects vertically overlapping children (badge over avatar)", () => {
    const children = [
      makeNode("avatar", { x: 0, y: 0, width: 64, height: 64 }),
      makeNode("badge", { x: 48, y: 48, width: 20, height: 20 }),
    ];
    expect(geometrySupportsVerticalStack(children)).toBe(false);
  });

  it("rejects side-by-side children (same y band)", () => {
    const children = [
      makeNode("left", { x: 0, y: 0, width: 200, height: 100 }),
      makeNode("right", { x: 200, y: 0, width: 200, height: 100 }),
    ];
    expect(geometrySupportsVerticalStack(children)).toBe(false);
  });

  it("ignores out-of-flow children when validating the stack", () => {
    const children = [
      makeNode("hero-copy", { y: 0, height: 300 }),
      makeNode("hero-cta", { y: 300, height: 60 }),
      makeNode("overlay", { y: 0, height: 360, position: "absolute" }),
    ];
    expect(geometrySupportsVerticalStack(children)).toBe(true);
  });

  it("ignores zero-size children", () => {
    const children = [
      makeNode("a", { y: 0, height: 100 }),
      makeNode("spacer", { y: 50, width: 0, height: 0 }),
      makeNode("b", { y: 100, height: 50 }),
    ];
    expect(geometrySupportsVerticalStack(children)).toBe(true);
  });

  it("accepts a single child and empty containers", () => {
    expect(geometrySupportsVerticalStack([])).toBe(true);
    expect(geometrySupportsVerticalStack([makeNode("only", { y: 10, height: 40 })])).toBe(true);
  });

  it("tolerates sub-pixel overlap (0.51px epsilon)", () => {
    const children = [
      makeNode("a", { y: 0, height: 100.4 }),
      makeNode("b", { y: 100, height: 50 }),
    ];
    expect(geometrySupportsVerticalStack(children)).toBe(true);
  });
});

describe("createNodeInFigma — NONE containers under autoLayout context", () => {
  it("leaves overlapping-children container WITHOUT auto-layout, children at captured x/y", async () => {
    const container = makeNode("card", {
      layoutMode: "NONE",
      width: 300,
      height: 200,
      children: [
        makeNode("avatar", { x: 20, y: 20, width: 64, height: 64 }),
        makeNode("badge", { x: 68, y: 68, width: 20, height: 20 }),
      ],
    });

    const rendered = (await createNodeInFigma(container, mockContext, 0)) as unknown as {
      layoutMode: string;
      children: Array<{ name: string; x: number; y: number }>;
    } | null;

    expect(rendered).not.toBeNull();
    // Mock frames start with layoutMode "NONE" — the renderer must not have
    // promoted it to VERTICAL.
    expect(rendered!.layoutMode).toBe("NONE");
    const byName = Object.fromEntries(rendered!.children.map((c) => [c.name, c]));
    expect(byName["avatar"].x).toBe(20);
    expect(byName["avatar"].y).toBe(20);
    expect(byName["badge"].x).toBe(68);
    expect(byName["badge"].y).toBe(68);
  });

  it("keeps the VERTICAL fallback for a genuinely stacked NONE container", async () => {
    const container = makeNode("article", {
      layoutMode: "NONE",
      width: 600,
      height: 300,
      children: [
        makeNode("heading", { x: 0, y: 0, width: 600, height: 60 }),
        makeNode("body", { x: 0, y: 60, width: 600, height: 240 }),
      ],
    });

    const rendered = (await createNodeInFigma(container, mockContext, 0)) as unknown as {
      layoutMode: string;
    } | null;

    expect(rendered).not.toBeNull();
    expect(rendered!.layoutMode).toBe("VERTICAL");
  });
});
