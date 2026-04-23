/**
 * Phase 5: diff whitelist widening + applyCssDiffToNode case handlers.
 *
 * Adds CSS properties that Apple and typical design systems use for hover
 * effects but that the legacy 19-prop whitelist skipped — forcing empty
 * diffs and synthetic `opacity: 0.8` fallbacks. Covers:
 *   - per-side border colors (Apple nav underline)
 *   - per-side border widths
 *   - font-weight, font-size, text-underline-offset, text-decoration-color/thickness
 *   - padding (and per-side)
 *   - gap, row-gap, column-gap
 *   - width, height
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Figma API mocks (mirrors pseudo-state-expanded.test.ts)
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
  strokeTopWeight: number;
  strokeRightWeight: number;
  strokeBottomWeight: number;
  strokeLeftWeight: number;
  strokeAlign: string;
  visible: boolean;
  rotation: number;
  width: number;
  height: number;
  children: MockFrameNode[];
  setPluginData: ReturnType<typeof vi.fn>;
  getPluginData: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
  findAll: (predicate: (n: unknown) => boolean) => unknown[];
  parent?: unknown;
  remove?: ReturnType<typeof vi.fn>;
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  itemSpacing: number;
  counterAxisSpacing: number;
  resize: ReturnType<typeof vi.fn>;
  clipsContent?: boolean;
}

function createMockFrame(overrides: Partial<MockFrameNode> = {}): MockFrameNode {
  return {
    type: "FRAME",
    name: "Test Frame",
    fills: [],
    strokes: [],
    effects: [],
    opacity: 1,
    cornerRadius: 0,
    strokeWeight: 0,
    strokeTopWeight: 0,
    strokeRightWeight: 0,
    strokeBottomWeight: 0,
    strokeLeftWeight: 0,
    strokeAlign: "INSIDE",
    visible: true,
    rotation: 0,
    width: 200,
    height: 48,
    children: [],
    setPluginData: vi.fn(),
    getPluginData: vi.fn(),
    appendChild: vi.fn(),
    findAll: (_predicate) => [],
    parent: null,
    remove: vi.fn(),
    layoutMode: "HORIZONTAL",
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
    itemSpacing: 8,
    counterAxisSpacing: 0,
    resize: vi.fn(function (this: MockFrameNode, w: number, h: number) {
      this.width = w;
      this.height = h;
    }),
    clipsContent: false,
    ...overrides,
  };
}

// ============================================================================
// Part 1: diff-detection (computeHoverDiff via convertW2WToWireframe)
// ============================================================================

function makeW2WFrame(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

describe("Phase 5 — computeHoverDiff detects new properties", () => {
  let convertW2WToWireframe: typeof import("../rendering/css-converter").convertW2WToWireframe;

  beforeEach(async () => {
    const mod = await import("../rendering/css-converter");
    convertW2WToWireframe = mod.convertW2WToWireframe;
  });

  it("border-bottom-color change appears in diff (Apple nav underline)", () => {
    const node = makeW2WFrame({
      tag: "a",
      styles: { borderBottomColor: "rgba(0,0,0,0)" },
      hover: makeW2WFrame({
        styles: { borderBottomColor: "rgb(255,255,255)" },
      }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["border-bottom-color"]).toBe(
      "rgb(255,255,255)",
    );
  });

  it("per-side border widths each appear in diff", () => {
    const node = makeW2WFrame({
      tag: "a",
      styles: {
        borderTopWidth: "0px",
        borderBottomWidth: "0px",
      },
      hover: makeW2WFrame({
        styles: {
          borderTopWidth: "2px",
          borderBottomWidth: "2px",
        },
      }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["border-top-width"]).toBe("2px");
    expect(result.pseudoStateStyles?.hover?.["border-bottom-width"]).toBe("2px");
  });

  it("font-weight change appears in diff", () => {
    const node = makeW2WFrame({
      tag: "a",
      styles: { fontWeight: "400" },
      hover: makeW2WFrame({ styles: { fontWeight: "700" } }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["font-weight"]).toBe("700");
  });

  it("font-size change appears in diff", () => {
    const node = makeW2WFrame({
      tag: "a",
      styles: { fontSize: "14px" },
      hover: makeW2WFrame({ styles: { fontSize: "18px" } }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["font-size"]).toBe("18px");
  });

  it("text-underline-offset + text-decoration-color appear in diff", () => {
    const node = makeW2WFrame({
      tag: "a",
      styles: {
        textUnderlineOffset: "auto",
        textDecorationColor: "rgb(0,0,0)",
      },
      hover: makeW2WFrame({
        styles: {
          textUnderlineOffset: "4px",
          textDecorationColor: "rgb(0,119,255)",
        },
      }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["text-underline-offset"]).toBe(
      "4px",
    );
    expect(result.pseudoStateStyles?.hover?.["text-decoration-color"]).toBe(
      "rgb(0,119,255)",
    );
  });

  it("padding and per-side paddings appear in diff", () => {
    const node = makeW2WFrame({
      tag: "button",
      styles: { padding: "8px", paddingTop: "8px" },
      hover: makeW2WFrame({
        styles: { padding: "12px", paddingTop: "12px" },
      }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["padding"]).toBe("12px");
    expect(result.pseudoStateStyles?.hover?.["padding-top"]).toBe("12px");
  });

  it("gap, row-gap, column-gap appear in diff", () => {
    const node = makeW2WFrame({
      tag: "div",
      styles: { gap: "8px", rowGap: "8px", columnGap: "8px" },
      hover: makeW2WFrame({
        styles: { gap: "16px", rowGap: "16px", columnGap: "16px" },
      }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["gap"]).toBe("16px");
    expect(result.pseudoStateStyles?.hover?.["row-gap"]).toBe("16px");
    expect(result.pseudoStateStyles?.hover?.["column-gap"]).toBe("16px");
  });

  it("width and height changes appear in diff", () => {
    const node = makeW2WFrame({
      tag: "div",
      styles: { width: "100px", height: "40px" },
      hover: makeW2WFrame({ styles: { width: "140px", height: "48px" } }),
    });
    const result = convertW2WToWireframe(node as never);
    expect(result.pseudoStateStyles?.hover?.["width"]).toBe("140px");
    expect(result.pseudoStateStyles?.hover?.["height"]).toBe("48px");
  });
});

// ============================================================================
// Part 2: applyCssDiffToNode handlers
// ============================================================================

describe("Phase 5 — applyCssDiffToNode handles new properties", () => {
  let applyCssDiffToNode: (
    frame: MockFrameNode,
    diff: Record<string, string>,
  ) => void;

  beforeEach(async () => {
    const mod = await import("../rendering/pseudoStates");
    applyCssDiffToNode = mod.applyCssDiffToNode as never;
  });

  // ---- per-side border colors ----

  it("border-bottom-color sets a stroke on the frame", () => {
    const frame = createMockFrame({ strokes: [] });
    applyCssDiffToNode(frame, { "border-bottom-color": "rgb(255,255,255)" });
    expect(frame.strokes.length).toBe(1);
    const stroke = frame.strokes[0] as { type: string };
    expect(stroke.type).toBe("SOLID");
  });

  it("border-top-color also sets a stroke (approximation)", () => {
    const frame = createMockFrame({ strokes: [] });
    applyCssDiffToNode(frame, { "border-top-color": "rgb(255,0,0)" });
    expect(frame.strokes.length).toBe(1);
  });

  // ---- per-side border widths ----

  it("border-bottom-width sets frame.strokeBottomWeight", () => {
    const frame = createMockFrame({ strokeBottomWeight: 0 });
    applyCssDiffToNode(frame, { "border-bottom-width": "2px" });
    expect(frame.strokeBottomWeight).toBe(2);
  });

  it("border-top-width sets frame.strokeTopWeight", () => {
    const frame = createMockFrame({ strokeTopWeight: 0 });
    applyCssDiffToNode(frame, { "border-top-width": "3px" });
    expect(frame.strokeTopWeight).toBe(3);
  });

  // ---- font-weight / font-size on TEXT children ----

  it("font-weight updates TEXT child fontName.style", () => {
    const textNode = {
      type: "TEXT" as const,
      name: "T",
      fills: [],
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
    };
    const frame = createMockFrame({ children: [textNode as never] });
    frame.findAll = () => [textNode];
    applyCssDiffToNode(frame, { "font-weight": "700" });
    expect(textNode.fontName.style).toMatch(/Bold/i);
  });

  it("font-size updates TEXT child fontSize", () => {
    const textNode = {
      type: "TEXT" as const,
      name: "T",
      fills: [],
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
    };
    const frame = createMockFrame({ children: [textNode as never] });
    frame.findAll = () => [textNode];
    applyCssDiffToNode(frame, { "font-size": "20px" });
    expect(textNode.fontSize).toBe(20);
  });

  // ---- padding ----

  it("padding shorthand sets all four paddings (auto-layout frame)", () => {
    const frame = createMockFrame({
      layoutMode: "HORIZONTAL",
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
    });
    applyCssDiffToNode(frame, { padding: "16px" });
    expect(frame.paddingTop).toBe(16);
    expect(frame.paddingRight).toBe(16);
    expect(frame.paddingBottom).toBe(16);
    expect(frame.paddingLeft).toBe(16);
  });

  it("padding-top sets only top padding", () => {
    const frame = createMockFrame({
      layoutMode: "HORIZONTAL",
      paddingTop: 8,
      paddingBottom: 8,
    });
    applyCssDiffToNode(frame, { "padding-top": "20px" });
    expect(frame.paddingTop).toBe(20);
    expect(frame.paddingBottom).toBe(8); // untouched
  });

  it("padding is no-op on NONE layoutMode (Figma requires auto-layout)", () => {
    const frame = createMockFrame({
      layoutMode: "NONE",
      paddingTop: 8,
    });
    applyCssDiffToNode(frame, { padding: "16px" });
    expect(frame.paddingTop).toBe(8); // unchanged
  });

  // ---- gap ----

  it("gap sets frame.itemSpacing when auto-layout is on", () => {
    const frame = createMockFrame({
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
    });
    applyCssDiffToNode(frame, { gap: "12px" });
    expect(frame.itemSpacing).toBe(12);
  });

  it("row-gap sets counterAxisSpacing on horizontal auto-layout", () => {
    const frame = createMockFrame({
      layoutMode: "HORIZONTAL",
      counterAxisSpacing: 0,
    });
    applyCssDiffToNode(frame, { "row-gap": "10px" });
    expect(frame.counterAxisSpacing).toBe(10);
  });

  // ---- width / height ----

  it("width calls frame.resize preserving current height", () => {
    const frame = createMockFrame({ width: 100, height: 40 });
    applyCssDiffToNode(frame, { width: "160px" });
    expect(frame.resize).toHaveBeenCalledWith(160, 40);
  });

  it("height calls frame.resize preserving current width", () => {
    const frame = createMockFrame({ width: 100, height: 40 });
    applyCssDiffToNode(frame, { height: "56px" });
    expect(frame.resize).toHaveBeenCalledWith(100, 56);
  });

  // ---- regression: unknown props still silently no-op ----

  it("unknown props still fall through (default: break)", () => {
    const frame = createMockFrame();
    expect(() =>
      applyCssDiffToNode(frame, { "completely-unknown-prop": "foo" }),
    ).not.toThrow();
  });
});
