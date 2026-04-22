/**
 * Tests for pseudo-state dedup (signature-based ComponentSet reuse).
 *
 * BUG-01 scope: on a page with many DOM elements sharing the same visual
 * hover pattern (e.g. 9 footer links with identical light-text hover), the
 * plugin used to mint one ComponentSet per DOM node. After dedup it must
 * create ONE ComponentSet per unique signature and return instances for
 * every subsequent match.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock infrastructure (mirrors pseudo-state-variants.test.ts conventions)
// ---------------------------------------------------------------------------

interface MockFrameNode {
  type: "FRAME" | "COMPONENT";
  name: string;
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  opacity: number;
  cornerRadius: number;
  strokeWeight: number;
  strokeAlign: string;
  width: number;
  height: number;
  children: MockFrameNode[];
  setPluginData: ReturnType<typeof vi.fn>;
  getPluginData: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
  findAll: (predicate: (n: unknown) => boolean) => MockFrameNode[];
  parent?: unknown;
  remove?: ReturnType<typeof vi.fn>;
  layoutMode?: string;
  clipsContent?: boolean;
}

interface MockComponentNode extends MockFrameNode {
  type: "COMPONENT";
  id: string;
  clone: () => MockComponentNode;
  createInstance: () => {
    type: "INSTANCE";
    width: number;
    height: number;
    id: string;
    resize: ReturnType<typeof vi.fn>;
  };
  setReactionsAsync: ReturnType<typeof vi.fn>;
}

function createMockFrame(overrides: Partial<MockFrameNode> = {}): MockFrameNode {
  return {
    type: "FRAME",
    name: "Test Frame",
    fills: [{ type: "SOLID", color: { r: 0.23, g: 0.51, b: 0.96 }, opacity: 1 }],
    strokes: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 }, opacity: 1 }],
    effects: [],
    opacity: 1,
    cornerRadius: 8,
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    width: 200,
    height: 48,
    children: [],
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
    appendChild: vi.fn(),
    findAll: () => [],
    parent: { appendChild: vi.fn() },
    remove: vi.fn(),
    layoutMode: "NONE",
    clipsContent: false,
    ...overrides,
  };
}

// ============================================================================
// computeHoverSignature — pure function tests
// ============================================================================

describe("computeHoverSignature", () => {
  let computeHoverSignature: (
    frame: MockFrameNode,
    pseudoStates: Record<string, Record<string, string>>
  ) => string;

  beforeEach(async () => {
    try {
      const mod = await import("../rendering/pseudoStateDedup");
      computeHoverSignature =
        mod.computeHoverSignature as unknown as typeof computeHoverSignature;
    } catch {
      computeHoverSignature = () => {
        throw new Error("pseudoStateDedup module not yet implemented");
      };
    }
  });

  it("returns identical strings for identical frames + identical hover diff", () => {
    const frameA = createMockFrame();
    const frameB = createMockFrame();
    const diff = { "background-color": "#2563EB" };

    const sigA = computeHoverSignature(frameA, { hover: diff });
    const sigB = computeHoverSignature(frameB, { hover: diff });

    expect(sigA).toBe(sigB);
    expect(sigA.length).toBeGreaterThan(0);
  });

  it("returns different strings for frames with different fills", () => {
    const frameA = createMockFrame({
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
    });
    const frameB = createMockFrame({
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 }, opacity: 1 }],
    });
    const diff = { "background-color": "#2563EB" };

    const sigA = computeHoverSignature(frameA, { hover: diff });
    const sigB = computeHoverSignature(frameB, { hover: diff });

    expect(sigA).not.toBe(sigB);
  });

  it("returns different strings for same fills but different hover diff", () => {
    const frameA = createMockFrame();
    const frameB = createMockFrame();

    const sigA = computeHoverSignature(frameA, {
      hover: { "background-color": "#2563EB" },
    });
    const sigB = computeHoverSignature(frameB, {
      hover: { "background-color": "#FF0000" },
    });

    expect(sigA).not.toBe(sigB);
  });

  it("is stable across key ordering in pseudo-state diff", () => {
    const frame = createMockFrame();
    const diffA = { "background-color": "#2563EB", color: "#FFFFFF" };
    const diffB = { color: "#FFFFFF", "background-color": "#2563EB" };

    const sigA = computeHoverSignature(frame, { hover: diffA });
    const sigB = computeHoverSignature(frame, { hover: diffB });

    expect(sigA).toBe(sigB);
  });

  it("is stable across key ordering in pseudoStates object itself", () => {
    const frame = createMockFrame();

    const sigA = computeHoverSignature(frame, {
      hover: { "background-color": "#2563EB" },
      focus: { "outline-color": "#3B82F6" },
    });
    const sigB = computeHoverSignature(frame, {
      focus: { "outline-color": "#3B82F6" },
      hover: { "background-color": "#2563EB" },
    });

    expect(sigA).toBe(sigB);
  });

  it("ignores width/height — same visual style dedupes regardless of size", () => {
    // Matches h2d behaviour: buttons with same fill+radius+stroke but
    // different text widths should share one ComponentSet, not split.
    const frameA = createMockFrame({ width: 100, height: 40 });
    const frameB = createMockFrame({ width: 300, height: 60 });
    const diff = { "background-color": "#2563EB" };

    const sigA = computeHoverSignature(frameA, { hover: diff });
    const sigB = computeHoverSignature(frameB, { hover: diff });

    expect(sigA).toBe(sigB);
  });

  it("differs when corner radius differs", () => {
    const frameA = createMockFrame({ cornerRadius: 4 });
    const frameB = createMockFrame({ cornerRadius: 16 });
    const diff = { "background-color": "#2563EB" };

    const sigA = computeHoverSignature(frameA, { hover: diff });
    const sigB = computeHoverSignature(frameB, { hover: diff });

    expect(sigA).not.toBe(sigB);
  });
});

// ============================================================================
// createPseudoStateVariants + HoverComponentCache integration
// ============================================================================

describe("createPseudoStateVariants with cache", () => {
  let createPseudoStateVariants: (
    frame: MockFrameNode,
    pseudoStates: Record<string, Record<string, string>>,
    cache?: Map<string, unknown>
  ) => Promise<{
    componentSet: { name: string; children: MockComponentNode[] };
    defaultInstance: { type: string; width: number; height: number; id: string };
    cacheHit?: boolean;
  }>;

  let mockCombineAsVariants: ReturnType<typeof vi.fn>;
  let mockCreateComponent: ReturnType<typeof vi.fn>;
  let componentIdCounter: number;

  beforeEach(async () => {
    componentIdCounter = 0;
    mockCombineAsVariants = vi.fn(
      (components: MockComponentNode[], _parent: unknown) => ({
        type: "COMPONENT_SET",
        name: "ComponentSet",
        children: components,
      }),
    );

    mockCreateComponent = vi.fn((): MockComponentNode => {
      const id = `comp-${++componentIdCounter}`;
      const comp: MockComponentNode & Record<string, unknown> = {
        ...createMockFrame(),
        type: "COMPONENT" as const,
        id,
        layoutMode: "NONE",
        primaryAxisSizingMode: "FIXED",
        counterAxisSizingMode: "FIXED",
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        itemSpacing: 0,
        primaryAxisAlignItems: "MIN",
        counterAxisAlignItems: "MIN",
        clipsContent: false,
        resize: vi.fn(function (this: MockComponentNode, w: number, h: number) {
          this.width = w;
          this.height = h;
        }),
        clone: vi.fn((): MockComponentNode => {
          const clonedId = `comp-${++componentIdCounter}`;
          const cloned: MockComponentNode & Record<string, unknown> = {
            ...createMockFrame(),
            type: "COMPONENT" as const,
            id: clonedId,
            layoutMode: comp.layoutMode,
            fills: JSON.parse(JSON.stringify(comp.fills)),
            strokes: JSON.parse(JSON.stringify(comp.strokes)),
            effects: JSON.parse(JSON.stringify(comp.effects)),
            opacity: comp.opacity,
            cornerRadius: comp.cornerRadius,
            strokeWeight: comp.strokeWeight,
            width: comp.width,
            height: comp.height,
            clone: comp.clone,
            createInstance: vi.fn(() => ({
              type: "INSTANCE" as const,
              width: comp.width,
              height: comp.height,
              id: `inst-${clonedId}`,
              resize: vi.fn(),
            })),
            setReactionsAsync: vi.fn(),
            findAll: comp.findAll,
            resize: vi.fn(),
          };
          return cloned as unknown as MockComponentNode;
        }),
        createInstance: vi.fn(() => ({
          type: "INSTANCE" as const,
          width: comp.width,
          height: comp.height,
          id: `inst-${comp.id}`,
          resize: vi.fn(),
        })),
        setReactionsAsync: vi.fn(),
      };
      return comp as unknown as MockComponentNode;
    });

    (globalThis as Record<string, unknown>).figma = {
      createComponent: mockCreateComponent,
      combineAsVariants: mockCombineAsVariants,
      currentPage: { appendChild: vi.fn() },
    };

    try {
      const mod = await import("../rendering/pseudoStates");
      createPseudoStateVariants =
        mod.createPseudoStateVariants as unknown as typeof createPseudoStateVariants;
    } catch {
      createPseudoStateVariants = async () => {
        throw new Error("pseudoStates module not yet implemented");
      };
    }
  });

  it("first call with cache creates ComponentSet and populates cache", async () => {
    const cache = new Map<string, unknown>();
    const frame = createMockFrame();

    const result = await createPseudoStateVariants(
      frame,
      { hover: { "background-color": "#2563EB" } },
      cache,
    );

    expect(mockCombineAsVariants).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
    expect(result.componentSet).toBeDefined();
    expect(result.defaultInstance).toBeDefined();
  });

  it("second call with matching signature reuses cached ComponentSet (no new combineAsVariants)", async () => {
    const cache = new Map<string, unknown>();
    const diff = { "background-color": "#2563EB" };

    const frameA = createMockFrame();
    await createPseudoStateVariants(frameA, { hover: diff }, cache);
    expect(mockCombineAsVariants).toHaveBeenCalledTimes(1);

    const frameB = createMockFrame();
    const resultB = await createPseudoStateVariants(
      frameB,
      { hover: diff },
      cache,
    );

    expect(mockCombineAsVariants).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
    expect(resultB.defaultInstance.type).toBe("INSTANCE");
    expect(resultB.cacheHit).toBe(true);
  });

  it("different signatures produce distinct ComponentSets", async () => {
    const cache = new Map<string, unknown>();

    const frameA = createMockFrame({
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
    });
    const frameB = createMockFrame({
      fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 }, opacity: 1 }],
    });

    await createPseudoStateVariants(
      frameA,
      { hover: { "background-color": "#2563EB" } },
      cache,
    );
    await createPseudoStateVariants(
      frameB,
      { hover: { "background-color": "#2563EB" } },
      cache,
    );

    expect(mockCombineAsVariants).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });

  it("cache-hit returns an instance with resize call matching frame dimensions", async () => {
    const cache = new Map<string, unknown>();
    const diff = { "background-color": "#2563EB" };

    const frameA = createMockFrame({ width: 180, height: 44 });
    await createPseudoStateVariants(frameA, { hover: diff }, cache);

    const frameB = createMockFrame({ width: 180, height: 44 });
    const resultB = await createPseudoStateVariants(
      frameB,
      { hover: diff },
      cache,
    );

    expect(resultB.defaultInstance.width).toBe(180);
    expect(resultB.defaultInstance.height).toBe(44);
    expect(resultB.cacheHit).toBe(true);
  });

  it("omitting cache parameter preserves legacy behaviour (always creates ComponentSet)", async () => {
    const frameA = createMockFrame();
    const frameB = createMockFrame();
    const diff = { "background-color": "#2563EB" };

    await createPseudoStateVariants(frameA, { hover: diff });
    await createPseudoStateVariants(frameB, { hover: diff });

    expect(mockCombineAsVariants).toHaveBeenCalledTimes(2);
  });
});
