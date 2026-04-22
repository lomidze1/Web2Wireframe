/**
 * Tests for h2d-aligned hover ComponentSet consolidation (Pass 1).
 *
 * Strategy:
 * - Pure-logic tests run without figma globals: childrenStructureSignature,
 *   collectHoverables, collectTextValues.
 * - Registry tests stub figma.createComponent / combineAsVariants /
 *   addComponentProperty and verify the structure of masters produced.
 *
 * Mirrors the mocking pattern from pseudo-state-variants.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, WireframeFrame } from "../types";

// ---------------------------------------------------------------------------
// WireframeNode factory
// ---------------------------------------------------------------------------

function makeWfNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: `wf-${Math.random().toString(36).slice(2, 8)}`,
    name: "node",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
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

function textNode(text: string, overrides: Partial<WireframeNode> = {}): WireframeNode {
  return makeWfNode({
    type: "text",
    tag: "span",
    textContent: text,
    ...overrides,
  });
}

function makeFrame(tree: WireframeNode): WireframeFrame {
  return {
    viewportWidth: 1440,
    hostname: "example.com",
    tree,
  } as WireframeFrame;
}

// ---------------------------------------------------------------------------
// Pure logic: collectHoverables
// ---------------------------------------------------------------------------

describe("collectHoverables", () => {
  let collectHoverables: (frames: WireframeFrame[]) => WireframeNode[];

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    collectHoverables = mod.collectHoverables;
  });

  it("returns only nodes with pseudoStateStyles.hover", () => {
    const tree = makeWfNode({
      children: [
        makeWfNode({ name: "a", pseudoStateStyles: { hover: { color: "red" } } }),
        makeWfNode({ name: "b" }), // no hover
        makeWfNode({ name: "c", pseudoStateStyles: { focus: { color: "blue" } } }), // only focus
      ],
    });
    const result = collectHoverables([makeFrame(tree)]);
    expect(result.map((n) => n.name)).toEqual(["a"]);
  });

  it("walks nested children in DFS order", () => {
    const deepChild = makeWfNode({
      name: "deep",
      pseudoStateStyles: { hover: { color: "green" } },
    });
    const tree = makeWfNode({
      name: "root",
      pseudoStateStyles: { hover: { color: "red" } },
      children: [
        makeWfNode({
          name: "mid",
          children: [deepChild],
        }),
      ],
    });
    const result = collectHoverables([makeFrame(tree)]);
    expect(result.map((n) => n.name)).toEqual(["root", "deep"]);
  });

  it("handles multiple frames", () => {
    const f1 = makeFrame(
      makeWfNode({ name: "f1", pseudoStateStyles: { hover: { color: "red" } } }),
    );
    const f2 = makeFrame(
      makeWfNode({ name: "f2", pseudoStateStyles: { hover: { color: "blue" } } }),
    );
    const result = collectHoverables([f1, f2]);
    expect(result.map((n) => n.name)).toEqual(["f1", "f2"]);
  });

  it("returns empty array when no hoverables", () => {
    const tree = makeWfNode({ children: [makeWfNode(), makeWfNode()] });
    expect(collectHoverables([makeFrame(tree)])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pure logic: childrenStructureSignature
// ---------------------------------------------------------------------------

describe("childrenStructureSignature", () => {
  let childrenStructureSignature: (node: WireframeNode) => string;

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    childrenStructureSignature = mod.childrenStructureSignature;
  });

  it("returns identical signatures for structurally-identical nodes with different text", () => {
    const a = makeWfNode({ children: [textNode("Start Free")] });
    const b = makeWfNode({ children: [textNode("Get Plus")] });
    expect(childrenStructureSignature(a)).toBe(childrenStructureSignature(b));
  });

  it('returns "text-only" for text-only and "has-image" for icon+text (h2d 2-bucket)', () => {
    const textOnly = makeWfNode({ children: [textNode("Click")] });
    const iconPlusText = makeWfNode({
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        textNode("Click"),
      ],
    });
    expect(childrenStructureSignature(textOnly)).toBe("text-only");
    expect(childrenStructureSignature(iconPlusText)).toBe("has-image");
  });

  it("merges varying text-only shapes into one bucket (frame-child vs direct-text)", () => {
    // h2d collapses: a text node, an element with a text child, a frame with
    // a nested div — all map to "text-only" if none contain images.
    const plainText = textNode("Docs");
    const withTextChild = makeWfNode({ children: [textNode("Pricing")] });
    const withNestedFrame = makeWfNode({
      children: [
        makeWfNode({ tag: "div", children: [textNode("How it works")] }),
      ],
    });
    const sigs = new Set([
      childrenStructureSignature(plainText),
      childrenStructureSignature(withTextChild),
      childrenStructureSignature(withNestedFrame),
    ]);
    expect(sigs.size).toBe(1);
    expect(sigs.has("text-only")).toBe(true);
  });

  it("treats SVG descendants as images too", () => {
    const node = makeWfNode({
      children: [
        makeWfNode({ type: "placeholder", tag: "svg" }),
        textNode("Badge"),
      ],
    });
    expect(childrenStructureSignature(node)).toBe("has-image");
  });

  it("finds images at any depth within the 3-level search range", () => {
    const deepImg = makeWfNode({
      children: [
        makeWfNode({
          children: [
            makeWfNode({
              children: [makeWfNode({ type: "placeholder", tag: "img" })],
            }),
          ],
        }),
      ],
    });
    expect(childrenStructureSignature(deepImg)).toBe("has-image");
  });

  it("returns a stable string for empty children (no-child elements)", () => {
    const a = makeWfNode();
    const b = makeWfNode();
    expect(childrenStructureSignature(a)).toBe(childrenStructureSignature(b));
    expect(childrenStructureSignature(a)).toBe("text-only");
  });
});

// ---------------------------------------------------------------------------
// Pure logic: collectTextValues
// ---------------------------------------------------------------------------

describe("collectTextValues", () => {
  let collectTextValues: (node: WireframeNode) => string[];

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    collectTextValues = mod.collectTextValues;
  });

  it("returns DFS-ordered text contents of all text descendants", () => {
    const tree = makeWfNode({
      children: [
        textNode("First"),
        makeWfNode({
          children: [textNode("Nested")],
        }),
        textNode("Last"),
      ],
    });
    expect(collectTextValues(tree)).toEqual(["First", "Nested", "Last"]);
  });

  it("returns empty array for non-text, no-text-children node", () => {
    expect(collectTextValues(makeWfNode())).toEqual([]);
  });

  it("returns a single-element array for a text node itself", () => {
    expect(collectTextValues(textNode("Only"))).toEqual(["Only"]);
  });
});

// ---------------------------------------------------------------------------
// Figma-integration: buildHoverMasterRegistry
// ---------------------------------------------------------------------------

describe("buildHoverMasterRegistry", () => {
  let buildHoverMasterRegistry: typeof import("../rendering/hoverConsolidation").buildHoverMasterRegistry;
  let lookupHoverMaster: typeof import("../rendering/hoverConsolidation").lookupHoverMaster;

  let mockCombineAsVariants: ReturnType<typeof vi.fn>;
  let mockCreateComponent: ReturnType<typeof vi.fn>;
  let mockAddComponentProperty: ReturnType<typeof vi.fn>;
  let componentIdCounter: number;
  let propIdCounter: number;

  beforeEach(async () => {
    componentIdCounter = 0;
    propIdCounter = 0;

    const makeMockComp = () => {
      const id = `comp-${++componentIdCounter}`;
      const comp: Record<string, unknown> = {
        type: "COMPONENT",
        id,
        name: "",
        fills: [],
        strokes: [],
        effects: [],
        opacity: 1,
        cornerRadius: 0,
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        width: 100,
        height: 40,
        children: [] as unknown[],
        componentPropertyReferences: {} as Record<string, string>,
        resize: vi.fn(),
        appendChild: vi.fn(),
        findAll: vi.fn(() => [] as unknown[]),
        clone: vi.fn(() => makeMockComp()),
        createInstance: vi.fn(() => ({
          type: "INSTANCE",
          id: `inst-${id}`,
          width: 100,
          height: 40,
          resize: vi.fn(),
          setProperties: vi.fn(),
          componentProperties: {},
        })),
        setReactionsAsync: vi.fn(),
        reactions: [] as unknown[],
      };
      return comp;
    };

    mockCreateComponent = vi.fn(makeMockComp);

    mockAddComponentProperty = vi.fn(
      (_name: string, _type: string, _defaultValue: string) => {
        const id = `Prop#${++propIdCounter}:0`;
        return id;
      },
    );

    mockCombineAsVariants = vi.fn(
      (components: Array<Record<string, unknown>>, _parent: unknown) => {
        const cs: Record<string, unknown> = {
          type: "COMPONENT_SET",
          id: `cs-${++componentIdCounter}`,
          name: "ComponentSet",
          children: components,
          componentPropertyDefinitions: {} as Record<
            string,
            { type: string; defaultValue: string; variantOptions?: string[] }
          >,
          addComponentProperty: mockAddComponentProperty,
          findOne: vi.fn((pred: (n: unknown) => boolean) =>
            components.find(pred),
          ),
        };
        // Derive variant property defs from names (simulating Figma's auto-population).
        const props: Record<string, Set<string>> = {};
        for (const c of components) {
          const name = c.name as string;
          const parts = name.split(/\s*,\s*/);
          for (const p of parts) {
            const [k, v] = p.split("=");
            if (!k || v === undefined) continue;
            (props[k] = props[k] || new Set()).add(v);
          }
        }
        const defs = cs.componentPropertyDefinitions as Record<
          string,
          { type: string; defaultValue: string; variantOptions?: string[] }
        >;
        for (const [k, vs] of Object.entries(props)) {
          const arr = Array.from(vs);
          defs[k] = { type: "VARIANT", defaultValue: arr[0], variantOptions: arr };
        }
        return cs;
      },
    );

    (globalThis as Record<string, unknown>).figma = {
      createComponent: mockCreateComponent,
      combineAsVariants: mockCombineAsVariants,
      currentPage: { appendChild: vi.fn() },
    };

    const mod = await import("../rendering/hoverConsolidation");
    buildHoverMasterRegistry = mod.buildHoverMasterRegistry;
    lookupHoverMaster = mod.lookupHoverMaster;
  });

  function minimalContext() {
    return {
      interactionMode: "variants" as const,
      componentSets: [],
      hoverMasterRegistry: undefined,
    } as never;
  }

  it("produces 2 category buckets for mixed icon+text / text-only hoverables", async () => {
    const brandTop = makeWfNode({
      name: "brand-top",
      pseudoStateStyles: { hover: { "background-color": "#eee" } },
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        textNode("Web2Wireframe"),
      ],
    });
    const brandBottom = makeWfNode({
      name: "brand-bottom",
      pseudoStateStyles: { hover: { "background-color": "#eee" } },
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        textNode("Web2Wireframe"),
      ],
    });
    const btn1 = makeWfNode({
      name: "btn-primary-a",
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Upgrade to Pro")],
    });
    const btn2 = makeWfNode({
      name: "btn-primary-b",
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Get Pro")],
    });
    const btn3 = makeWfNode({
      name: "btn-secondary-a",
      backgroundColor: "#eee",
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Start Free")],
    });
    const btn4 = makeWfNode({
      name: "btn-secondary-b",
      backgroundColor: "#eee",
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Get Plus")],
    });
    const root = makeWfNode({
      name: "root",
      children: [brandTop, btn1, btn2, btn3, btn4, brandBottom],
    });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    expect(registry.size).toBe(2);
  });

  it("text-only category exposes 2 variant values (primary + secondary)", async () => {
    const btn1 = makeWfNode({
      name: "btn-primary-a",
      fills: [{ type: "SOLID", color: { r: 0, g: 0.4, b: 1, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Upgrade to Pro")],
    });
    const btn2 = makeWfNode({
      name: "btn-primary-b",
      fills: [{ type: "SOLID", color: { r: 0, g: 0.4, b: 1, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Get Pro")],
    });
    const btn3 = makeWfNode({
      name: "btn-secondary",
      fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Start Free")],
    });
    const root = makeWfNode({ children: [btn1, btn2, btn3] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    const entry = Array.from(registry.values())[0];
    expect(entry.variantByVisualSig.size).toBe(2);
  });

  it("master ComponentSet contains N x 2 variants (N visual sigs × :hover)", async () => {
    const btn1 = makeWfNode({
      fills: [{ type: "SOLID", color: { r: 0, g: 0.4, b: 1, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("A")],
    });
    const btn2 = makeWfNode({
      fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("B")],
    });
    const root = makeWfNode({ children: [btn1, btn2] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<{ name: string }>;
    expect(variants).toHaveLength(4);
    const names = variants.map((v) => v.name).sort();
    expect(names).toEqual([
      "variant=1, :hover=false",
      "variant=1, :hover=true",
      "variant=2, :hover=false",
      "variant=2, :hover=true",
    ]);
  });

  it("creates TEXT component properties for text children", async () => {
    const btn = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Hello")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    const entry = Array.from(registry.values())[0];
    expect(entry.textPropIds.length).toBe(1);
    expect(entry.textPropIds[0]).toMatch(/^Prop#\d+:0$/);
    expect(mockAddComponentProperty).toHaveBeenCalledWith(
      expect.any(String),
      "TEXT",
      "Hello",
    );
  });

  it("R2 alpha quantization: nav links with jittery hover alphas merge into 1 variant", async () => {
    // Simulates real-world capture where three nav links catch slightly
    // different mid-transition alpha values for the same hover background.
    // With R2's 5% alpha quantization, all three should dedupe to a single
    // variant (not 3 separate ones).
    const n1 = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.034)" },
      },
      children: [textNode("How it works")],
    });
    const n2 = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.048)" },
      },
      children: [textNode("Pricing")],
    });
    const n3 = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.071)" },
      },
      children: [textNode("Docs")],
    });
    const root = makeWfNode({ children: [n1, n2, n3] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    expect(registry.size).toBe(1);
    const entry = Array.from(registry.values())[0];
    // All 3 nav links map to the same variant number (1), because their
    // quantized hover-diffs are all the same.
    expect(entry.variantByVisualSig.size).toBe(1);
  });

  it("R4 fixed-column grid: rest at x=0, hover at x=maxRestWidth+GAP, rows by variant idx", async () => {
    // Two variants of DIFFERENT widths. Expected layout:
    //   variant=1 rest at x=0, y=0
    //   variant=1 hover at x=maxRestWidth+40, y=0
    //   variant=2 rest at x=0, y=(row-height+40)
    //   variant=2 hover at x=maxRestWidth+40, y=(row-height+40)
    // All "hover" variants should share the same x column (fixed), not
    // per-component shifted.
    const widePrimary = makeWfNode({
      name: "wide-primary",
      width: 300,
      fills: [{ type: "SOLID", color: { r: 0, g: 0.4, b: 1, a: 1 } }] as never,
      pseudoStateStyles: { hover: { "background-color": "rgba(0, 0, 0, 0.1)" } },
      children: [textNode("Upgrade Now")],
    });
    const narrowSecondary = makeWfNode({
      name: "narrow-secondary",
      width: 120,
      fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }] as never,
      pseudoStateStyles: { hover: { "background-color": "rgba(0, 0, 0, 0.1)" } },
      children: [textNode("Go")],
    });
    const root = makeWfNode({ children: [widePrimary, narrowSecondary] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<{
      name: string; x: number; y: number;
    }>;
    const byName: Record<string, { x: number; y: number }> = {};
    for (const v of variants) byName[v.name] = { x: v.x, y: v.y };

    // All rest variants share x=0
    expect(byName["variant=1, :hover=false"].x).toBe(0);
    expect(byName["variant=2, :hover=false"].x).toBe(0);
    // All hover variants share the SAME x — maxRestWidth + 40 (in mock, both
    // clones have width=100, since mock doesn't propagate the original
    // WireframeNode width). The important invariant: both hover variants
    // have the SAME x coordinate (not per-component).
    expect(byName["variant=1, :hover=true"].x).toBe(
      byName["variant=2, :hover=true"].x,
    );
    expect(byName["variant=1, :hover=true"].x).toBeGreaterThan(0);
    // Variant rows stack vertically: variant=2 row > variant=1 row.
    expect(byName["variant=2, :hover=false"].y).toBeGreaterThan(
      byName["variant=1, :hover=false"].y,
    );
  });
});

