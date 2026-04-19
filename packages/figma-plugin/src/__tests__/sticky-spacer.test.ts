/**
 * FIX E — sticky/fixed spacer insertion
 *
 * When a sticky/fixed element is promoted to root-level fixed, the space it
 * used to occupy in the DOM flow is lost. `insertFixedSpacer` drops a
 * transparent same-size frame at the original flow slot so siblings below
 * don't slide up and overlap the now-fixed header.
 */
import { describe, it, expect, vi } from "vitest";

interface PluginDataStore { [key: string]: string }

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
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  effects: unknown[];
  opacity?: number;
  parent?: MockNode | null;
  _pluginData: PluginDataStore;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  insertChild(index: number, child: MockNode): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
}

function mkFrame(): MockNode {
  const self: MockNode = {
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
    parent: null,
    _pluginData: {},
    resize(w, h) { this.width = w; this.height = h; },
    appendChild(child) {
      if (child.parent && child.parent !== this) {
        const idx = child.parent.children.indexOf(child);
        if (idx >= 0) child.parent.children.splice(idx, 1);
      }
      this.children.push(child);
      child.parent = this;
    },
    insertChild(index, child) {
      if (child.parent && child.parent !== this) {
        const idx = child.parent.children.indexOf(child);
        if (idx >= 0) child.parent.children.splice(idx, 1);
      }
      this.children.splice(index, 0, child);
      child.parent = this;
    },
    setPluginData(key, value) { this._pluginData[key] = value; },
    getPluginData(key) { return this._pluginData[key] ?? ""; },
  };
  return self;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => mkFrame()),
  createText: vi.fn(() => mkFrame()),
  createRectangle: vi.fn(() => mkFrame()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  mixed: Symbol("figma.mixed"),
});

import { insertFixedSpacer } from "../rendering/nodes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScene(parentLayoutMode: string): {
  parent: MockNode;
  header: MockNode;
  main: MockNode;
} {
  const parent = mkFrame();
  parent.name = "body";
  parent.width = 1440;
  parent.height = 2000;
  parent.layoutMode = parentLayoutMode;

  const header = mkFrame();
  header.name = "header.site-header";
  header.x = 0;
  header.y = 0;
  header.width = 1440;
  header.height = 64;
  parent.appendChild(header);

  const main = mkFrame();
  main.name = "main.content";
  main.x = 0;
  main.y = 64;
  main.width = 1440;
  main.height = 800;
  parent.appendChild(main);

  return { parent, header, main };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FIX E — insertFixedSpacer", () => {
  it("inserts a transparent same-size spacer at the fixed node's original index (NONE parent)", () => {
    const { parent, header, main } = buildScene("NONE");
    // Header is at index 0
    expect(parent.children[0]).toBe(header);
    expect(parent.children[1]).toBe(main);

    insertFixedSpacer(header as unknown as FrameNode);

    // Spacer should now be at index 0, header still present (shifted to 1)
    expect(parent.children.length).toBe(3);
    expect(parent.children[1]).toBe(header); // pushed down by insert
    expect(parent.children[2]).toBe(main);

    const spacer = parent.children[0];
    expect(spacer.getPluginData("w2w_sticky_spacer")).toBe("1");
    expect(spacer.name).toBe("header.site-header");
    expect(spacer.width).toBe(1440);
    expect(spacer.height).toBe(64);
    expect(spacer.x).toBe(0);
    expect(spacer.y).toBe(0);
  });

  it("spacer has empty fills / strokes / effects (invisible)", () => {
    const { parent, header } = buildScene("NONE");
    insertFixedSpacer(header as unknown as FrameNode);
    const spacer = parent.children[0];
    expect(spacer.fills).toEqual([]);
    expect(spacer.strokes).toEqual([]);
    expect(spacer.effects).toEqual([]);
  });

  it("preserves same-name convention for layer-panel clarity", () => {
    const { parent, header } = buildScene("NONE");
    header.name = "header#site-nav.sticky";
    insertFixedSpacer(header as unknown as FrameNode);
    expect(parent.children[0].name).toBe("header#site-nav.sticky");
  });

  it("works for VERTICAL auto-layout parent", () => {
    const { parent, header } = buildScene("VERTICAL");
    insertFixedSpacer(header as unknown as FrameNode);
    const spacers = parent.children.filter(
      (c) => c.getPluginData("w2w_sticky_spacer") === "1",
    );
    expect(spacers.length).toBe(1);
    expect(spacers[0].height).toBe(64);
  });

  it("skips HORIZONTAL parent — same-height spacer would push siblings sideways", () => {
    const { parent, header } = buildScene("HORIZONTAL");
    insertFixedSpacer(header as unknown as FrameNode);
    const spacers = parent.children.filter(
      (c) => c.getPluginData("w2w_sticky_spacer") === "1",
    );
    expect(spacers.length).toBe(0);
  });

  it("skips GRID parent — complex grid-cell semantics", () => {
    const { parent, header } = buildScene("GRID");
    insertFixedSpacer(header as unknown as FrameNode);
    const spacers = parent.children.filter(
      (c) => c.getPluginData("w2w_sticky_spacer") === "1",
    );
    expect(spacers.length).toBe(0);
  });

  it("safe no-op when node has no parent", () => {
    const orphan = mkFrame();
    orphan.name = "orphan";
    orphan.width = 100;
    orphan.height = 40;
    expect(() =>
      insertFixedSpacer(orphan as unknown as FrameNode),
    ).not.toThrow();
  });
});
