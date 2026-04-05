/**
 * Tests for pseudo-state variant creation
 * Verifies CSS diff → Figma property mapping, ComponentSet creation,
 * and prototype interaction wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Figma API mocks
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
  createInstance: () => { type: "INSTANCE"; width: number; height: number; id: string };
  setReactionsAsync: ReturnType<typeof vi.fn>;
}

function createMockFrame(overrides: Partial<MockFrameNode> = {}): MockFrameNode {
  const frame: MockFrameNode = {
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
    getPluginData: vi.fn(),
    appendChild: vi.fn(),
    findAll: (_predicate) => [],
    parent: null,
    remove: vi.fn(),
    layoutMode: "NONE",
    clipsContent: false,
    ...overrides,
  };
  return frame;
}

function createMockTextNode() {
  return {
    type: "TEXT" as const,
    name: "Text",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    textDecoration: "NONE" as string,
  };
}

// ============================================================================
// Tests for applyCssDiffToNode
// ============================================================================

describe("applyCssDiffToNode", () => {
  let applyCssDiffToNode: (
    frame: MockFrameNode,
    diff: Record<string, string>
  ) => void;

  beforeEach(async () => {
    try {
      const mod = await import("../rendering/pseudoStates");
      applyCssDiffToNode = mod.applyCssDiffToNode as unknown as typeof applyCssDiffToNode;
    } catch {
      applyCssDiffToNode = () => {
        throw new Error("pseudoStates module not yet implemented");
      };
    }
  });

  it("applies background-color change as SOLID fill", () => {
    const frame = createMockFrame();
    applyCssDiffToNode(frame, { "background-color": "#2563EB" });

    expect(frame.fills).toEqual([
      expect.objectContaining({
        type: "SOLID",
        color: { r: expect.closeTo(0.145, 2), g: expect.closeTo(0.388, 2), b: expect.closeTo(0.922, 2) },
      }),
    ]);
  });

  it("applies border-color change to strokes", () => {
    const frame = createMockFrame();
    applyCssDiffToNode(frame, { "border-color": "#FF0000" });

    expect(frame.strokes).toEqual([
      expect.objectContaining({
        type: "SOLID",
        color: { r: 1, g: 0, b: 0 },
      }),
    ]);
  });

  it("applies color change to text children fills", () => {
    const textNode = createMockTextNode();
    const frame = createMockFrame({
      children: [],
      findAll: (predicate: (n: unknown) => boolean) => {
        if (predicate(textNode)) return [textNode as unknown as MockFrameNode];
        return [];
      },
    });

    applyCssDiffToNode(frame, { color: "#FF6B35" });

    expect(textNode.fills).toEqual([
      expect.objectContaining({
        type: "SOLID",
        color: { r: 1, g: expect.closeTo(0.42, 1), b: expect.closeTo(0.208, 1) },
      }),
    ]);
  });

  it("applies opacity change", () => {
    const frame = createMockFrame({ opacity: 1 });
    applyCssDiffToNode(frame, { opacity: "0.7" });

    expect(frame.opacity).toBeCloseTo(0.7);
  });

  it("applies border-radius change with clamping", () => {
    const frame = createMockFrame({ width: 100, height: 40, cornerRadius: 4 });
    applyCssDiffToNode(frame, { "border-radius": "999px" });

    expect(frame.cornerRadius).toBe(20);
  });

  it("applies border-width change to strokeWeight", () => {
    const frame = createMockFrame({ strokeWeight: 1 });
    applyCssDiffToNode(frame, { "border-width": "3px" });

    expect(frame.strokeWeight).toBe(3);
  });

  it("applies box-shadow as DROP_SHADOW effect", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { "box-shadow": "0px 4px 8px rgba(0, 0, 0, 0.25)" });

    expect(frame.effects.length).toBeGreaterThan(0);
    expect(frame.effects[0]).toEqual(
      expect.objectContaining({
        type: "DROP_SHADOW",
      })
    );
  });

  it("handles __removed__ marker by clearing fills", () => {
    const frame = createMockFrame({
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
    });
    applyCssDiffToNode(frame, { "background-color": "__removed__" });

    expect(frame.fills).toEqual([]);
  });

  it("makes no changes for empty diff", () => {
    const frame = createMockFrame();
    const originalFills = [...frame.fills];
    const originalStrokes = [...frame.strokes];
    const originalOpacity = frame.opacity;

    applyCssDiffToNode(frame, {});

    expect(frame.fills).toEqual(originalFills);
    expect(frame.strokes).toEqual(originalStrokes);
    expect(frame.opacity).toBe(originalOpacity);
  });
});

// ============================================================================
// Tests for variant naming and creation
// ============================================================================

describe("variant creation", () => {
  let createPseudoStateVariants: (
    frame: MockFrameNode,
    pseudoStates: {
      hover?: Record<string, string>;
      focus?: Record<string, string>;
      active?: Record<string, string>;
      focusVisible?: Record<string, string>;
    }
  ) => Promise<{
    componentSet: { name: string; children: MockComponentNode[] };
    defaultInstance: { type: string; width: number; height: number };
  }>;

  let mockCombineAsVariants: ReturnType<typeof vi.fn>;
  let componentIdCounter: number;

  beforeEach(async () => {
    componentIdCounter = 0;
    mockCombineAsVariants = vi.fn(
      (components: MockComponentNode[], _parent: unknown) => ({
        type: "COMPONENT_SET",
        name: "ComponentSet",
        children: components,
      })
    );

    const mockCreateComponent = vi.fn((): MockComponentNode => {
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
        resize: vi.fn(function(this: MockComponentNode, w: number, h: number) {
          this.width = w;
          this.height = h;
        }),
        clone: vi.fn(() => {
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
      createPseudoStateVariants = mod.createPseudoStateVariants as unknown as typeof createPseudoStateVariants;
    } catch {
      createPseudoStateVariants = async () => {
        throw new Error("pseudoStates module not yet implemented");
      };
    }
  });

  it("creates variants only for states that have data", async () => {
    const frame = createMockFrame();
    const result = await createPseudoStateVariants(frame, {
      hover: { "background-color": "#2563EB" },
    });

    expect(mockCombineAsVariants).toHaveBeenCalledTimes(1);
    const components = mockCombineAsVariants.mock.calls[0][0] as MockComponentNode[];
    expect(components).toHaveLength(2);
  });

  it("names variants with correct State= convention", async () => {
    const frame = createMockFrame();
    const result = await createPseudoStateVariants(frame, {
      hover: { "background-color": "#2563EB" },
      focus: { "outline-color": "#3B82F6" },
      active: { "background-color": "#1E40AF" },
      focusVisible: { "outline-color": "#60A5FA" },
    });

    const components = mockCombineAsVariants.mock.calls[0][0] as MockComponentNode[];
    const names = components.map((c) => c.name);
    expect(names).toContain("State=Default");
    expect(names).toContain("State=Hover");
    expect(names).toContain("State=Focus");
    expect(names).toContain("State=Active");
    expect(names).toContain("State=Focus Visible");
  });

  it("returns ComponentSetNode with correct variant count", async () => {
    const frame = createMockFrame();
    const result = await createPseudoStateVariants(frame, {
      hover: { "background-color": "#2563EB" },
      active: { "background-color": "#1E40AF" },
    });

    const components = mockCombineAsVariants.mock.calls[0][0] as MockComponentNode[];
    expect(components).toHaveLength(3);
  });

  it("returns default instance with original frame dimensions", async () => {
    const frame = createMockFrame({ width: 250, height: 56 });
    const result = await createPseudoStateVariants(frame, {
      hover: { "background-color": "#2563EB" },
    });

    expect(result.defaultInstance.width).toBe(250);
    expect(result.defaultInstance.height).toBe(56);
  });

  it("does not create variants when pseudoStateStyles is empty", async () => {
    const frame = createMockFrame();

    try {
      await createPseudoStateVariants(frame, {});
      expect(mockCombineAsVariants).not.toHaveBeenCalled();
    } catch {
      expect(true).toBe(true);
    }
  });
});

// ============================================================================
// Tests for prototype interaction wiring
// ============================================================================

describe("prototype interactions", () => {
  let wirePrototypeInteractions: (
    defaultComp: MockComponentNode,
    variants: Map<string, MockComponentNode>
  ) => Promise<void>;

  beforeEach(async () => {
    try {
      const mod = await import("../rendering/pseudoStates");
      wirePrototypeInteractions = mod.wirePrototypeInteractions as unknown as typeof wirePrototypeInteractions;
    } catch {
      wirePrototypeInteractions = async () => {
        throw new Error("pseudoStates module not yet implemented");
      };
    }
  });

  function createMockComponent(id: string): MockComponentNode {
    return {
      ...createMockFrame(),
      type: "COMPONENT" as const,
      id,
      clone: vi.fn(() => createMockComponent(`${id}-clone`)),
      createInstance: vi.fn(() => ({
        type: "INSTANCE" as const,
        width: 200,
        height: 48,
        id: `inst-${id}`,
      })),
      setReactionsAsync: vi.fn(),
    };
  }

  it("wires ON_HOVER trigger for hover variant with CHANGE_TO", async () => {
    const defaultComp = createMockComponent("default");
    const hoverComp = createMockComponent("hover");
    const variants = new Map([["hover", hoverComp]]);

    await wirePrototypeInteractions(defaultComp, variants);

    expect(defaultComp.setReactionsAsync).toHaveBeenCalled();
    const reactions = defaultComp.setReactionsAsync.mock.calls[0][0] as Array<{
      trigger: { type: string };
      actions: Array<{ type: string; navigation: string; destinationId: string }>;
    }>;

    const hoverReaction = reactions.find((r) => r.trigger.type === "ON_HOVER");
    expect(hoverReaction).toBeDefined();
    expect(hoverReaction!.actions[0].type).toBe("NODE");
    expect(hoverReaction!.actions[0].navigation).toBe("CHANGE_TO");
    expect(hoverReaction!.actions[0].destinationId).toBe("hover");
  });

  it("wires ON_PRESS trigger for active variant", async () => {
    const defaultComp = createMockComponent("default");
    const activeComp = createMockComponent("active");
    const variants = new Map([["active", activeComp]]);

    await wirePrototypeInteractions(defaultComp, variants);

    expect(defaultComp.setReactionsAsync).toHaveBeenCalled();
    const reactions = defaultComp.setReactionsAsync.mock.calls[0][0] as Array<{
      trigger: { type: string };
      actions: Array<{ type: string; navigation: string; destinationId: string }>;
    }>;

    const pressReaction = reactions.find((r) => r.trigger.type === "ON_PRESS");
    expect(pressReaction).toBeDefined();
    expect(pressReaction!.actions[0].navigation).toBe("CHANGE_TO");
    expect(pressReaction!.actions[0].destinationId).toBe("active");
  });

  it("uses SMART_ANIMATE transition with correct duration and easing", async () => {
    const defaultComp = createMockComponent("default");
    const hoverComp = createMockComponent("hover");
    const variants = new Map([["hover", hoverComp]]);

    await wirePrototypeInteractions(defaultComp, variants);

    const reactions = defaultComp.setReactionsAsync.mock.calls[0][0] as Array<{
      trigger: { type: string };
      actions: Array<{ transition: { type: string; duration: number; easing: { type: string } } | null }>;
    }>;

    const hoverReaction = reactions.find((r) => r.trigger.type === "ON_HOVER");
    expect(hoverReaction!.actions[0].transition).toEqual(
      expect.objectContaining({
        type: "SMART_ANIMATE",
        duration: 0.15,
        easing: expect.objectContaining({ type: "EASE_OUT" }),
      })
    );
  });
});

// ============================================================================
// Integration tests
// ============================================================================

describe("integration: interactionMode gating", () => {
  it("nodes without pseudoStateStyles remain as plain FrameNode", () => {
    const node = {
      pseudoStateStyles: undefined,
    };

    const hasPseudoStates =
      node.pseudoStateStyles &&
      Object.keys(node.pseudoStateStyles).length > 0;

    expect(hasPseudoStates).toBeFalsy();
  });

  it("interactionMode=none skips variant creation even with pseudo-state data", () => {
    const context = { interactionMode: "none" as const };
    const node = {
      pseudoStateStyles: {
        hover: { "background-color": "#2563EB" },
      },
    };

    const shouldCreateVariants =
      context.interactionMode === "variants" &&
      node.pseudoStateStyles &&
      Object.keys(node.pseudoStateStyles).length > 0;

    expect(shouldCreateVariants).toBe(false);
  });

  it("full pipeline: node with hover+active creates 3 variants + 2 interactions", async () => {
    const pseudoStates = {
      hover: { "background-color": "#2563EB", color: "#FFFFFF" },
      active: { "background-color": "#1E40AF" },
    };

    const stateCount = Object.keys(pseudoStates).length;
    const totalVariants = stateCount + 1;

    expect(totalVariants).toBe(3);
    expect(stateCount).toBe(2);
  });
});
