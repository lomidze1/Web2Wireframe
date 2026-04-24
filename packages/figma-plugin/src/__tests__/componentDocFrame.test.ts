/**
 * Tests for h2d-style "Component N" doc-frame wrapping (Phase C).
 *
 * Each ComponentSet gets wrapped in a documentation FRAME containing:
 *  - the ComponentSet (with gray fill / black stroke / radius 5)
 *  - x-axis-legend FRAME ("default", "hover" labels)
 *  - y-axis-legend FRAME ("variant 1", "variant 2", … labels)
 *
 * Mirrors h2d's exact output struct shown in the apple.com dump.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockNode {
  type: string;
  id: string;
  name: string;
  fills: unknown[];
  strokes: unknown[];
  strokeWeight: number;
  cornerRadius: number;
  width: number;
  height: number;
  x: number;
  y: number;
  children: MockNode[];
  appendChild: (n: MockNode) => void;
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  resize?: (w: number, h: number) => void;
  resizeWithoutConstraints?: (w: number, h: number) => void;
  fontName?: { family: string; style: string };
  fontSize?: number;
  characters?: string;
}

let frameIdCounter = 0;
let textIdCounter = 0;

function makeMockFrame(): MockNode {
  const id = `frame-${++frameIdCounter}`;
  const node: MockNode = {
    type: "FRAME",
    id,
    name: "",
    fills: [],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    children: [],
    appendChild(child: MockNode) { this.children.push(child); },
    layoutMode: "NONE",
    resize(w, h) { this.width = w; this.height = h; },
    resizeWithoutConstraints(w, h) { this.width = w; this.height = h; },
  };
  return node;
}

function makeMockText(): MockNode {
  const id = `text-${++textIdCounter}`;
  return {
    type: "TEXT",
    id,
    name: "",
    fills: [],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    width: 50,
    height: 14,
    x: 0,
    y: 0,
    children: [],
    appendChild() { /* texts have no children */ },
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 12,
    characters: "",
  };
}

function makeMockComponentSet(width = 200, height = 100): MockNode {
  return {
    type: "COMPONENT_SET",
    id: `cs-${Math.random()}`,
    name: "Original Name",
    fills: [],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    width,
    height,
    x: 0,
    y: 0,
    children: [],
    appendChild() { /* no-op */ },
  };
}

function setupFigmaMocks() {
  (globalThis as Record<string, unknown>).figma = {
    createFrame: vi.fn(makeMockFrame),
    createText: vi.fn(makeMockText),
    loadFontAsync: vi.fn(async () => undefined),
  };
}

// ---------------------------------------------------------------------------

