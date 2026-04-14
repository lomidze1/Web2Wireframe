/**
 * Tests for expanded applyCssDiffToNode properties.
 *
 * New CSS properties: visibility, transform (rotate), outline-width, letter-spacing.
 * Uses same mock pattern as pseudo-state-variants.test.ts.
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
  layoutMode?: string;
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
    layoutMode: "NONE",
    clipsContent: false,
    ...overrides,
  };
}

function createMockTextNode() {
  return {
    type: "TEXT" as const,
    name: "Text",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    textDecoration: "NONE" as string,
    fontSize: 16,
    letterSpacing: { value: 0, unit: "PIXELS" } as { value: number; unit: string },
    effects: [] as unknown[],
  };
}

// ============================================================================
// Tests for expanded applyCssDiffToNode
// ============================================================================

describe("applyCssDiffToNode — expanded properties", () => {
  let applyCssDiffToNode: (
    frame: MockFrameNode,
    diff: Record<string, string>
  ) => void;

  beforeEach(async () => {
    const mod = await import("../rendering/pseudoStates");
    applyCssDiffToNode = mod.applyCssDiffToNode as unknown as typeof applyCssDiffToNode;
  });

  // ---- visibility ----

  it('visibility "hidden" sets frame.visible = false', () => {
    const frame = createMockFrame({ visible: true });
    applyCssDiffToNode(frame, { "visibility": "hidden" });
    expect(frame.visible).toBe(false);
  });

  it('visibility "visible" sets frame.visible = true', () => {
    const frame = createMockFrame({ visible: false });
    applyCssDiffToNode(frame, { "visibility": "visible" });
    expect(frame.visible).toBe(true);
  });

  it('visibility "collapse" sets frame.visible = false', () => {
    const frame = createMockFrame({ visible: true });
    applyCssDiffToNode(frame, { "visibility": "collapse" });
    expect(frame.visible).toBe(false);
  });

  // ---- transform (rotate) ----

  it('transform "rotate(45deg)" sets frame.rotation = -45', () => {
    const frame = createMockFrame({ rotation: 0 });
    applyCssDiffToNode(frame, { "transform": "rotate(45deg)" });
    expect(frame.rotation).toBe(-45);
  });

  it('transform "rotate(-90deg)" sets frame.rotation = 90', () => {
    const frame = createMockFrame({ rotation: 0 });
    applyCssDiffToNode(frame, { "transform": "rotate(-90deg)" });
    expect(frame.rotation).toBe(90);
  });

  it('transform "scale(1.1)" is a no-op (no rotate)', () => {
    const frame = createMockFrame({ rotation: 0 });
    applyCssDiffToNode(frame, { "transform": "scale(1.1)" });
    expect(frame.rotation).toBe(0);
  });

  it('transform "translateX(10px) rotate(30deg)" extracts rotation = -30', () => {
    const frame = createMockFrame({ rotation: 0 });
    applyCssDiffToNode(frame, { "transform": "translateX(10px) rotate(30deg)" });
    expect(frame.rotation).toBe(-30);
  });

  // ---- outline-width ----

  it('outline-width "3px" sets strokeWeight=3, strokeAlign="OUTSIDE"', () => {
    const frame = createMockFrame({ strokeWeight: 0, strokeAlign: "INSIDE" });
    applyCssDiffToNode(frame, { "outline-width": "3px" });
    expect(frame.strokeWeight).toBe(3);
    expect(frame.strokeAlign).toBe("OUTSIDE");
  });

  // ---- letter-spacing ----

  it('letter-spacing "2px" sets textNode.letterSpacing on TEXT children', () => {
    const textNode = createMockTextNode();
    const frame = createMockFrame({
      findAll: (pred: (n: unknown) => boolean) => {
        return [textNode].filter(pred);
      },
    });

    applyCssDiffToNode(frame, { "letter-spacing": "2px" });
    expect(textNode.letterSpacing).toEqual({ value: 2, unit: "PIXELS" });
  });

  it('letter-spacing "normal" is a no-op', () => {
    const textNode = createMockTextNode();
    const frame = createMockFrame({
      findAll: (pred: (n: unknown) => boolean) => {
        return [textNode].filter(pred);
      },
    });

    applyCssDiffToNode(frame, { "letter-spacing": "normal" });
    // Should remain unchanged
    expect(textNode.letterSpacing).toEqual({ value: 0, unit: "PIXELS" });
  });

  // ---- __removed__ markers ----

  it('__removed__ visibility restores frame.visible = true', () => {
    const frame = createMockFrame({ visible: false });
    applyCssDiffToNode(frame, { "visibility": "__removed__" });
    expect(frame.visible).toBe(true);
  });

  it('__removed__ transform resets frame.rotation = 0', () => {
    const frame = createMockFrame({ rotation: -45 });
    applyCssDiffToNode(frame, { "transform": "__removed__" });
    expect(frame.rotation).toBe(0);
  });
});

// ============================================================================
// FIX 3 — effect-producing properties
// ============================================================================

interface EffectLike {
  type: string;
  radius?: number;
  visible?: boolean;
  offset?: { x: number; y: number };
  color?: { r: number; g: number; b: number; a: number };
  spread?: number;
  blendMode?: string;
}

describe("applyCssDiffToNode — FIX 3 effect properties", () => {
  let applyCssDiffToNode: (
    frame: MockFrameNode,
    diff: Record<string, string>,
  ) => void;

  beforeEach(async () => {
    const mod = await import("../rendering/pseudoStates");
    applyCssDiffToNode =
      mod.applyCssDiffToNode as unknown as typeof applyCssDiffToNode;
  });

  // ---- filter ----

  it("filter: blur(10px) adds LAYER_BLUR effect with radius 10", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { filter: "blur(10px)" });
    const effects = frame.effects as EffectLike[];
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("LAYER_BLUR");
    expect(effects[0].radius).toBe(10);
  });

  it("filter: none clears LAYER_BLUR", () => {
    const frame = createMockFrame({
      effects: [{ type: "LAYER_BLUR", radius: 5, visible: true }],
    });
    applyCssDiffToNode(frame, { filter: "none" });
    const effects = frame.effects as EffectLike[];
    expect(effects.filter((e) => e.type === "LAYER_BLUR")).toHaveLength(0);
  });

  it("filter: blur preserves existing DROP_SHADOW from box-shadow", () => {
    const existingShadow: EffectLike = {
      type: "DROP_SHADOW",
      radius: 4,
      offset: { x: 0, y: 2 },
      color: { r: 0, g: 0, b: 0, a: 0.5 },
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    };
    const frame = createMockFrame({ effects: [existingShadow] });
    applyCssDiffToNode(frame, { filter: "blur(5px)" });
    const effects = frame.effects as EffectLike[];
    // DROP_SHADOW must survive
    expect(effects.some((e) => e.type === "DROP_SHADOW")).toBe(true);
    // LAYER_BLUR must be added
    expect(effects.some((e) => e.type === "LAYER_BLUR" && e.radius === 5)).toBe(
      true,
    );
  });

  it("filter: blur(5px) drop-shadow(2px 2px 4px black) adds BOTH effects", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, {
      filter: "blur(5px) drop-shadow(2px 2px 4px rgb(0, 0, 0))",
    });
    const effects = frame.effects as EffectLike[];
    expect(effects.some((e) => e.type === "LAYER_BLUR")).toBe(true);
    expect(effects.some((e) => e.type === "DROP_SHADOW")).toBe(true);
  });

  it("filter: brightness(0.8) is ignored (no Figma equivalent)", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { filter: "brightness(0.8)" });
    expect(frame.effects).toHaveLength(0);
  });

  it("filter: saturate(1.5) is ignored", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { filter: "saturate(1.5)" });
    expect(frame.effects).toHaveLength(0);
  });

  // ---- backdrop-filter ----

  it("backdrop-filter: blur(10px) adds BACKGROUND_BLUR effect", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { "backdrop-filter": "blur(10px)" });
    const effects = frame.effects as EffectLike[];
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("BACKGROUND_BLUR");
    expect(effects[0].radius).toBe(10);
  });

  it("backdrop-filter preserves existing LAYER_BLUR from filter", () => {
    const frame = createMockFrame({
      effects: [{ type: "LAYER_BLUR", radius: 5, visible: true }],
    });
    applyCssDiffToNode(frame, { "backdrop-filter": "blur(15px)" });
    const effects = frame.effects as EffectLike[];
    expect(effects.some((e) => e.type === "LAYER_BLUR")).toBe(true);
    expect(effects.some((e) => e.type === "BACKGROUND_BLUR")).toBe(true);
  });

  it("backdrop-filter: none removes BACKGROUND_BLUR", () => {
    const frame = createMockFrame({
      effects: [{ type: "BACKGROUND_BLUR", radius: 10, visible: true }],
    });
    applyCssDiffToNode(frame, { "backdrop-filter": "none" });
    const effects = frame.effects as EffectLike[];
    expect(effects.filter((e) => e.type === "BACKGROUND_BLUR")).toHaveLength(0);
  });

  // ---- text-shadow ----

  it("text-shadow applies DROP_SHADOW to TextNode children", () => {
    const textNode = createMockTextNode();
    const frame = createMockFrame({
      findAll: (pred: (n: unknown) => boolean) => [textNode].filter(pred),
    });
    applyCssDiffToNode(frame, {
      "text-shadow": "2px 2px 4px rgb(0, 0, 0)",
    });
    const effects = textNode.effects as EffectLike[];
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("DROP_SHADOW");
    expect(effects[0].offset).toEqual({ x: 2, y: 2 });
    expect(effects[0].radius).toBe(4);
  });

  it("text-shadow with no TextNode children is no-op", () => {
    const frame = createMockFrame({
      findAll: () => [],
    });
    expect(() =>
      applyCssDiffToNode(frame, {
        "text-shadow": "2px 2px 4px rgb(0, 0, 0)",
      }),
    ).not.toThrow();
  });

  it("text-shadow: multiple shadows parsed as multiple effects", () => {
    const textNode = createMockTextNode();
    const frame = createMockFrame({
      findAll: (pred: (n: unknown) => boolean) => [textNode].filter(pred),
    });
    applyCssDiffToNode(frame, {
      // Browser computed style canonicalizes zero values with explicit `px`
      "text-shadow": "2px 2px 4px rgb(0, 0, 0), 0px 0px 10px rgb(0, 0, 255)",
    });
    const effects = textNode.effects as EffectLike[];
    expect(effects).toHaveLength(2);
  });

  it("text-shadow: none clears text shadows", () => {
    const textNode = createMockTextNode();
    textNode.effects = [{ type: "DROP_SHADOW" }];
    const frame = createMockFrame({
      findAll: (pred: (n: unknown) => boolean) => [textNode].filter(pred),
    });
    applyCssDiffToNode(frame, { "text-shadow": "none" });
    expect(textNode.effects).toHaveLength(0);
  });

  // ---- clip-path ----

  it("clip-path: inset(10px) sets frame.clipsContent = true", () => {
    const frame = createMockFrame({ clipsContent: false });
    applyCssDiffToNode(frame, { "clip-path": "inset(10px)" });
    expect(frame.clipsContent).toBe(true);
  });

  it("clip-path: inset(5px 10px 15px 20px) sets clipsContent = true", () => {
    const frame = createMockFrame({ clipsContent: false });
    applyCssDiffToNode(frame, { "clip-path": "inset(5px 10px 15px 20px)" });
    expect(frame.clipsContent).toBe(true);
  });

  it("clip-path: none sets frame.clipsContent = false", () => {
    const frame = createMockFrame({ clipsContent: true });
    applyCssDiffToNode(frame, { "clip-path": "none" });
    expect(frame.clipsContent).toBe(false);
  });

  it("clip-path: circle() is ignored (unsupported)", () => {
    const frame = createMockFrame({ clipsContent: false });
    applyCssDiffToNode(frame, { "clip-path": "circle(50%)" });
    // clipsContent unchanged — unsupported shape
    expect(frame.clipsContent).toBe(false);
  });

  it("clip-path: polygon() is ignored (unsupported)", () => {
    const frame = createMockFrame({ clipsContent: true });
    applyCssDiffToNode(frame, {
      "clip-path": "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
    });
    // clipsContent unchanged
    expect(frame.clipsContent).toBe(true);
  });

  // ---- Effect type preservation (critical) ----

  it("applying filter:blur after box-shadow preserves DROP_SHADOW", () => {
    const frame = createMockFrame({ effects: [] });
    // Apply box-shadow first
    applyCssDiffToNode(frame, {
      "box-shadow": "0px 4px 8px rgb(0, 0, 0)",
    });
    // Then apply filter:blur
    applyCssDiffToNode(frame, { filter: "blur(5px)" });
    const effects = frame.effects as EffectLike[];
    expect(effects.some((e) => e.type === "DROP_SHADOW")).toBe(true);
    expect(effects.some((e) => e.type === "LAYER_BLUR")).toBe(true);
  });

  it("applying box-shadow after filter:blur preserves LAYER_BLUR", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { filter: "blur(5px)" });
    applyCssDiffToNode(frame, {
      "box-shadow": "0px 4px 8px rgb(0, 0, 0)",
    });
    const effects = frame.effects as EffectLike[];
    expect(effects.some((e) => e.type === "LAYER_BLUR")).toBe(true);
    expect(effects.some((e) => e.type === "DROP_SHADOW")).toBe(true);
  });

  it("applying backdrop-filter does not remove filter's LAYER_BLUR", () => {
    const frame = createMockFrame({ effects: [] });
    applyCssDiffToNode(frame, { filter: "blur(5px)" });
    applyCssDiffToNode(frame, { "backdrop-filter": "blur(10px)" });
    const effects = frame.effects as EffectLike[];
    expect(effects.some((e) => e.type === "LAYER_BLUR")).toBe(true);
    expect(effects.some((e) => e.type === "BACKGROUND_BLUR")).toBe(true);
  });

  // ---- __removed__ markers ----

  it("__removed__ filter clears LAYER_BLUR", () => {
    const frame = createMockFrame({
      effects: [{ type: "LAYER_BLUR", radius: 5, visible: true }],
    });
    applyCssDiffToNode(frame, { filter: "__removed__" });
    const effects = frame.effects as EffectLike[];
    expect(effects.filter((e) => e.type === "LAYER_BLUR")).toHaveLength(0);
  });

  it("__removed__ backdrop-filter clears BACKGROUND_BLUR", () => {
    const frame = createMockFrame({
      effects: [{ type: "BACKGROUND_BLUR", radius: 10, visible: true }],
    });
    applyCssDiffToNode(frame, { "backdrop-filter": "__removed__" });
    const effects = frame.effects as EffectLike[];
    expect(effects.filter((e) => e.type === "BACKGROUND_BLUR")).toHaveLength(0);
  });

  it("__removed__ clip-path sets clipsContent = false", () => {
    const frame = createMockFrame({ clipsContent: true });
    applyCssDiffToNode(frame, { "clip-path": "__removed__" });
    expect(frame.clipsContent).toBe(false);
  });
});
