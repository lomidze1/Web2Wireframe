/**
 * Tests for SVG icon library extraction (Phase D, h2d-parity).
 *
 * h2d's `Component 3` aggregates all unique SVGs into one ComponentSet with
 * one variant per icon. Other Components reference icons via `INSTANCE` of
 * Component 3 instead of inlining markup. We mirror that exactly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, WireframeFrame } from "../types";

function makeWfNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: `wf-${Math.random().toString(36).slice(2, 8)}`,
    name: "node",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 24,
    height: 24,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#111",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: "normal",
    letterSpacing: 0,
    children: [],
    ...overrides,
  } as WireframeNode;
}

function svgNode(markup: string): WireframeNode {
  return makeWfNode({
    type: "placeholder",
    tag: "svg",
    computedStyles: { svgMarkup: markup },
  });
}

function makeFrame(tree: WireframeNode): WireframeFrame {
  return { viewportWidth: 1440, hostname: "example.com", tree } as WireframeFrame;
}

const SVG_SEARCH = `<svg viewBox="0 0 16 16"><path d="M5 5l6 6"/></svg>`;
const SVG_BAG = `<svg viewBox="0 0 24 24"><path d="M3 7h18l-2 14H5z"/></svg>`;
const SVG_CLOSE = `<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10"/></svg>`;

// ---------------------------------------------------------------------------

describe("hashSvg", () => {
  let hashSvg: typeof import("../rendering/svgLibrary").hashSvg;

  beforeEach(async () => {
    const mod = await import("../rendering/svgLibrary");
    hashSvg = mod.hashSvg;
  });

  it("returns the same hash for identical markup", () => {
    expect(hashSvg(SVG_SEARCH)).toBe(hashSvg(SVG_SEARCH));
  });

  it("returns different hashes for different markup", () => {
    expect(hashSvg(SVG_SEARCH)).not.toBe(hashSvg(SVG_BAG));
    expect(hashSvg(SVG_BAG)).not.toBe(hashSvg(SVG_CLOSE));
  });

  it("normalizes whitespace differences", () => {
    const a = `<svg><path d="M5 5"/></svg>`;
    const b = `<svg>\n  <path d="M5 5"/>\n</svg>`;
    expect(hashSvg(a)).toBe(hashSvg(b));
  });

  it("normalizes fill/stroke color attributes (so color variants share an icon)", () => {
    const black = `<svg><path d="M5 5" fill="#000"/></svg>`;
    const white = `<svg><path d="M5 5" fill="#fff"/></svg>`;
    const blue = `<svg><path d="M5 5" fill="rgb(0, 100, 255)"/></svg>`;
    expect(hashSvg(black)).toBe(hashSvg(white));
    expect(hashSvg(white)).toBe(hashSvg(blue));
  });

  it("returns a stable short string (≤32 chars)", () => {
    const h = hashSvg(SVG_SEARCH);
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(0);
    expect(h.length).toBeLessThanOrEqual(32);
  });
});

// ---------------------------------------------------------------------------

describe("collectSvgs", () => {
  let collectSvgs: typeof import("../rendering/svgLibrary").collectSvgs;

  beforeEach(async () => {
    const mod = await import("../rendering/svgLibrary");
    collectSvgs = mod.collectSvgs;
  });

  it("returns empty map for frames with no SVGs", () => {
    const tree = makeWfNode({ children: [makeWfNode({ type: "text", textContent: "hi" })] });
    const result = collectSvgs([makeFrame(tree)]);
    expect(result.size).toBe(0);
  });

  it("returns one entry per unique SVG with usage count", () => {
    const tree = makeWfNode({
      children: [
        svgNode(SVG_SEARCH),
        svgNode(SVG_SEARCH), // duplicate
        svgNode(SVG_BAG),
      ],
    });
    const result = collectSvgs([makeFrame(tree)]);
    expect(result.size).toBe(2);
    const counts = Array.from(result.values()).map((v) => v.count);
    expect(counts.sort()).toEqual([1, 2]);
  });

  it("walks deeply across multiple frames", () => {
    const tree1 = makeWfNode({
      children: [
        makeWfNode({ children: [svgNode(SVG_SEARCH)] }),
        svgNode(SVG_BAG),
      ],
    });
    const tree2 = makeWfNode({
      children: [svgNode(SVG_BAG), svgNode(SVG_CLOSE)],
    });
    const result = collectSvgs([makeFrame(tree1), makeFrame(tree2)]);
    expect(result.size).toBe(3); // search + bag + close
  });

  it("stores the original markup verbatim (caller can render it later)", () => {
    const tree = makeWfNode({ children: [svgNode(SVG_SEARCH)] });
    const result = collectSvgs([makeFrame(tree)]);
    const entry = Array.from(result.values())[0];
    expect(entry.markup).toBe(SVG_SEARCH);
  });
});

// ---------------------------------------------------------------------------

describe("buildIconLibrary — Phase D h2d-parity", () => {
  let buildIconLibrary: typeof import("../rendering/svgLibrary").buildIconLibrary;
  let mockCreateNodeFromSvg: ReturnType<typeof vi.fn>;
  let mockCombineAsVariants: ReturnType<typeof vi.fn>;
  let mockCreateComponent: ReturnType<typeof vi.fn>;
  let mockCreateFrame: ReturnType<typeof vi.fn>;
  let mockCreateText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    let nextId = 1;
    const makeMockComp = (name = "Variant") => ({
      type: "COMPONENT" as const,
      id: `comp-${nextId++}`,
      name,
      width: 24,
      height: 24,
      x: 0,
      y: 0,
      fills: [],
      strokes: [],
      strokeWeight: 0,
      cornerRadius: 0,
      children: [] as unknown[],
      appendChild: vi.fn(function (this: { children: unknown[] }, c: unknown) {
        this.children.push(c);
      }),
      resize: vi.fn(),
      clone: vi.fn(),
      createInstance: vi.fn(() => ({ type: "INSTANCE", id: `inst-${nextId++}` })),
    });

    mockCreateNodeFromSvg = vi.fn((svg: string) => ({
      type: "FRAME",
      id: `svg-${nextId++}`,
      name: "svg",
      width: 24,
      height: 24,
      resize: vi.fn(),
      remove: vi.fn(),
      _markup: svg,
    }));

    mockCreateComponent = vi.fn(() => makeMockComp());

    mockCombineAsVariants = vi.fn((components: Array<{ children: unknown[] }>) => {
      const cs: Record<string, unknown> = {
        type: "COMPONENT_SET",
        id: `cs-${nextId++}`,
        name: "Icons",
        width: 800,
        height: 200,
        children: components,
        fills: [],
        strokes: [],
        strokeWeight: 0,
        cornerRadius: 0,
        appendChild: vi.fn(),
      };
      return cs;
    });

    mockCreateFrame = vi.fn(() => ({
      type: "FRAME",
      id: `frame-${nextId++}`,
      name: "",
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      fills: [],
      strokes: [],
      strokeWeight: 0,
      cornerRadius: 0,
      children: [] as unknown[],
      appendChild: vi.fn(function (this: { children: unknown[] }, c: unknown) {
        this.children.push(c);
      }),
      resize: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
    }));

    mockCreateText = vi.fn(() => ({
      type: "TEXT",
      id: `text-${nextId++}`,
      name: "",
      characters: "",
      fontName: { family: "Inter", style: "Light" },
      fontSize: 12,
    }));

    (globalThis as Record<string, unknown>).figma = {
      createNodeFromSvg: mockCreateNodeFromSvg,
      createComponent: mockCreateComponent,
      combineAsVariants: mockCombineAsVariants,
      createFrame: mockCreateFrame,
      createText: mockCreateText,
      loadFontAsync: vi.fn(async () => undefined),
      currentPage: { appendChild: vi.fn() },
    };

    const mod = await import("../rendering/svgLibrary");
    buildIconLibrary = mod.buildIconLibrary;
  });

  it("returns null when there are no SVGs", async () => {
    const tree = makeWfNode({ children: [makeWfNode({ type: "text", textContent: "hi" })] });
    const lib = await buildIconLibrary([makeFrame(tree)]);
    expect(lib).toBeNull();
  });

  it("creates a ComponentSet with one variant per unique SVG", async () => {
    const tree = makeWfNode({
      children: [
        svgNode(SVG_SEARCH),
        svgNode(SVG_BAG),
        svgNode(SVG_CLOSE),
        svgNode(SVG_SEARCH), // duplicate — should NOT add another variant
      ],
    });
    const lib = await buildIconLibrary([makeFrame(tree)]);
    expect(lib).not.toBeNull();
    expect(mockCombineAsVariants).toHaveBeenCalledOnce();
    const components = mockCombineAsVariants.mock.calls[0][0] as unknown[];
    expect(components).toHaveLength(3); // 3 unique
  });

  it("variant naming matches h2d format: 'variant=1', 'variant=2', …", async () => {
    const tree = makeWfNode({ children: [svgNode(SVG_SEARCH), svgNode(SVG_BAG)] });
    await buildIconLibrary([makeFrame(tree)]);
    const components = mockCombineAsVariants.mock.calls[0][0] as Array<{ name: string }>;
    expect(components.map((c) => c.name)).toEqual(["variant=1", "variant=2"]);
  });

  it("returns lookup map: hash → variant index + master component", async () => {
    const tree = makeWfNode({ children: [svgNode(SVG_SEARCH), svgNode(SVG_BAG)] });
    const lib = await buildIconLibrary([makeFrame(tree)]);
    expect(lib).not.toBeNull();
    expect(lib!.hashToVariantIndex.size).toBe(2);
    expect(lib!.hashToComponent.size).toBe(2);
  });

  it("wraps the icons ComponentSet in a 'Component N' doc-frame", async () => {
    const tree = makeWfNode({ children: [svgNode(SVG_SEARCH)] });
    const lib = await buildIconLibrary([makeFrame(tree)], { componentIndex: 5 });
    expect(lib!.wrapper.type).toBe("FRAME");
    expect(lib!.wrapper.name).toBe("Component 5");
  });
});