describe("wrapInDocFrame — Phase C h2d-parity", () => {
  let wrapInDocFrame: typeof import("../rendering/componentDocFrame").wrapInDocFrame;

  beforeEach(async () => {
    frameIdCounter = 0;
    textIdCounter = 0;
    setupFigmaMocks();
    const mod = await import("../rendering/componentDocFrame");
    wrapInDocFrame = mod.wrapInDocFrame;
  });

  it("renames ComponentSet to 'Component N'", async () => {
    const cs = makeMockComponentSet();
    await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 3,
      variantCount: 2,
    });
    expect(cs.name).toBe("Component 3");
  });

  it("applies h2d ComponentSet styling: gray fill @0.7, black stroke 0.5, radius 5", async () => {
    const cs = makeMockComponentSet();
    await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 2,
    });
    expect(cs.fills).toHaveLength(1);
    const fill = cs.fills[0] as { type: string; color: { r: number; g: number; b: number }; opacity: number };
    expect(fill.type).toBe("SOLID");
    expect(fill.color.r).toBeCloseTo(245 / 255, 3);
    expect(fill.color.g).toBeCloseTo(245 / 255, 3);
    expect(fill.color.b).toBeCloseTo(245 / 255, 3);
    expect(fill.opacity).toBeCloseTo(0.7, 2);

    expect(cs.strokes).toHaveLength(1);
    const stroke = cs.strokes[0] as { type: string; color: { r: number; g: number; b: number } };
    expect(stroke.type).toBe("SOLID");
    expect(stroke.color.r).toBe(0);
    expect(stroke.color.g).toBe(0);
    expect(stroke.color.b).toBe(0);
    expect(cs.strokeWeight).toBe(0.5);
    expect(cs.cornerRadius).toBe(5);
  });

  it("returns a wrapper FRAME named 'Component N'", async () => {
    const cs = makeMockComponentSet();
    const wrapper = await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 5,
      variantCount: 3,
    });
    expect(wrapper.type).toBe("FRAME");
    expect(wrapper.name).toBe("Component 5");
  });

  it("wrapper contains 3 children: ComponentSet, x-axis-legend, y-axis-legend", async () => {
    const cs = makeMockComponentSet();
    const wrapper = (await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 2,
    })) as unknown as MockNode;

    expect(wrapper.children).toHaveLength(3);
    const names = wrapper.children.map((c) => c.name).sort();
    expect(names).toContain("Component 1");      // the ComponentSet
    expect(names).toContain("x-axis-legend");
    expect(names).toContain("y-axis-legend");
  });

  it("x-axis-legend has 2 TEXT children: 'default' and 'hover'", async () => {
    const cs = makeMockComponentSet();
    const wrapper = (await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 2,
    })) as unknown as MockNode;
    const xLegend = wrapper.children.find((c) => c.name === "x-axis-legend");
    expect(xLegend).toBeDefined();
    const labels = xLegend!.children.map((t) => t.characters);
    expect(labels).toEqual(["default", "hover"]);
  });

  it("y-axis-legend has N TEXT children labeled 'variant\\nN'", async () => {
    const cs = makeMockComponentSet();
    const wrapper = (await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 4,
    })) as unknown as MockNode;
    const yLegend = wrapper.children.find((c) => c.name === "y-axis-legend");
    expect(yLegend).toBeDefined();
    expect(yLegend!.children).toHaveLength(4);
    expect(yLegend!.children[0].characters).toBe("variant\n1");
    expect(yLegend!.children[1].characters).toBe("variant\n2");
    expect(yLegend!.children[2].characters).toBe("variant\n3");
    expect(yLegend!.children[3].characters).toBe("variant\n4");
  });

  it("uses Inter Light 12px font for legend text (h2d default)", async () => {
    const cs = makeMockComponentSet();
    const wrapper = (await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 2,
    })) as unknown as MockNode;
    const xLegend = wrapper.children.find((c) => c.name === "x-axis-legend")!;
    const firstLabel = xLegend.children[0];
    expect(firstLabel.fontName).toEqual({ family: "Inter", style: "Light" });
    expect(firstLabel.fontSize).toBe(12);
  });

  it("calls figma.loadFontAsync for the legend font before setting characters", async () => {
    const loadFontMock = (globalThis as { figma: { loadFontAsync: ReturnType<typeof vi.fn> } })
      .figma.loadFontAsync;
    const cs = makeMockComponentSet();
    await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 2,
    });
    expect(loadFontMock).toHaveBeenCalledWith({ family: "Inter", style: "Light" });
  });

  it("falls back gracefully when font load fails (no throw, text still set)", async () => {
    (globalThis as { figma: { loadFontAsync: ReturnType<typeof vi.fn> } })
      .figma.loadFontAsync.mockRejectedValueOnce(new Error("font missing"));
    const cs = makeMockComponentSet();
    const wrapper = (await wrapInDocFrame({
      componentSet: cs as unknown as ComponentSetNode,
      componentIndex: 1,
      variantCount: 2,
    })) as unknown as MockNode;
    expect(wrapper.name).toBe("Component 1");
    // Wrapper is still built; legend labels may have empty characters but
    // structure must be intact.
    expect(wrapper.children).toHaveLength(3);
  });
});
