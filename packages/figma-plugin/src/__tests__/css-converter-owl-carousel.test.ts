/**
 * Owl-carousel (v1) subtree survival — telex.ge category circles.
 *
 * Live structure:
 *   div.ab-fn-parent (block 1200×247)
 *     div#ab__fn-first-level-224 (block, relative)
 *       div.owl-wrapper-outer (flex, overflow:hidden, 1198×245)
 *         div.owl-wrapper (5000×245, translated stage)
 *           div.owl-item ×N (float:left) > item (img + label)
 *       div.owl-controls (1198×0)
 *
 * The whole subtree was captured (extractor keeps every owl-item) but the
 * imported wireframe shows div.ab-fn-parent EMPTY. This test pins down where
 * the converter loses the subtree.
 */
import { describe, it, expect, vi } from "vitest";

// Figma API mock — minimal surface for createNodeInFigma.
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
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], children: [],
    layoutMode: "NONE",
    _pluginData: {},
    setPluginData(key, value) { this._pluginData[key] = value; },
    getPluginData(key) { return this._pluginData[key] ?? ""; },
    resize(w, h) { this.width = w; this.height = h; },
    appendChild(child) { this.children.push(child); },
  };
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
    x: 0, y: 0, width: 1200, height: 247,
    quad: [0, 0, 1200, 0, 1200, 247, 0, 247],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1440, height: 900, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1440, height: 900,
    styles: { height: "100%" },
    children: [body],
    isScrollingElt: true,
  });
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.className === "string" && obj.className.split(" ").includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

function owlItem(i: number): Record<string, unknown> {
  const x = 257 + i * 200;
  return makeFrame({
    tag: "div", classList: ["owl-item"],
    x, y: 600, width: 200, height: 245,
    styles: { display: "block", cssFloat: "left" },
    children: [
      makeFrame({
        tag: "div", classList: ["ab-fn-first-level-item", "scroller-item"],
        x, y: 600, width: 200, height: 245,
        styles: { display: "block" },
        children: [
          makeFrame({
            tag: "img", classList: ["fn-image"],
            x: x + 15, y: 610, width: 170, height: 170,
            styles: { display: "inline-block" },
            attr: { $url: "https://cdn.example/cat.png" },
          }),
          {
            type: "TEXT",
            x: x + 10, y: 790, width: 180, height: 20,
            quad: [x + 10, 790, x + 190, 790, x + 190, 810, x + 10, 810],
            value: `კატეგორია ${i + 1}`,
            font: "BPG Nino Mtavruli",
          },
        ],
      }),
    ],
  });
}

function abfnSubtree(): Record<string, unknown> {
  const items = Array.from({ length: 6 }, (_, i) => owlItem(i));
  return makeFrame({
    tag: "div", classList: ["ab-fn-parent", "ab-fn-block-224"],
    x: 257, y: 600, width: 1200, height: 247,
    styles: { display: "block", position: "relative" },
    children: [
      makeFrame({
        tag: "div", classList: ["ab-fn-first-level", "ab__fn_scroller"],
        attr: { id: "ab__fn-first-level-224" },
        x: 257, y: 600, width: 1200, height: 247,
        styles: { display: "block", position: "relative" },
        children: [
          makeFrame({
            tag: "div", classList: ["owl-wrapper-outer"],
            x: 258, y: 601, width: 1198, height: 245,
            styles: { display: "flex", overflow: "hidden", position: "relative" },
            children: [
              makeFrame({
                tag: "div", classList: ["owl-wrapper"],
                x: 258, y: 601, width: 5000, height: 245,
                styles: { display: "block", transform: "translate3d(0px, 0px, 0px)" },
                children: items,
              }),
            ],
          }),
          makeFrame({
            tag: "div", classList: ["owl-controls", "clickable"],
            x: 258, y: 846, width: 1198, height: 0,
            styles: { display: "block" },
            children: [
              makeFrame({
                tag: "div", classList: ["owl-pagination"],
                x: 258, y: 846, width: 1198, height: 0,
                styles: { display: "block" },
                children: [],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

describe("owl-carousel v1 subtree (telex.ge category circles)", () => {
  it("keeps the full carousel chain down to the items", () => {
    const root = convertW2WToWireframe(page([abfnSubtree()]) as never, { layoutMode: "autoLayout" });

    const parent = findByClass(root, "ab-fn-parent");
    expect(parent).not.toBeNull();
    expect((parent!.children as unknown[]).length).toBeGreaterThan(0);

    const scroller = findByClass(root, "ab-fn-first-level");
    expect(scroller).not.toBeNull();

    const wrapper = findByClass(root, "owl-wrapper");
    expect(wrapper).not.toBeNull();

    const item = findByClass(root, "owl-item");
    expect(item).not.toBeNull();

    // The circles themselves (img placeholder + label) survive.
    const cell = findByClass(root, "ab-fn-first-level-item");
    expect(cell).not.toBeNull();
    expect((cell!.children as unknown[]).length).toBeGreaterThan(0);
  });

  it("renders the carousel chain through createNodeInFigma (mock figma)", async () => {
    const root = convertW2WToWireframe(page([abfnSubtree()]) as never, { layoutMode: "autoLayout" });
    const parentWf = findByClass(root, "ab-fn-parent") as unknown as WireframeNode;
    expect(parentWf).not.toBeNull();

    const mockContext = {
      fontsToLoad: new Set(),
      layoutMode: "autoLayout",
      colorMode: "website",
      textMode: "original",
      fontMode: "original",
      assetMode: "placeholders",
      interactionMode: "none",
      variableMode: "none",
      pluginColors: { text: "#000", primary: "#000", secondary: "#888", background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD" },
      pluginFont: { family: "Inter", weight: 400 },
      colorStyleMap: new Map(),
      textStyleMap: new Map(),
      variableValueMap: new Map(),
    } as unknown as RenderContext;

    const rendered = (await createNodeInFigma(parentWf, mockContext, 0)) as unknown as {
      children: Array<{ name: string; children: unknown[] }>;
    } | null;
    expect(rendered).not.toBeNull();
    // The scroller child must exist and carry the carousel content.
    expect(rendered!.children.length).toBeGreaterThan(0);
    const flat: string[] = [];
    const walk = (n: { name: string; children?: unknown[] }) => {
      flat.push(n.name);
      for (const c of (n.children ?? []) as Array<{ name: string; children?: unknown[] }>) walk(c);
    };
    walk(rendered as never);
    expect(flat.some((n) => n.includes("owl-item"))).toBe(true);
  });
});
