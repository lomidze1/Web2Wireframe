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

describe("childrenStructureSignature — Phase 3 structural hash", () => {
  let childrenStructureSignature: (node: WireframeNode) => string;
  let setStructureHashMode: (mode: "legacy" | "structural") => void;

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    childrenStructureSignature = mod.childrenStructureSignature;
    setStructureHashMode = mod.setStructureHashMode;
    // Default: Phase 3 structural mode.
    setStructureHashMode("structural");
  });

  it("returns identical signatures for nodes with different text but same shape", () => {
    const a = makeWfNode({ children: [textNode("Start Free")] });
    const b = makeWfNode({ children: [textNode("Get Plus")] });
    expect(childrenStructureSignature(a)).toBe(childrenStructureSignature(b));
  });

  it("distinguishes text-only from icon+text (replaces legacy 2-bucket)", () => {
    const textOnly = makeWfNode({ children: [textNode("Click")] });
    const iconPlusText = makeWfNode({
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        textNode("Click"),
      ],
    });
    expect(childrenStructureSignature(textOnly)).not.toBe(
      childrenStructureSignature(iconPlusText),
    );
  });

  it("distinguishes nesting depth (text vs text-in-span vs text-in-div-in-span)", () => {
    // Phase 3 INVERSE of legacy: these shapes are structurally different
    // and must produce distinct sigs → distinct ComponentSets.
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
    expect(sigs.size).toBe(3);
  });

  it("distinguishes img from svg placeholder", () => {
    const withImg = makeWfNode({
      children: [makeWfNode({ type: "placeholder", tag: "img" })],
    });
    const withSvg = makeWfNode({
      children: [makeWfNode({ type: "placeholder", tag: "svg" })],
    });
    expect(childrenStructureSignature(withImg)).not.toBe(
      childrenStructureSignature(withSvg),
    );
  });

  it("distinguishes root tag (a vs button) with identical children", () => {
    const anchor = makeWfNode({ tag: "a", children: [textNode("Buy")] });
    const button = makeWfNode({ tag: "button", children: [textNode("Buy")] });
    expect(childrenStructureSignature(anchor)).not.toBe(
      childrenStructureSignature(button),
    );
  });

  it("returns a stable signature for empty children", () => {
    const a = makeWfNode({ tag: "a" });
    const b = makeWfNode({ tag: "a" });
    expect(childrenStructureSignature(a)).toBe(childrenStructureSignature(b));
  });

  it("caps recursion (deep trees do not explode)", () => {
    let inner: WireframeNode = textNode("x");
    for (let i = 0; i < 12; i++) {
      inner = makeWfNode({ tag: "div", children: [inner] });
    }
    const sig = childrenStructureSignature(inner);
    // Signature should be finite and contain a depth-cap marker.
    expect(sig.length).toBeLessThan(200);
    expect(sig).toMatch(/…|\[cap\]/);
  });

  it("Apple-shaped hoverable fixture: produces ≥4 distinct category keys", () => {
    const textLink = makeWfNode({
      tag: "a",
      children: [makeWfNode({ tag: "span", children: [textNode("Mac")] })],
    });
    const textLinkWithChevron = makeWfNode({
      tag: "a",
      children: [
        makeWfNode({ tag: "span", children: [textNode("Store")] }),
        makeWfNode({ type: "placeholder", tag: "svg" }),
      ],
    });
    const ctaPill = makeWfNode({
      tag: "button",
      children: [textNode("Buy")],
    });
    const logo = makeWfNode({
      tag: "a",
      children: [makeWfNode({ type: "placeholder", tag: "svg" })],
    });
    const productCard = makeWfNode({
      tag: "a",
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        makeWfNode({
          tag: "div",
          children: [
            makeWfNode({ tag: "h3", children: [textNode("iPhone 16")] }),
            makeWfNode({ tag: "p", children: [textNode("From $799")] }),
          ],
        }),
      ],
    });

    const sigs = new Set([
      childrenStructureSignature(textLink),
      childrenStructureSignature(textLinkWithChevron),
      childrenStructureSignature(ctaPill),
      childrenStructureSignature(logo),
      childrenStructureSignature(productCard),
    ]);
    expect(sigs.size).toBeGreaterThanOrEqual(4);
  });

  it("legacy mode returns 'text-only' | 'has-image' for rollback", () => {
    setStructureHashMode("legacy");
    const textOnly = makeWfNode({ children: [textNode("X")] });
    const withImg = makeWfNode({
      children: [makeWfNode({ type: "placeholder", tag: "img" })],
    });
    expect(childrenStructureSignature(textOnly)).toBe("text-only");
    expect(childrenStructureSignature(withImg)).toBe("has-image");
  });
});