// ---------------------------------------------------------------------------
// Figma-integration: lookupHoverMaster
// ---------------------------------------------------------------------------

describe("lookupHoverMaster", () => {
  let buildHoverMasterRegistry: typeof import("../rendering/hoverConsolidation").buildHoverMasterRegistry;
  let lookupHoverMaster: typeof import("../rendering/hoverConsolidation").lookupHoverMaster;

  beforeEach(async () => {
    // Reuse mock infrastructure from the describe above
    const mockCreateComponent = vi.fn(() => {
      const id = Math.random().toString(36).slice(2, 8);
      return {
        type: "COMPONENT",
        id,
        name: "",
        fills: [],
        strokes: [],
        effects: [],
        opacity: 1,
        cornerRadius: 0,
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        width: 100,
        height: 40,
        children: [],
        componentPropertyReferences: {},
        resize: vi.fn(),
        appendChild: vi.fn(),
        findAll: vi.fn(() => []),
        clone: vi.fn(() => mockCreateComponent()),
        createInstance: vi.fn(),
        setReactionsAsync: vi.fn(),
        reactions: [],
      };
    });
    const mockCombineAsVariants = vi.fn(
      (components: Array<Record<string, unknown>>) => {
        return {
          type: "COMPONENT_SET",
          id: `cs-${Math.random().toString(36).slice(2, 6)}`,
          name: "ComponentSet",
          children: components,
          componentPropertyDefinitions: {},
          addComponentProperty: vi.fn(
            (name: string) => `${name}#1:0`,
          ),
          findOne: vi.fn((pred: (n: unknown) => boolean) => components.find(pred)),
        };
      },
    );

    (globalThis as Record<string, unknown>).figma = {
      createComponent: mockCreateComponent,
      combineAsVariants: mockCombineAsVariants,
      currentPage: { appendChild: vi.fn() },
    };

    const mod = await import("../rendering/hoverConsolidation");
    buildHoverMasterRegistry = mod.buildHoverMasterRegistry;
    lookupHoverMaster = mod.lookupHoverMaster;
  });

  it("returns matching entry + variant index + text values for hoverable node", async () => {
    const btn = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Click Me")],
    });
    const root = makeWfNode({ children: [btn] });
    const ctx = {
      interactionMode: "variants" as const,
      componentSets: [],
      hoverMasterRegistry: undefined,
    } as never;

    const registry = await buildHoverMasterRegistry([makeFrame(root)], ctx);
    const lookup = lookupHoverMaster(btn, registry);

    expect(lookup).not.toBeNull();
    expect(lookup!.variantIndex).toBe(1);
    expect(lookup!.textValues).toEqual(["Click Me"]);
  });

  it("returns null for nodes without hover", async () => {
    const nonHover = makeWfNode({ children: [textNode("Nope")] });
    const root = makeWfNode({ children: [nonHover] });
    const ctx = {
      interactionMode: "variants" as const,
      componentSets: [],
      hoverMasterRegistry: undefined,
    } as never;

    const registry = await buildHoverMasterRegistry([makeFrame(root)], ctx);
    const lookup = lookupHoverMaster(nonHover, registry);
    expect(lookup).toBeNull();
  });
});
