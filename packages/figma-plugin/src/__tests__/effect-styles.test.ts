/**
 * EffectStyle creation & linking — Phase 2 TDD
 *
 * Covers:
 *   - effectsKey (value-hash for FigmaEffect arrays)
 *   - createEffectStyles (auto-numbered, value-first)
 *   - linkEffectStyleIfAvailable (setEffectStyleIdAsync, skip frame.effects when linked)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FigmaEffect, RenderContext, WireframeFrame } from "../types";

// ============================================================================
// Stateful Figma Mock (includes EffectStyle API)
// ============================================================================

interface MockEffectStyle {
  id: string;
  name: string;
  effects: readonly Effect[];
}

let mockEffectStyles: MockEffectStyle[] = [];
let createEffectStyleCallCount = 0;
let effectStyleIdCounter = 0;

function installFigmaMock(): void {
  (globalThis as Record<string, unknown>).figma = {
    getLocalEffectStyles: vi.fn(() => mockEffectStyles),
    createEffectStyle: vi.fn(() => {
      createEffectStyleCallCount++;
      const style: MockEffectStyle = {
        id: `effect-${++effectStyleIdCounter}`,
        name: "",
        effects: [],
      };
      mockEffectStyles.push(style);
      return style;
    }),
  };
}

beforeEach(() => {
  mockEffectStyles = [];
  createEffectStyleCallCount = 0;
  effectStyleIdCounter = 0;
  installFigmaMock();
});

function seedEffectStyle(name: string, effects: Effect[]): MockEffectStyle {
  const style: MockEffectStyle = {
    id: `effect-seed-${++effectStyleIdCounter}`,
    name,
    effects,
  };
  mockEffectStyles.push(style);
  return style;
}

// ============================================================================
// Helpers
// ============================================================================

function dropShadow(overrides: Partial<FigmaEffect> = {}): FigmaEffect {
  return {
    type: "DROP_SHADOW",
    visible: true,
    color: { r: 0, g: 0, b: 0, a: 0.15 },
    offset: { x: 0, y: 4 },
    radius: 12,
    spread: 0,
    ...overrides,
  };
}

function makeFrameWithEffects(effectsByNode: FigmaEffect[][]): WireframeFrame {
  return {
    viewportWidth: 1440,
    tree: {
      id: "root",
      name: "root",
      type: "frame",
      tag: "div",
      x: 0, y: 0, width: 100, height: 100,
      layoutMode: "NONE",
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: null, backgroundGradient: null,
      textColor: "#000000",
      borderColor: null, borderWidth: 0, borderRadius: 0, opacity: 1,
      textContent: "",
      fontSize: 0, fontWeight: 400, fontFamily: "Inter",
      textAlign: "left", lineHeight: 0, letterSpacing: 0, isPlaceholder: false,
      children: effectsByNode.map((effects, i) => ({
        id: `c-${i}`,
        name: `c-${i}`,
        type: "frame" as const,
        tag: "div",
        x: 0, y: 0, width: 50, height: 50,
        layoutMode: "NONE" as const,
        itemSpacing: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        backgroundColor: null, backgroundGradient: null,
        textColor: "#000000",
        borderColor: null, borderWidth: 0, borderRadius: 0, opacity: 1,
        textContent: "",
        fontSize: 0, fontWeight: 400, fontFamily: "Inter",
        textAlign: "left", lineHeight: 0, letterSpacing: 0, isPlaceholder: false,
        effects,
        children: [],
      })),
    },
  } as unknown as WireframeFrame;
}

// ============================================================================
// effectsKey
// ============================================================================

import {
  effectsKey,
  createEffectStyles,
  linkEffectStyleIfAvailable,
} from "../rendering/styles";

describe("effectsKey (value hashing)", () => {
  it("produces distinct keys for different shadow offsets", () => {
    const k1 = effectsKey([dropShadow({ offset: { x: 0, y: 4 } })]);
    const k2 = effectsKey([dropShadow({ offset: { x: 0, y: 8 } })]);
    expect(k1).not.toBe(k2);
  });

  it("produces same key for identical shadows", () => {
    const a = dropShadow({ offset: { x: 0, y: 4 }, radius: 12, color: { r: 0, g: 0, b: 0, a: 0.15 } });
    const b = dropShadow({ offset: { x: 0, y: 4 }, radius: 12, color: { r: 0, g: 0, b: 0, a: 0.15 } });
    expect(effectsKey([a])).toBe(effectsKey([b]));
  });

  it("order-sensitive: [shadow, blur] ≠ [blur, shadow]", () => {
    const shadow = dropShadow();
    const blur: FigmaEffect = {
      type: "LAYER_BLUR",
      visible: true,
      blurRadius: 8,
    };
    expect(effectsKey([shadow, blur])).not.toBe(effectsKey([blur, shadow]));
  });
});

// ============================================================================
// createEffectStyles (Category B: auto-numbered, value-first)
// ============================================================================

describe("createEffectStyles", () => {
  it("returns empty map when no effects in tree", async () => {
    const frame = makeFrameWithEffects([]);
    const result = await createEffectStyles([frame], "apple.com", "website");
    expect(result.size).toBe(0);
    expect(createEffectStyleCallCount).toBe(0);
  });

  it("single drop-shadow → creates --shadow-01", async () => {
    const frame = makeFrameWithEffects([[dropShadow()]]);
    const result = await createEffectStyles([frame], "apple.com", "website");

    expect(createEffectStyleCallCount).toBe(1);
    const style = mockEffectStyles.find((s) => s.name === "apple.com/--shadow-01");
    expect(style).toBeDefined();
    expect(result.size).toBe(1);
  });

  it("same shadow on 3 nodes → 1 style (dedup by value)", async () => {
    const shadow = dropShadow();
    const frame = makeFrameWithEffects([[shadow], [shadow], [shadow]]);
    await createEffectStyles([frame], "apple.com", "website");
    expect(createEffectStyleCallCount).toBe(1);
  });

  it("3 different shadows → 3 numbered styles 01, 02, 03", async () => {
    const frame = makeFrameWithEffects([
      [dropShadow({ offset: { x: 0, y: 2 } })],
      [dropShadow({ offset: { x: 0, y: 4 } })],
      [dropShadow({ offset: { x: 0, y: 8 } })],
    ]);
    await createEffectStyles([frame], "apple.com", "website");
    expect(createEffectStyleCallCount).toBe(3);
    expect(mockEffectStyles.map((s) => s.name).sort()).toEqual([
      "apple.com/--shadow-01",
      "apple.com/--shadow-02",
      "apple.com/--shadow-03",
    ]);
  });

  it("re-import with identical shadows → 0 new styles (value-first reuse)", async () => {
    const shadow = dropShadow();
    // Seed existing slot with matching effects
    seedEffectStyle("apple.com/--shadow-01", [
      {
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.15 },
        offset: { x: 0, y: 4 },
        radius: 12,
        spread: 0,
        blendMode: "NORMAL",
      } as Effect,
    ]);
    createEffectStyleCallCount = 0;

    const frame = makeFrameWithEffects([[shadow]]);
    await createEffectStyles([frame], "apple.com", "website");

    expect(createEffectStyleCallCount).toBe(0);
  });

  it("re-import with one new shadow → counter continues from max existing slot", async () => {
    seedEffectStyle("apple.com/--shadow-01", [
      {
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.15 },
        offset: { x: 0, y: 4 },
        radius: 12,
        spread: 0,
        blendMode: "NORMAL",
      } as Effect,
    ]);
    createEffectStyleCallCount = 0;

    const frame = makeFrameWithEffects([
      [dropShadow()], // matches slot-01
      [dropShadow({ offset: { x: 0, y: 20 }, radius: 40 })], // new
    ]);
    await createEffectStyles([frame], "apple.com", "website");

    expect(createEffectStyleCallCount).toBe(1);
    const newStyle = mockEffectStyles.find((s) => s.name === "apple.com/--shadow-02");
    expect(newStyle).toBeDefined();
  });

  it("layered effects (shadow + blur) → single --shadow-01 with both layers", async () => {
    const frame = makeFrameWithEffects([
      [
        dropShadow(),
        { type: "LAYER_BLUR", visible: true, blurRadius: 8 },
      ],
    ]);
    await createEffectStyles([frame], "apple.com", "website");
    expect(createEffectStyleCallCount).toBe(1);
    const style = mockEffectStyles.find((s) => s.name === "apple.com/--shadow-01");
    expect(style).toBeDefined();
    expect(style!.effects.length).toBe(2);
  });

  it("plugin color mode → returns empty map (shadows stripped upstream)", async () => {
    const frame = makeFrameWithEffects([[dropShadow()]]);
    const result = await createEffectStyles([frame], "apple.com", "plugin");
    expect(result.size).toBe(0);
    expect(createEffectStyleCallCount).toBe(0);
  });
});

// ============================================================================
// linkEffectStyleIfAvailable
// ============================================================================

describe("linkEffectStyleIfAvailable", () => {
  function makeContext(map: Map<string, MockEffectStyle>): RenderContext {
    return {
      effectStyleMap: map as unknown as Map<string, EffectStyle>,
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
      effects: [],
      effectStyleId: "",
      setEffectStyleIdAsync: vi.fn(async function (this: FrameNode, id: string) {
        (this as unknown as { effectStyleId: string }).effectStyleId = id;
      }),
    } as unknown as FrameNode;
  }

  it("returns true and sets effectStyleId when map has matching key", async () => {
    const effects = [dropShadow()];
    const style = seedEffectStyle("apple.com/--shadow-01", []);
    const map = new Map<string, MockEffectStyle>();
    map.set(effectsKey(effects), style);

    const frame = makeMockFrame();
    const result = await linkEffectStyleIfAvailable(frame, makeContext(map), effects);

    expect(result).toBe(true);
    expect((frame as unknown as { effectStyleId: string }).effectStyleId).toBe(style.id);
  });

  it("returns false when map has no matching key", async () => {
    const effects = [dropShadow()];
    const map = new Map<string, MockEffectStyle>();
    // Map is empty — no match
    const frame = makeMockFrame();
    const result = await linkEffectStyleIfAvailable(frame, makeContext(map), effects);
    expect(result).toBe(false);
  });

  it("returns false when context.effectStyleMap is undefined", async () => {
    const effects = [dropShadow()];
    const ctx = makeContext(new Map());
    (ctx as { effectStyleMap?: Map<string, EffectStyle> }).effectStyleMap = undefined;
    const frame = makeMockFrame();
    const result = await linkEffectStyleIfAvailable(frame, ctx, effects);
    expect(result).toBe(false);
  });

  it("returns false when sourceEffects is empty or undefined", async () => {
    const ctx = makeContext(new Map());
    const frame = makeMockFrame();
    expect(await linkEffectStyleIfAvailable(frame, ctx, [])).toBe(false);
    expect(await linkEffectStyleIfAvailable(frame, ctx, undefined)).toBe(false);
  });
});
