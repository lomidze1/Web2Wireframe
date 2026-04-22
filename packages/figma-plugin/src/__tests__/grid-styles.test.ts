/**
 * GridStyle creation & linking — Phase 3 TDD
 *
 * Covers:
 *   - isRootGridContainer (heuristic: layoutMode==="GRID" && cssMaxWidth || tag in {main,body} || depth≤2)
 *   - gridKey (value hash for grid config)
 *   - createGridStyles (Category A: named, versioned)
 *   - linkGridStyleIfAvailable (setGridStyleIdAsync, skips inline when linked)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WireframeFrame, WireframeNode, RenderContext } from "../types";

// ============================================================================
// Stateful Figma Mock
// ============================================================================

interface MockGridStyle {
  id: string;
  name: string;
  layoutGrids: readonly LayoutGrid[];
}

let mockGridStyles: MockGridStyle[] = [];
let createGridStyleCallCount = 0;
let gridStyleIdCounter = 0;

function installFigmaMock(): void {
  (globalThis as Record<string, unknown>).figma = {
    getLocalGridStyles: vi.fn(() => mockGridStyles),
    createGridStyle: vi.fn(() => {
      createGridStyleCallCount++;
      const style: MockGridStyle = {
        id: `grid-${++gridStyleIdCounter}`,
        name: "",
        layoutGrids: [],
      };
      mockGridStyles.push(style);
      return style;
    }),
  };
}

beforeEach(() => {
  mockGridStyles = [];
  createGridStyleCallCount = 0;
  gridStyleIdCounter = 0;
  installFigmaMock();
});

function seedGridStyle(name: string, layoutGrids: LayoutGrid[]): MockGridStyle {
  const style: MockGridStyle = {
    id: `grid-seed-${++gridStyleIdCounter}`,
    name,
    layoutGrids,
  };
  mockGridStyles.push(style);
  return style;
}

// ============================================================================
// Helpers
// ============================================================================

function mkGridNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "n-1",
    name: "grid-container",
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 1200, height: 400,
    layoutMode: "GRID",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#000000",
    borderColor: null, borderWidth: 0, borderRadius: 0, opacity: 1,
    textContent: "",
    fontSize: 0, fontWeight: 400, fontFamily: "Inter",
    textAlign: "left", lineHeight: 0, letterSpacing: 0, isPlaceholder: false,
    gridTemplateColumns: "repeat(12, 1fr)",
    gridColumnGap: 24,
    gridRowGap: 0,
    children: [],
    ...overrides,
  } as WireframeNode;
}

function makeFrameWithTree(tree: WireframeNode): WireframeFrame {
  return { viewportWidth: 1440, tree } as unknown as WireframeFrame;
}

// ============================================================================
// isRootGridContainer heuristic
// ============================================================================

import {
  isRootGridContainer,
  gridKey,
  createGridStyles,
  linkGridStyleIfAvailable,
} from "../rendering/styles";

describe("isRootGridContainer", () => {
  it("true: <main> with grid at any depth", () => {
    expect(isRootGridContainer(mkGridNode({ tag: "main" }), 5)).toBe(true);
  });

  it("true: <body> with grid at any depth", () => {
    expect(isRootGridContainer(mkGridNode({ tag: "body" }), 5)).toBe(true);
  });

  it("true: <div> with grid + cssMaxWidth at any depth", () => {
    expect(isRootGridContainer(mkGridNode({ tag: "div", cssMaxWidth: 1200 }), 5)).toBe(true);
  });

  it("true: <div> with grid at depth ≤ 2", () => {
    expect(isRootGridContainer(mkGridNode({ tag: "div" }), 0)).toBe(true);
    expect(isRootGridContainer(mkGridNode({ tag: "div" }), 2)).toBe(true);
  });

  it("false: <div> with grid at depth 3 without max-width", () => {
    expect(isRootGridContainer(mkGridNode({ tag: "div" }), 3)).toBe(false);
  });

  it("false: non-grid element even at depth 0", () => {
    expect(isRootGridContainer(mkGridNode({ layoutMode: "VERTICAL" }), 0)).toBe(false);
  });
});

// ============================================================================
// gridKey value hashing
// ============================================================================

describe("gridKey", () => {
  it("distinct keys for different column templates", () => {
    const k1 = gridKey(mkGridNode({ gridTemplateColumns: "repeat(12, 1fr)" }));
    const k2 = gridKey(mkGridNode({ gridTemplateColumns: "repeat(8, 1fr)" }));
    expect(k1).not.toBe(k2);
  });

  it("same key for identical configuration", () => {
    const k1 = gridKey(mkGridNode({ gridTemplateColumns: "repeat(12, 1fr)", gridColumnGap: 24 }));
    const k2 = gridKey(mkGridNode({ gridTemplateColumns: "repeat(12, 1fr)", gridColumnGap: 24 }));
    expect(k1).toBe(k2);
  });

  it("gap change produces different key", () => {
    const k1 = gridKey(mkGridNode({ gridColumnGap: 16 }));
    const k2 = gridKey(mkGridNode({ gridColumnGap: 32 }));
    expect(k1).not.toBe(k2);
  });
});

// ============================================================================
// createGridStyles
// ============================================================================

describe("createGridStyles", () => {
  it("empty tree → no styles", async () => {
    const frame = makeFrameWithTree(mkGridNode({ layoutMode: "VERTICAL" }));
    const map = await createGridStyles([frame], "apple.com");
    expect(map.size).toBe(0);
    expect(createGridStyleCallCount).toBe(0);
  });

  it("single root grid → creates one GridStyle", async () => {
    const frame = makeFrameWithTree(
      mkGridNode({ tag: "main", gridTemplateColumns: "repeat(12, 1fr)", gridColumnGap: 24 })
    );
    const map = await createGridStyles([frame], "apple.com");
    expect(map.size).toBe(1);
    expect(createGridStyleCallCount).toBe(1);
    expect(mockGridStyles[0].name).toMatch(/^apple\.com\/--grid-/);
  });

  it("two roots with same config → 1 style, 2 map entries", async () => {
    const g = mkGridNode({
      tag: "main",
      gridTemplateColumns: "repeat(12, 1fr)",
      gridColumnGap: 24,
      children: [
        mkGridNode({
          tag: "div",
          cssMaxWidth: 1200,
          gridTemplateColumns: "repeat(12, 1fr)",
          gridColumnGap: 24,
        }),
      ],
    });
    const frame = makeFrameWithTree(g);
    const map = await createGridStyles([frame], "apple.com");
    // One unique value → one style created
    expect(createGridStyleCallCount).toBe(1);
    // Both nodes share the same key → map has one entry, both consumers get the same style
    expect(map.size).toBe(1);
  });

  it("nested sub-grid at depth > 2 without maxWidth → skipped", async () => {
    const tree: WireframeNode = {
      ...mkGridNode({ tag: "body", layoutMode: "VERTICAL" }),
      children: [
        {
          ...mkGridNode({ tag: "div", layoutMode: "VERTICAL" }),
          children: [
            {
              ...mkGridNode({ tag: "div", layoutMode: "VERTICAL" }),
              children: [mkGridNode({ tag: "div" })], // depth=3, tag=div, no maxWidth → skipped
            },
          ],
        },
      ],
    };
    const frame = makeFrameWithTree(tree);
    const map = await createGridStyles([frame], "apple.com");
    expect(map.size).toBe(0);
    expect(createGridStyleCallCount).toBe(0);
  });

  it("re-import with identical grid → skip (Category A value match)", async () => {
    // Seed a GridStyle whose layoutGrids match the new grid's value
    seedGridStyle("apple.com/--grid-12col-24gap", [
      {
        pattern: "COLUMNS",
        count: 12,
        gutterSize: 24,
        alignment: "STRETCH",
      } as LayoutGrid,
    ]);
    createGridStyleCallCount = 0;

    const frame = makeFrameWithTree(
      mkGridNode({ tag: "main", gridTemplateColumns: "repeat(12, 1fr)", gridColumnGap: 24 })
    );
    await createGridStyles([frame], "apple.com");

    expect(createGridStyleCallCount).toBe(0);
  });

  it("re-import with changed gap → creates -V2 suffix", async () => {
    // Seed the base name with old gap
    seedGridStyle("apple.com/--grid-12col-24gap", [
      {
        pattern: "COLUMNS",
        count: 12,
        gutterSize: 24,
        alignment: "STRETCH",
      } as LayoutGrid,
    ]);
    createGridStyleCallCount = 0;

    // Import with new gap → different value → V2 on SAME base name (if naming
    // collides) OR fresh name (if naming differs). gridStyleName includes
    // the gap → new name `--grid-12col-40gap` — different from seed so it
    // creates a NEW style, not a V2.
    const frame = makeFrameWithTree(
      mkGridNode({ tag: "main", gridTemplateColumns: "repeat(12, 1fr)", gridColumnGap: 40 })
    );
    await createGridStyles([frame], "apple.com");

    expect(createGridStyleCallCount).toBe(1);
    const newStyle = mockGridStyles.find((s) => s.name === "apple.com/--grid-12col-40gap");
    expect(newStyle).toBeDefined();
  });
});

// ============================================================================
// linkGridStyleIfAvailable
// ============================================================================

describe("linkGridStyleIfAvailable", () => {
  function makeContext(map: Map<string, MockGridStyle>): RenderContext {
    return {
      gridStyleMap: map as unknown as Map<string, GridStyle>,
      variableMode: "styles",
      colorMode: "website",
      colorStyleMap: new Map(),
      variableValueMap: new Map(),
      cssVariables: [],
      fontMode: "website",
      textMode: "semantic",
      fontFamily: "Inter",
      pluginColors: {
        text: "#000", background: "#fff", secondary: "#ccc",
        surface: "#eee", accent: "#00f",
      },
      layoutMode: "autoLayout",
      assetMode: "placeholders",
      assetsMap: new Map(),
      interactionMode: "none",
      componentSets: [],
    } as unknown as RenderContext;
  }

  function makeMockFrame(): FrameNode {
    return {
      id: "mock-frame",
      layoutGrids: [],
      gridStyleId: "",
      setGridStyleIdAsync: vi.fn(async function (this: FrameNode, id: string) {
        (this as unknown as { gridStyleId: string }).gridStyleId = id;
      }),
    } as unknown as FrameNode;
  }

  it("returns true and sets gridStyleId when map has matching key", async () => {
    const node = mkGridNode({ tag: "main" });
    const style = seedGridStyle("apple.com/--grid-12col-24gap", []);
    const map = new Map<string, MockGridStyle>();
    map.set(gridKey(node), style);

    const frame = makeMockFrame();
    const result = await linkGridStyleIfAvailable(frame, makeContext(map), node);

    expect(result).toBe(true);
    expect((frame as unknown as { gridStyleId: string }).gridStyleId).toBe(style.id);
  });

  it("returns false when map has no matching key", async () => {
    const node = mkGridNode({ tag: "main" });
    const result = await linkGridStyleIfAvailable(
      makeMockFrame(),
      makeContext(new Map()),
      node
    );
    expect(result).toBe(false);
  });

  it("returns false when context.gridStyleMap is undefined", async () => {
    const node = mkGridNode({ tag: "main" });
    const ctx = makeContext(new Map());
    (ctx as { gridStyleMap?: Map<string, GridStyle> }).gridStyleMap = undefined;
    expect(await linkGridStyleIfAvailable(makeMockFrame(), ctx, node)).toBe(false);
  });
});