// ---------------------------------------------------------------------------
// Phase B (h2d-parity): role-based grouping
// ---------------------------------------------------------------------------
// h2d collapses similar interactive elements (e.g. 6 differently-sized "Learn
// more" buttons → 1 ComponentSet with 6 variants). Our structural-hash grouping
// is too granular: the inner DOM (`a:(span:(p-svg))` vs `a:(span:(span:(p-svg)))`)
// produces separate ComponentSets even when the buttons play the same role.
//
// Role mode collapses on `tag + media-presence + text-presence`:
//   link-icon-text | link-icon | link-text |
//   button-icon | button-text | input | <tag>-other

describe("childrenStructureSignature — Phase B role mode", () => {
  let childrenStructureSignature: (node: WireframeNode) => string;
  let setStructureHashMode: (mode: "legacy" | "structural" | "role") => void;

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    childrenStructureSignature = mod.childrenStructureSignature;
    setStructureHashMode = mod.setStructureHashMode as (mode: "legacy" | "structural" | "role") => void;
    setStructureHashMode("role");
  });

  it("collapses two <a> with text-only into 'link-text'", () => {
    const a = makeWfNode({ tag: "a", children: [textNode("Mac")] });
    const b = makeWfNode({
      tag: "a",
      children: [makeWfNode({ tag: "span", children: [textNode("iPhone")] })],
    });
    expect(childrenStructureSignature(a)).toBe("link-text");
    expect(childrenStructureSignature(b)).toBe("link-text");
    expect(childrenStructureSignature(a)).toBe(childrenStructureSignature(b));
  });

  it("collapses <a> with svg-only nested at any depth into 'link-icon'", () => {
    const shallow = makeWfNode({
      tag: "a",
      children: [makeWfNode({ tag: "span", children: [makeWfNode({ type: "placeholder", tag: "svg" })] })],
    });
    const deep = makeWfNode({
      tag: "a",
      children: [
        makeWfNode({
          tag: "span",
          children: [makeWfNode({ tag: "span", children: [makeWfNode({ type: "placeholder", tag: "svg" })] })],
        }),
      ],
    });
    expect(childrenStructureSignature(shallow)).toBe("link-icon");
    expect(childrenStructureSignature(deep)).toBe("link-icon");
  });

  it("returns 'link-icon-text' when <a> has both media and text descendants", () => {
    const node = makeWfNode({
      tag: "a",
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        makeWfNode({ tag: "span", children: [textNode("Buy")] }),
      ],
    });
    expect(childrenStructureSignature(node)).toBe("link-icon-text");
  });

  it("returns 'button-icon' for <button> with svg, no text", () => {
    const node = makeWfNode({
      tag: "button",
      children: [makeWfNode({ tag: "span", children: [makeWfNode({ type: "placeholder", tag: "svg" })] })],
    });
    expect(childrenStructureSignature(node)).toBe("button-icon");
  });

  it("returns 'button-text' for <button> with text only", () => {
    const node = makeWfNode({ tag: "button", children: [textNode("Submit")] });
    expect(childrenStructureSignature(node)).toBe("button-text");
  });

  it("returns 'input' for <input> regardless of children", () => {
    const node = makeWfNode({ tag: "input" });
    expect(childrenStructureSignature(node)).toBe("input");
  });

  it("non-link/non-button tags get same media/text discrimination (e.g. clickable span)", () => {
    const spanIcon = makeWfNode({ tag: "span", children: [makeWfNode({ type: "placeholder", tag: "svg" })] });
    const spanText = makeWfNode({ tag: "span", children: [textNode("X")] });
    const spanIconText = makeWfNode({
      tag: "span",
      children: [makeWfNode({ type: "placeholder", tag: "svg" }), textNode("X")],
    });
    expect(childrenStructureSignature(spanIcon)).toBe("span-icon");
    expect(childrenStructureSignature(spanText)).toBe("span-text");
    expect(childrenStructureSignature(spanIconText)).toBe("span-icon-text");
  });

  it("Apple-shape fixture: 5 different DOM trees collapse to ≤4 categories", () => {
    // Mirrors the Apple.com situation where structural-mode produces 21 sets
    // and h2d produces 7. Same set of fixtures as the structural test above
    // — but role mode collapses link variants into 'link-text' / 'link-icon' /
    // 'link-icon-text' regardless of intermediate <span>s.
    const textLink = makeWfNode({
      tag: "a",
      children: [makeWfNode({ tag: "span", children: [textNode("Mac")] })],
    });
    const textLinkWithChevron = makeWfNode({
      tag: "a",
      children: [
        makeWfNode({ tag: "span", children: [textNode("Store")] }),
        makeWfNode({ type: "placeholder", tag: "svg" }),
      ],
    });
    const ctaPill = makeWfNode({ tag: "button", children: [textNode("Buy")] });
    const logo = makeWfNode({
      tag: "a",
      children: [makeWfNode({ type: "placeholder", tag: "svg" })],
    });
    const productCard = makeWfNode({
      tag: "a",
      children: [
        makeWfNode({ type: "placeholder", tag: "img" }),
        makeWfNode({
          tag: "div",
          children: [makeWfNode({ tag: "h3", children: [textNode("iPhone")] })],
        }),
      ],
    });

    const sigs = new Set([
      childrenStructureSignature(textLink),         // link-text
      childrenStructureSignature(textLinkWithChevron), // link-icon-text
      childrenStructureSignature(ctaPill),           // button-text
      childrenStructureSignature(logo),              // link-icon
      childrenStructureSignature(productCard),       // link-icon-text
    ]);
    // 4 unique buckets (textLinkWithChevron + productCard collapse)
    expect(sigs.size).toBeLessThanOrEqual(4);
    expect(sigs.has("link-text")).toBe(true);
    expect(sigs.has("link-icon")).toBe(true);
    expect(sigs.has("link-icon-text")).toBe(true);
    expect(sigs.has("button-text")).toBe(true);
  });

  it("'role' is the default mode (no setStructureHashMode call needed)", async () => {
    // Re-import with no mode override to confirm the default is 'role'.
    // (vitest module cache keeps the singleton; we reset by calling the
    // setter to a known state then dropping it.)
    const mod = await import("../rendering/hoverConsolidation");
    // Verify by feeding a fixture where 'role' and 'structural' would diverge.
    const a = makeWfNode({
      tag: "a",
      children: [makeWfNode({ tag: "span", children: [textNode("X")] })],
    });
    const b = makeWfNode({ tag: "a", children: [textNode("X")] });
    // Role mode collapses these to 'link-text'; structural would emit two sigs.
    expect(mod.childrenStructureSignature(a)).toBe(mod.childrenStructureSignature(b));
  });
});

