/**
 * Unit tests for createPlaceholder
 * Verifies that placeholder frames get explicit auto-layout properties
 * so they maintain correct dimensions inside auto-layout parents.
 *
 * Bug: Without explicit layoutMode/sizing, Figma collapses placeholder height
 * to ~lineHeight (25.6px) instead of using resize() dimensions (357px).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, RenderContext } from "../types";

// Reset module cache so each test gets the fresh figma mock
beforeEach(() => {
  vi.resetModules();
});

// ============================================================================
// Figma API Mock
// ============================================================================

/** Minimal mock that tracks property assignments on created nodes */
function createMockFrameNode(): Record<string, unknown> {
  const children: unknown[] = [];
  return {
    // Properties we care about verifying
    name: "",
    layoutMode: "NONE", // Figma default
    primaryAxisSizingMode: undefined,
    counterAxisSizingMode: undefined,
    primaryAxisAlignItems: undefined,
    counterAxisAlignItems: undefined,
    fills: [],
    cornerRadius: 0,
    fillStyleId: undefined,
    strokeStyleId: undefined,
    _width: 100,
    _height: 100,
    get width() {
      return this._width as number;
    },
    get height() {
      return this._height as number;
    },
    resize(w: number, h: number) {
      (this as Record<string, unknown>)._width = w;
      (this as Record<string, unknown>)._height = h;
    },
    appendChild(child: unknown) {
      children.push(child);
    },
    _children: children,
  };
}

function createMockRectangleNode(): Record<string, unknown> {
  return {
    resize: vi.fn(),
    x: 0,
    y: 0,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    fillStyleId: undefined,
    strokeStyleId: undefined,
  };
}

function createMockEllipseNode(): Record<string, unknown> {
  return {
    resize: vi.fn(),
    x: 0,
    y: 0,
    fills: [],
    strokes: [],
    fillStyleId: undefined,
  };
}

function createMockPolygonNode(): Record<string, unknown> {
  return {
    pointCount: 3,
    resize: vi.fn(),
    x: 0,
    y: 0,
    fills: [],
    strokes: [],
    fillStyleId: undefined,
  };
}

// Install global figma mock before imports
const mockFrames: Record<string, unknown>[] = [];

beforeEach(() => {
  mockFrames.length = 0;

  (globalThis as Record<string, unknown>).figma = {
    createFrame: vi.fn(() => {
      const frame = createMockFrameNode();
      mockFrames.push(frame);
      return frame;
    }),
    createRectangle: vi.fn(() => createMockRectangleNode()),
    createEllipse: vi.fn(() => createMockEllipseNode()),
    createPolygon: vi.fn(() => createMockPolygonNode()),
    getLocalPaintStyles: vi.fn(() => []),
    createPaintStyle: vi.fn(() => ({
      id: "mock-style-id",
      name: "",
      paints: [],
    })),
  };
});

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      text: "#11151A",
      background: "#F1F2F0",
      secondary: "#1f3a5f",
      surface: "#f5f5f5",
      accent: "#3b82f6",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "plugin",
    fontMode: "plugin",
    ...overrides,
  } as RenderContext;
}

function makePlaceholderNode(
  overrides?: Partial<WireframeNode>
): WireframeNode {
  return {
    id: "test-placeholder",
    name: "Image",
    type: "placeholder",
    tag: "img",
    x: 0,
    y: 0,
    width: 534.992,
    height: 357.109,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#1A2233",
    borderColor: "#1A2233",
    borderWidth: 0,
    borderRadius: 16,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: "25.6px",
    letterSpacing: 0,
    isPlaceholder: true,
    children: [],
  } as WireframeNode;
}

// ============================================================================
// Tests
// ============================================================================

describe("createPlaceholder", () => {
  // Dynamic import so the mock is installed first
  async function importCreatePlaceholder() {
    const mod = await import("../rendering/placeholders");
    return mod.createPlaceholder;
  }

  it("sets explicit layoutMode on the placeholder frame", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode();
    const context = makeContext();

    const result = await createPlaceholder(node, "#f5f5f5", "#1A2233", context);

    // Must NOT be "NONE" — Figma collapses height in auto-layout parents
    expect(result.layoutMode).not.toBe("NONE");
    expect(["VERTICAL", "HORIZONTAL"]).toContain(result.layoutMode);
  });

  it("sets FIXED sizing modes to prevent dimension collapse", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode();
    const context = makeContext();

    const result = await createPlaceholder(node, "#f5f5f5", "#1A2233", context);

    expect(result.primaryAxisSizingMode).toBe("FIXED");
    expect(result.counterAxisSizingMode).toBe("FIXED");
  });

  it("sets center alignment for icon positioning", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode();
    const context = makeContext();

    const result = await createPlaceholder(node, "#f5f5f5", "#1A2233", context);

    expect(result.primaryAxisAlignItems).toBe("CENTER");
    expect(result.counterAxisAlignItems).toBe("CENTER");
  });

  it("preserves node dimensions via resize()", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode({
      width: 534.992,
      height: 357.109,
    });
    const context = makeContext();

    const result = await createPlaceholder(node, "#f5f5f5", "#1A2233", context);

    expect(result.width).toBeCloseTo(534.992, 1);
    expect(result.height).toBeCloseTo(357.109, 1);
  });

  it("applies border radius from node", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode({ borderRadius: 16 });
    const context = makeContext();

    const result = await createPlaceholder(node, "#f5f5f5", undefined, context);

    expect(result.cornerRadius).toBe(16);
  });

  it("clamps border radius to half of smallest dimension", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode();
    // Override after creation to ensure no spread issues
    node.width = 40;
    node.height = 30;
    node.borderRadius = 100;
    const context = makeContext();

    const result = await createPlaceholder(node, "#f5f5f5", undefined, context);

    // Should be clamped to min(40,30)/2 = 15
    expect(result.cornerRadius).toBe(15);
  });

  it("creates icon when dimensions are large enough", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode({ width: 200, height: 150 });
    const context = makeContext();

    await createPlaceholder(node, "#f5f5f5", "#1A2233", context);

    // Should create 2 frames: placeholder + icon frame
    expect(mockFrames.length).toBe(2);
    expect(mockFrames[1].name).toBe("Image Icon");
  });

  it("always creates icon (min iconSize is 24 from Math.max floor)", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode({ width: 10, height: 10 });
    const context = makeContext();

    await createPlaceholder(node, "#f5f5f5", "#1A2233", context);

    // iconSize = Math.min(Math.max(10*0.4, 24), 120) = 24 >= 20, so icon is created
    expect(mockFrames.length).toBe(2);
  });

  it("applies fills directly when variableMode is not 'styles'", async () => {
    const createPlaceholder = await importCreatePlaceholder();
    const node = makePlaceholderNode();
    const context = makeContext({ variableMode: "direct" });

    const result = await createPlaceholder(node, "#f5f5f5", undefined, context);

    expect(result.fills).toHaveLength(1);
    const fill = (result.fills as Array<{ type: string }>)[0];
    expect(fill.type).toBe("SOLID");
  });
});
