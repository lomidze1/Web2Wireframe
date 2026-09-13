/**
 * Defect 5 (h2d parity): Figma's hug sizing measures ABSOLUTE-positioned
 * children while auto-layout props are applied to their parent, so the parent
 * computes the wrong size.
 *
 * Port of h2d's `Eh` (main-rawbundle.beautified.js:17623-17626): before
 * applying auto-layout props to a parent, remember each absolute child's
 * x/y/width/height/visibility, set `visible = false`, apply the props, then
 * restore. The renderer additionally hides an out-of-flow child during the
 * append → `layoutPositioning = "ABSOLUTE"` transition, so hug sizing never
 * sees it in normal flow.
 */
import { describe, it, expect, vi } from "vitest";

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fills: unknown[];
  strokes: unknown[];
  children: MockNode[];
  layoutMode?: string;
  layoutPositioning?: string;
  constraints?: unknown;
  effects?: unknown[];
  opacity?: number;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

/** Visibility of ABSOLUTE children at the moment a sizing prop is set. */
const sizingLog: Array<{ frame: string; absVisible: boolean[] }> = [];
/** Visibility of each child at the moment it is appended. */
const appendLog: Array<{ parent: string; child: string; visible: boolean }> = [];

function createMockFrameNode(): MockNode {
  const node: MockNode = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    fills: [],
    strokes: [],
    children: [],
    layoutMode: "NONE",
    layoutPositioning: "AUTO",
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
      appendLog.push({ parent: node.name, child: child.name, visible: child.visible });
      this.children.push(child);
    },
  };

  const logSizing = () => {
    sizingLog.push({
      frame: node.name,
      absVisible: node.children
        .filter((c) => c.layoutPositioning === "ABSOLUTE")
        .map((c) => c.visible),
    });
  };
  let sizingH = "FIXED";
  Object.defineProperty(node, "layoutSizingHorizontal", {
    get: () => sizingH,
    set: (v: string) => {
      logSizing();
      sizingH = v;
    },
  });
  let sizingV = "FIXED";
  Object.defineProperty(node, "layoutSizingVertical", {
    get: () => sizingV,
    set: (v: string) => {
      logSizing();
      sizingV = v;
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

import { createNodeInFigma, withAbsoluteChildrenHidden } from "../rendering/nodes";
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

describe("withAbsoluteChildrenHidden (h2d Eh port)", () => {
  function frameWith(children: MockNode[]): MockNode {
    const f = createMockFrameNode();
    for (const c of children) f.children.push(c);
    return f;
  }

  it("hides absolute children during fn and restores x/y/size/visibility after", () => {
    const abs = createMockFrameNode();
    abs.name = "abs";
    abs.layoutPositioning = "ABSOLUTE";
    Object.assign(abs, { x: 52, y: 12, width: 40, height: 40 });
    const flow = createMockFrameNode();
    flow.name = "flow";
    const parent = frameWith([abs, flow]);

    let absVisibleDuring: boolean | null = null;
    let flowVisibleDuring: boolean | null = null;
    withAbsoluteChildrenHidden(parent as unknown as FrameNode, () => {
      absVisibleDuring = abs.visible;
      flowVisibleDuring = flow.visible;
      // Simulate Figma relayout side effects on the absolute child
      abs.x = 0;
      abs.y = 0;
      abs.resize(1, 1);
      abs.visible = true;
    });

    expect(absVisibleDuring).toBe(false);
    expect(flowVisibleDuring).toBe(true);
    expect(abs.visible).toBe(true);
    expect(abs.x).toBe(52);
    expect(abs.y).toBe(12);
    expect(abs.width).toBe(40);
    expect(abs.height).toBe(40);
  });

  it("preserves a hover-hidden absolute child's visible=false", () => {
    const abs = createMockFrameNode();
    abs.layoutPositioning = "ABSOLUTE";
    abs.visible = false;
    const parent = frameWith([abs]);

    withAbsoluteChildrenHidden(parent as unknown as FrameNode, () => {});
    expect(abs.visible).toBe(false);
  });

  it("restores even when fn throws", () => {
    const abs = createMockFrameNode();
    abs.layoutPositioning = "ABSOLUTE";
    Object.assign(abs, { x: 10, y: 20 });
    const parent = frameWith([abs]);

    expect(() =>
      withAbsoluteChildrenHidden(parent as unknown as FrameNode, () => {
        abs.x = 999;
        throw new Error("figma prop setter threw");
      }),
    ).toThrow();
    expect(abs.visible).toBe(true);
    expect(abs.x).toBe(10);
  });
});

describe("render pipeline never lets hug sizing see an absolute child", () => {
  it("absolute child is hidden while appended, while parent sizing props are applied, and restored after", async () => {
    sizingLog.length = 0;
    appendLog.length = 0;

    const section = makeNode("section", {
      layoutMode: "VERTICAL",
      width: 800,
      height: 400,
      children: [
        makeNode("hero", {
          layoutMode: "VERTICAL",
          width: 400,
          height: 300,
          layoutSizingHorizontal: "FILL",
          children: [
            makeNode("copy", { x: 0, y: 0, width: 400, height: 260 }),
            makeNode("overlay", {
              x: 52,
              y: 12,
              width: 40,
              height: 40,
              position: "absolute",
            }),
          ],
        }),
      ],
    });

    const rendered = (await createNodeInFigma(section, mockContext, 0)) as unknown as {
      children: MockNode[];
    } | null;

    expect(rendered).not.toBeNull();
    const hero = rendered!.children.find((c) => c.name === "hero")!;
    const overlay = hero.children.find((c) => c.name === "overlay")!;

    // 1. The overlay was invisible at the moment it entered the tree — hug
    //    sizing never saw it in normal flow.
    const overlayAppend = appendLog.find((e) => e.child === "overlay")!;
    expect(overlayAppend.visible).toBe(false);

    // 2. Every sizing prop applied to hero happened with its absolute
    //    children hidden.
    const heroSizing = sizingLog.filter((e) => e.frame === "hero" && e.absVisible.length > 0);
    expect(heroSizing.length).toBeGreaterThan(0);
    for (const entry of heroSizing) {
      expect(entry.absVisible.every((v) => v === false)).toBe(true);
    }

    // 3. Fully restored afterwards.
    expect(overlay.visible).toBe(true);
    expect(overlay.x).toBe(52);
    expect(overlay.y).toBe(12);
    expect(overlay.layoutPositioning).toBe("ABSOLUTE");
  });
});
