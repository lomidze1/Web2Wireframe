/**
 * Renderer depth cap must sit ABOVE the extractor's capture cap.
 *
 * telex.ge regression: the extractor emits trees up to 30 levels deep
 * (content/extractor.ts MAX_DEPTH = 30), but the renderer used to bail out at
 * depth > 20 — silently truncating real page content that lives deep in
 * CS-Cart markup (product prices at DOM depth 21+ vanished from every card).
 */
import { describe, it, expect, vi } from "vitest";

interface MockNode {
  type: string;
  name: string;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  children: MockNode[];
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
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    children: [],
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

import { createNodeInFigma, MAX_RENDER_DEPTH } from "../rendering/nodes";
import type { WireframeNode, RenderContext } from "../types";

/** Extractor cap in packages/browser-extension/src/content/extractor.ts. */
const EXTRACTOR_MAX_DEPTH = 30;

function makeNode(name: string, children: WireframeNode[] = []): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 100, height: 100,
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
    children,
    isPlaceholder: false,
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

describe("render depth cap", () => {
  it("is at least the extractor's capture depth (plus wrapper headroom)", () => {
    expect(MAX_RENDER_DEPTH).toBeGreaterThanOrEqual(EXTRACTOR_MAX_DEPTH);
  });

  it("renders a tree as deep as the extractor can emit (30 levels)", async () => {
    // Build a 30-level chain: level-0 → level-1 → … → level-29.
    let leaf = makeNode("level-29");
    for (let i = 28; i >= 0; i--) {
      leaf = makeNode(`level-${i}`, [leaf]);
    }

    const rendered = (await createNodeInFigma(leaf, mockContext, 0)) as unknown as {
      name: string;
      children: Array<{ name: string; children: unknown[] }>;
    } | null;
    expect(rendered).not.toBeNull();

    // Walk to the deepest rendered frame — the full chain must survive.
    let depth = 0;
    let cursor = rendered as { name: string; children: Array<{ name: string; children: unknown[] }> };
    while (cursor.children && cursor.children.length > 0) {
      cursor = cursor.children[0] as typeof cursor;
      depth++;
    }
    expect(depth).toBe(29);
    expect(cursor.name).toBe("level-29");
  });
});