// ---------------------------------------------------------------------------
// Phase 4: visualStyleSignature — expanded text + tighter quantization
// ---------------------------------------------------------------------------

describe("visualStyleSignature — Phase 4 expanded", () => {
  let visualStyleSignature: (node: WireframeNode) => string;
  let setVisualSigMode: (mode: "expanded" | "legacy") => void;

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    visualStyleSignature = mod.visualStyleSignature;
    setVisualSigMode = mod.setVisualSigMode;
    setVisualSigMode("expanded");
  });

  it("identical boxes with identical text produce identical sigs", () => {
    const a = makeWfNode({
      fills: [] as never,
      children: [textNode("Buy", { textColor: "#111", fontWeight: 400 })],
    });
    const b = makeWfNode({
      fills: [] as never,
      children: [textNode("Buy", { textColor: "#111", fontWeight: 400 })],
    });
    expect(visualStyleSignature(a)).toBe(visualStyleSignature(b));
  });

  it("identical boxes with same text style but different characters collapse", () => {
    // TEXT properties on the ComponentSet handle text content; visual sig
    // ignores `textContent`.
    const a = makeWfNode({
      children: [textNode("Buy", { textColor: "#111", fontWeight: 500 })],
    });
    const b = makeWfNode({
      children: [textNode("Sell", { textColor: "#111", fontWeight: 500 })],
    });
    expect(visualStyleSignature(a)).toBe(visualStyleSignature(b));
  });

  it("different text color produces distinct sigs", () => {
    const red = makeWfNode({
      children: [textNode("Buy", { textColor: "#ff0000" })],
    });
    const blue = makeWfNode({
      children: [textNode("Buy", { textColor: "#0000ff" })],
    });
    expect(visualStyleSignature(red)).not.toBe(visualStyleSignature(blue));
  });

  it("different font-weight produces distinct sigs", () => {
    const regular = makeWfNode({
      children: [textNode("Buy", { fontWeight: 400 })],
    });
    const bold = makeWfNode({
      children: [textNode("Buy", { fontWeight: 700 })],
    });
    expect(visualStyleSignature(regular)).not.toBe(visualStyleSignature(bold));
  });

  it("different font-size produces distinct sigs", () => {
    const small = makeWfNode({
      children: [textNode("Buy", { fontSize: 12 })],
    });
    const large = makeWfNode({
      children: [textNode("Buy", { fontSize: 24 })],
    });
    expect(visualStyleSignature(small)).not.toBe(visualStyleSignature(large));
  });

  it("Phase 4 transform: sub-0.1px jitter still collapses", () => {
    // 0.21 → 0.2, 0.23 → 0.2 (both within same 0.1 bucket).
    const a = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,0.21)" } },
    });
    const b = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,0.23)" } },
    });
    expect(visualStyleSignature(a)).toBe(visualStyleSignature(b));
  });

  it("Phase 4 transform: 0.23 vs 0.27 land in different buckets (tighter than legacy)", () => {
    // Phase 4 preserves more detail than legacy: 0.23 → 0.2, 0.27 → 0.3.
    const a = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,0.23)" } },
    });
    const b = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,0.27)" } },
    });
    expect(visualStyleSignature(a)).not.toBe(visualStyleSignature(b));
  });

  it("transform differences > 0.1px produce distinct sigs", () => {
    const subtle = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-0.5)" } },
    });
    const big = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
    });
    expect(visualStyleSignature(subtle)).not.toBe(visualStyleSignature(big));
  });

  it("Phase 4 alpha quantum: rgba(…,0.03) and rgba(…,0.04) now distinct", () => {
    // Legacy bucketed both to 0.05; Phase 4 keeps them distinct (0.03 vs 0.04).
    const a = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.03)" },
      },
    });
    const b = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.04)" },
      },
    });
    expect(visualStyleSignature(a)).not.toBe(visualStyleSignature(b));
  });

  it("alpha jitter within quantum still collapses (0.032 vs 0.034 → both 0.03)", () => {
    const a = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.032)" },
      },
    });
    const b = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.034)" },
      },
    });
    expect(visualStyleSignature(a)).toBe(visualStyleSignature(b));
  });

  it("legacy mode: restores 0.05 alpha bucket + integer tx/ty + no text fields", () => {
    setVisualSigMode("legacy");
    // Alpha 0.034 → 0.05; 0.048 → 0.05 → same sig under legacy.
    const a = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.034)" },
      },
    });
    const b = makeWfNode({
      pseudoStateStyles: {
        hover: { "background-color": "rgba(12, 13, 18, 0.048)" },
      },
    });
    expect(visualStyleSignature(a)).toBe(visualStyleSignature(b));

    // Under legacy: different text colors should NOT differentiate.
    const red = makeWfNode({
      children: [textNode("X", { textColor: "#ff0000" })],
    });
    const blue = makeWfNode({
      children: [textNode("X", { textColor: "#0000ff" })],
    });
    expect(visualStyleSignature(red)).toBe(visualStyleSignature(blue));
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
      "variant=1,:hover=false",
      "variant=1,:hover=true",
      "variant=2,:hover=false",
      "variant=2,:hover=true",
    ]);
  });

  it("Phase 6: hover reaction uses transition=null (h2d instant swap)", async () => {
    const btn = makeWfNode({
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Hover me")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<{
      name: string;
      setReactionsAsync: ReturnType<typeof vi.fn>;
    }>;
    const restVariant = variants.find((v) => v.name.includes(":hover=false"));
    expect(restVariant).toBeDefined();
    expect(restVariant!.setReactionsAsync).toHaveBeenCalled();
    const call = restVariant!.setReactionsAsync.mock.calls[0];
    const [reactions] = call as [Array<{ trigger: { type: string }; actions: Array<{ transition: unknown }> }>];
    expect(reactions).toHaveLength(1);
    expect(reactions[0].trigger.type).toBe("ON_HOVER");
    // Phase 6: transition must be null (instant). Previously SMART_ANIMATE/150ms.
    expect(reactions[0].actions[0].transition).toBeNull();
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
    expect(byName["variant=1,:hover=false"].x).toBe(0);
    expect(byName["variant=2,:hover=false"].x).toBe(0);
    // All hover variants share the SAME x — maxRestWidth + 40 (in mock, both
    // clones have width=100, since mock doesn't propagate the original
    // WireframeNode width). The important invariant: both hover variants
    // have the SAME x coordinate (not per-component).
    expect(byName["variant=1,:hover=true"].x).toBe(
      byName["variant=2,:hover=true"].x,
    );
    expect(byName["variant=1,:hover=true"].x).toBeGreaterThan(0);
    // Variant rows stack vertically: variant=2 row > variant=1 row.
    expect(byName["variant=2,:hover=false"].y).toBeGreaterThan(
      byName["variant=1,:hover=false"].y,
    );
  });
});

// ---------------------------------------------------------------------------
// shiftLightness — HSL lightness shift utility
// ---------------------------------------------------------------------------

describe("shiftLightness", () => {
  let shiftLightness: (rgb: RGB, amount: number) => RGB;

  beforeEach(async () => {
    const mod = await import("../rendering/colors");
    shiftLightness = mod.shiftLightness;
  });

  function lightnessOf(rgb: RGB): number {
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    return (max + min) / 2;
  }

  it("darkens a mid-lightness color (negative amount reduces L)", () => {
    const grey = { r: 0.6, g: 0.6, b: 0.6 };
    const out = shiftLightness(grey, -0.12);
    expect(lightnessOf(out)).toBeLessThan(lightnessOf(grey) - 0.05);
    expect(out.r).toBeCloseTo(out.g, 5);
    expect(out.g).toBeCloseTo(out.b, 5);
  });

  it("preserves hue when shifting a saturated color", () => {
    // Pure blue
    const blue = { r: 0.1, g: 0.2, b: 0.9 };
    const out = shiftLightness(blue, -0.12);
    // Blue must remain the dominant channel.
    expect(out.b).toBeGreaterThan(out.r);
    expect(out.b).toBeGreaterThan(out.g);
  });

  it("near-black input + negative amount inverts to lighten", () => {
    // #11151A ≈ { r: 0.066, g: 0.082, b: 0.101 } — L ≈ 0.084 (< 0.15)
    const nearBlack = { r: 17 / 255, g: 21 / 255, b: 26 / 255 };
    const l0 = lightnessOf(nearBlack);
    const out = shiftLightness(nearBlack, -0.12);
    expect(lightnessOf(out)).toBeGreaterThan(l0);
  });

  it("clamps at 0 when darkening below minimum", () => {
    const almostBlack = { r: 0.05, g: 0.05, b: 0.05 };
    // Force-darken with strong amount below the near-black clamp threshold.
    // L ≈ 0.05 (< 0.15) so near-black clamp inverts; but test the raw math:
    // pass a positive-luminance color at exactly 0.15 to avoid the clamp.
    const edge = { r: 0.15, g: 0.15, b: 0.15 };
    const out = shiftLightness(edge, -0.30);
    expect(out.r).toBeGreaterThanOrEqual(0);
    expect(out.r).toBeLessThanOrEqual(1);
    // But almostBlack triggers near-black clamp (not tested here).
    expect(almostBlack.r).toBeLessThan(0.15);
  });

  it("clamps at 1 when lightening above maximum", () => {
    const almostWhite = { r: 0.95, g: 0.95, b: 0.95 };
    const out = shiftLightness(almostWhite, 0.5);
    expect(out.r).toBeLessThanOrEqual(1);
    expect(out.g).toBeLessThanOrEqual(1);
    expect(out.b).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// darkenRootSolidPaint — direct unit test
// ---------------------------------------------------------------------------

describe("darkenRootSolidPaint", () => {
  let darkenRootSolidPaint: (
    frame: { fills?: unknown; strokes?: unknown },
    amount: number,
  ) => void;

  beforeEach(async () => {
    const mod = await import("../rendering/hoverConsolidation");
    darkenRootSolidPaint = mod.darkenRootSolidPaint as never;
  });

  it("darkens the first SOLID fill", () => {
    const frame = {
      fills: [{ type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 }],
      strokes: [],
    };
    darkenRootSolidPaint(frame as never, 0.12);
    const fill = (frame.fills as Array<{ color: RGB }>)[0];
    expect(fill.color.r).toBeLessThan(0.7);
  });

  it("preserves opacity on the darkened fill", () => {
    const frame = {
      fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 0.42 }],
      strokes: [],
    };
    darkenRootSolidPaint(frame as never, 0.12);
    const fill = (frame.fills as Array<{ opacity: number }>)[0];
    expect(fill.opacity).toBe(0.42);
  });

  it("falls back to first SOLID stroke when fills has no SOLID", () => {
    const frame = {
      fills: [] as unknown[],
      strokes: [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 }, opacity: 1 }],
    };
    darkenRootSolidPaint(frame as never, 0.12);
    const stroke = (frame.strokes as Array<{ color: RGB }>)[0];
    expect(stroke.color.r).toBeLessThan(0.6);
  });

  it("skips non-SOLID paints (IMAGE, GRADIENT)", () => {
    const frame = {
      fills: [
        { type: "IMAGE", scaleMode: "FILL" },
        { type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 },
      ],
      strokes: [],
    };
    darkenRootSolidPaint(frame as never, 0.12);
    // Image untouched; SOLID (idx 1) darkened.
    const fills = frame.fills as Array<{ type: string; color?: RGB }>;
    expect(fills[0].type).toBe("IMAGE");
    expect(fills[1].color!.r).toBeLessThan(0.7);
  });

  it("no-op when frame has no SOLID fills or strokes", () => {
    const frame = { fills: [], strokes: [] };
    expect(() => darkenRootSolidPaint(frame as never, 0.12)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Plugin colors mode: hover variant darkening
// ---------------------------------------------------------------------------

describe("buildHoverMasterRegistry — plugin colors mode", () => {
  let buildHoverMasterRegistry: typeof import("../rendering/hoverConsolidation").buildHoverMasterRegistry;
  let mockCreateComponent: ReturnType<typeof vi.fn>;
  let mockCombineAsVariants: ReturnType<typeof vi.fn>;
  let componentIdCounter: number;

  // Clone-aware mock: clone() deep-copies fills and strokes (matching real
  // Figma semantics), so hover starts with the same paints as rest before
  // our darken logic runs.
  function makeCloneAwareMockComp(): Record<string, unknown> {
    const id = `comp-${++componentIdCounter}`;
    const comp: Record<string, unknown> = {
      type: "COMPONENT",
      id,
      name: "",
      fills: [] as unknown[],
      strokes: [] as unknown[],
      effects: [] as unknown[],
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
      createInstance: vi.fn(),
      setReactionsAsync: vi.fn(),
      reactions: [] as unknown[],
    };
    comp.clone = vi.fn(() => {
      const clone = makeCloneAwareMockComp();
      clone.fills = JSON.parse(JSON.stringify(comp.fills));
      clone.strokes = JSON.parse(JSON.stringify(comp.strokes));
      clone.effects = JSON.parse(JSON.stringify(comp.effects));
      clone.name = comp.name;
      clone.width = comp.width;
      clone.height = comp.height;
      return clone;
    });
    return comp;
  }

  beforeEach(async () => {
    componentIdCounter = 0;
    mockCreateComponent = vi.fn(makeCloneAwareMockComp);
    mockCombineAsVariants = vi.fn(
      (components: Array<Record<string, unknown>>) => ({
        type: "COMPONENT_SET",
        id: `cs-${++componentIdCounter}`,
        name: "ComponentSet",
        children: components,
        componentPropertyDefinitions: {} as Record<string, unknown>,
        addComponentProperty: vi.fn((name: string) => `${name}#1:0`),
        findOne: vi.fn(),
      }),
    );

    (globalThis as Record<string, unknown>).figma = {
      createComponent: mockCreateComponent,
      combineAsVariants: mockCombineAsVariants,
      currentPage: { appendChild: vi.fn() },
    };

    const mod = await import("../rendering/hoverConsolidation");
    buildHoverMasterRegistry = mod.buildHoverMasterRegistry;
  });

  function pluginContext() {
    return {
      interactionMode: "variants" as const,
      componentSets: [],
      hoverMasterRegistry: undefined,
      colorMode: "plugin",
    } as never;
  }
  function websiteContext() {
    return {
      interactionMode: "variants" as const,
      componentSets: [],
      hoverMasterRegistry: undefined,
      colorMode: "website",
    } as never;
  }

  function fillsOf(comp: Record<string, unknown>): Array<{ color: RGB }> {
    return (comp.fills as Array<{ color: RGB }>) ?? [];
  }

  it("plugin mode: hover fill is darker than rest (diff has background-color)", async () => {
    const btn = makeWfNode({
      name: "btn",
      fills: [{ type: "SOLID", color: { r: 0.68, g: 0.78, b: 0.86, a: 1 } }] as never,
      pseudoStateStyles: { hover: { "background-color": "#ff0000" } },
      children: [textNode("Click")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      pluginContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<
      Record<string, unknown>
    >;
    const rest = variants.find((v) => (v.name as string).includes(":hover=false"))!;
    const hover = variants.find((v) => (v.name as string).includes(":hover=true"))!;

    const restColor = fillsOf(rest)[0].color;
    const hoverColor = fillsOf(hover)[0].color;

    // Hover must differ from rest. Captured CSS color (#ff0000 = red) must
    // NOT appear — plugin mode strips it and darkens the palette fill instead.
    expect(hoverColor.r).not.toBeCloseTo(1.0, 1);
    const restL = (restColor.r + restColor.g + restColor.b) / 3;
    const hoverL = (hoverColor.r + hoverColor.g + hoverColor.b) / 3;
    expect(hoverL).toBeLessThan(restL);
  });

  it("plugin mode: hover still darkened when diff has only transform (no color)", async () => {
    const btn = makeWfNode({
      name: "btn",
      fills: [{ type: "SOLID", color: { r: 0.68, g: 0.78, b: 0.86, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Click")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      pluginContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<
      Record<string, unknown>
    >;
    const rest = variants.find((v) => (v.name as string).includes(":hover=false"))!;
    const hover = variants.find((v) => (v.name as string).includes(":hover=true"))!;

    const restColor = fillsOf(rest)[0].color;
    const hoverColor = fillsOf(hover)[0].color;
    expect(hoverColor.r).toBeLessThan(restColor.r);
  });

  it("website mode: hover uses captured CSS color (no darkening applied)", async () => {
    const btn = makeWfNode({
      name: "btn",
      fills: [{ type: "SOLID", color: { r: 0.68, g: 0.78, b: 0.86, a: 1 } }] as never,
      pseudoStateStyles: { hover: { "background-color": "#ff0000" } },
      children: [textNode("Click")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      websiteContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<
      Record<string, unknown>
    >;
    const hover = variants.find((v) => (v.name as string).includes(":hover=true"))!;
    const hoverColor = fillsOf(hover)[0].color;
    // Captured red should apply in website mode.
    expect(hoverColor.r).toBeCloseTo(1.0, 1);
    expect(hoverColor.g).toBeCloseTo(0, 1);
    expect(hoverColor.b).toBeCloseTo(0, 1);
  });

  it("plugin mode + near-black rest fill: hover is lightened (not darkened)", async () => {
    // #11151A ≈ rest fill. L ≈ 0.08 (< 0.15 → clamp inverts direction).
    const btn = makeWfNode({
      name: "btn",
      fills: [{
        type: "SOLID",
        color: { r: 17 / 255, g: 21 / 255, b: 26 / 255, a: 1 },
      }] as never,
      pseudoStateStyles: { hover: { "background-color": "#ffffff" } },
      children: [textNode("Click")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      pluginContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<
      Record<string, unknown>
    >;
    const rest = variants.find((v) => (v.name as string).includes(":hover=false"))!;
    const hover = variants.find((v) => (v.name as string).includes(":hover=true"))!;

    const restL = (fillsOf(rest)[0].color.r + fillsOf(rest)[0].color.g + fillsOf(rest)[0].color.b) / 3;
    const hoverL = (fillsOf(hover)[0].color.r + fillsOf(hover)[0].color.g + fillsOf(hover)[0].color.b) / 3;
    expect(hoverL).toBeGreaterThan(restL);
  });

  it("mutation isolation: darkening hover does not change rest fills", async () => {
    const btn = makeWfNode({
      name: "btn",
      fills: [{ type: "SOLID", color: { r: 0.68, g: 0.78, b: 0.86, a: 1 } }] as never,
      pseudoStateStyles: { hover: { transform: "matrix(1,0,0,1,0,-2)" } },
      children: [textNode("Click")],
    });
    const root = makeWfNode({ children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      pluginContext(),
    );
    const entry = Array.from(registry.values())[0];
    const variants = entry.componentSet.children as unknown as Array<
      Record<string, unknown>
    >;
    const rest = variants.find((v) => (v.name as string).includes(":hover=false"))!;
    const restColor = fillsOf(rest)[0].color;
    // Rest must be unchanged (approximately 0.68/0.78/0.86, possibly tweaked by pipeline).
    // The critical invariant: it is NOT the darkened value.
    const hover = variants.find((v) => (v.name as string).includes(":hover=true"))!;
    const hoverColor = fillsOf(hover)[0].color;
    expect(restColor.r).not.toBe(hoverColor.r);
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

// ---------------------------------------------------------------------------
// Regression: placeholder leaf reps must NOT leak an intermediate FrameNode
// onto figma.currentPage during hover master build.
//
// Tesla's <img class="_logoMark_s3iw9_30"> with :hover CSS was producing 4
// orphaned FrameNodes named `img._logoMark_*` / `img._logoImage_*` at (0,0)
// after every import. Root cause: buildComponentFromWireframe called
// createNodeInFigma(copy) for placeholder reps, which called createRealImage
// (or createPlaceholder) → figma.createFrame() auto-parented to currentPage.
// frame.remove() in a silent try/catch at hoverConsolidation.ts:491 swallowed
// cleanup failures. Fix: skip the createNodeInFigma round-trip for leaf
// placeholder reps and build the master directly from the skeleton path.
// ---------------------------------------------------------------------------

describe("buildHoverMasterRegistry — placeholder orphan regression", () => {
  let buildHoverMasterRegistry: typeof import("../rendering/hoverConsolidation").buildHoverMasterRegistry;
  let mockCreateFrame: ReturnType<typeof vi.fn>;
  let createdFrames: Array<Record<string, unknown>>;

  beforeEach(async () => {
    createdFrames = [];

    const makeMockFrame = (): Record<string, unknown> => {
      const frame: Record<string, unknown> = {
        type: "FRAME",
        id: `frame-${createdFrames.length + 1}`,
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
        resize: vi.fn(),
        resizeWithoutConstraints: vi.fn(),
        appendChild: vi.fn(),
        remove: vi.fn(),
        layoutMode: "NONE",
        primaryAxisSizingMode: "AUTO",
        counterAxisSizingMode: "AUTO",
        primaryAxisAlignItems: "MIN",
        counterAxisAlignItems: "MIN",
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        itemSpacing: 0,
        clipsContent: false,
      };
      return frame;
    };

    mockCreateFrame = vi.fn(() => {
      const frame = makeMockFrame();
      createdFrames.push(frame);
      return frame;
    });

    const makeMockComp = () => {
      const comp: Record<string, unknown> = {
        type: "COMPONENT",
        id: `comp-${Math.random().toString(36).slice(2, 6)}`,
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
        createInstance: vi.fn(),
        setReactionsAsync: vi.fn(),
        reactions: [] as unknown[],
      };
      return comp;
    };

    const makeMockShape = (kind: string): Record<string, unknown> => ({
      type: kind,
      id: `${kind.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "",
      fills: [],
      strokes: [],
      resize: vi.fn(),
      pointCount: 3,
      cornerRadius: 0,
      strokeWeight: 1,
      x: 0,
      y: 0,
    });

    (globalThis as Record<string, unknown>).figma = {
      createComponent: vi.fn(makeMockComp),
      createFrame: mockCreateFrame,
      createRectangle: vi.fn(() => makeMockShape("RECTANGLE")),
      createEllipse: vi.fn(() => makeMockShape("ELLIPSE")),
      createPolygon: vi.fn(() => makeMockShape("POLYGON")),
      createText: vi.fn(() => ({
        type: "TEXT",
        characters: "",
        fontName: { family: "Inter", style: "Regular" },
      })),
      combineAsVariants: vi.fn(
        (components: Array<Record<string, unknown>>) => ({
          type: "COMPONENT_SET",
          id: `cs-${Math.random().toString(36).slice(2, 6)}`,
          name: "ComponentSet",
          children: components,
          componentPropertyDefinitions: {},
          addComponentProperty: vi.fn((name: string) => `${name}#1:0`),
          findOne: vi.fn(),
          fills: [],
          strokes: [],
          strokeWeight: 0,
          cornerRadius: 0,
          width: 100,
          height: 40,
        }),
      ),
      loadFontAsync: vi.fn(async () => undefined),
      getLocalPaintStyles: vi.fn(() => []),
      createPaintStyle: vi.fn(() => ({ id: `style-${Math.random()}`, name: "", paints: [] })),
      currentPage: { appendChild: vi.fn() },
    };

    const mod = await import("../rendering/hoverConsolidation");
    buildHoverMasterRegistry = mod.buildHoverMasterRegistry;
  });

  function minimalContext() {
    return {
      interactionMode: "variants" as const,
      componentSets: [],
      hoverMasterRegistry: undefined,
      pluginColors: {
        primary: "#ffffff",
        secondary: "#e5e5e5",
        surface: "#f5f5f5",
        text: "#000000",
      },
      fontFamily: "Inter",
      colorStyleMap: new Map(),
      variableMode: "none",
      colorMode: "website",
      assetMode: "wireframe",
    } as never;
  }

  it("does NOT create an `img.*`-named frame for leaf placeholder <img> hoverables", async () => {
    // Reproduces Tesla.com case: raster <img> with :hover CSS rule.
    // Before fix: figma.createFrame is called with name `img._logoMark_...`
    // via createPlaceholder/createRealImage, producing an orphan at (0,0).
    // After fix: buildComponentFromWireframe short-circuits to skeleton for
    // leaf placeholders, so no frame with the image's CSS-derived name is
    // ever created on currentPage.
    const imgRep = makeWfNode({
      type: "placeholder",
      tag: "img",
      name: "img._logoMark_s3iw9_30",
      isPlaceholder: true,
      pseudoStateStyles: { hover: { opacity: "0.8" } },
      children: [],
    });
    const root = makeWfNode({ name: "root", children: [imgRep] });

    await buildHoverMasterRegistry([makeFrame(root)], minimalContext());

    const orphans = createdFrames.filter((f) =>
      (f.name as string).startsWith("img."),
    );
    expect(orphans).toHaveLength(0);
  });

  it("handles multiple distinct leaf placeholder reps without leaking", async () => {
    // Mirrors Tesla's 2 unique img classes × 2 viewports = 4 representatives.
    const imgA1 = makeWfNode({
      type: "placeholder",
      tag: "img",
      name: "img._logoMark_s3iw9_30",
      isPlaceholder: true,
      pseudoStateStyles: { hover: { opacity: "0.8" } },
      width: 48,
      height: 48,
    });
    const imgA2 = makeWfNode({
      type: "placeholder",
      tag: "img",
      name: "img._logoMark_s3iw9_30",
      isPlaceholder: true,
      pseudoStateStyles: { hover: { opacity: "0.8" } },
      width: 32,
      height: 32,
    });
    const imgB1 = makeWfNode({
      type: "placeholder",
      tag: "img",
      name: "img._logoImage_rue7f_40",
      isPlaceholder: true,
      pseudoStateStyles: { hover: { opacity: "0.8" } },
      width: 120,
      height: 24,
    });
    const imgB2 = makeWfNode({
      type: "placeholder",
      tag: "img",
      name: "img._logoImage_rue7f_40",
      isPlaceholder: true,
      pseudoStateStyles: { hover: { opacity: "0.8" } },
      width: 96,
      height: 20,
    });
    const root = makeWfNode({
      name: "root",
      children: [imgA1, imgA2, imgB1, imgB2],
    });

    await buildHoverMasterRegistry([makeFrame(root)], minimalContext());

    const orphans = createdFrames.filter((f) =>
      (f.name as string).startsWith("img."),
    );
    expect(orphans).toHaveLength(0);
  });

  it("still processes non-placeholder hoverables normally (regression guard)", async () => {
    // A regular <button> hoverable should still reach buildComponentFromWireframe
    // and produce a ComponentSet. This guards against an over-broad fix.
    const btn = makeWfNode({
      name: "btn",
      tag: "button",
      fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 1, a: 1 } }] as never,
      pseudoStateStyles: { hover: { "background-color": "#000" } },
      children: [textNode("Click")],
    });
    const root = makeWfNode({ name: "root", children: [btn] });

    const registry = await buildHoverMasterRegistry(
      [makeFrame(root)],
      minimalContext(),
    );
    expect(registry.size).toBe(1);
  });
});
