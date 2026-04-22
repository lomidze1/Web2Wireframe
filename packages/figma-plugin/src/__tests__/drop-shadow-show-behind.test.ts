/**
 * Drop Shadow `showShadowBehindNode` regression
 *
 * W-05 comparison vs h2d found that our Pro card appeared darker than the
 * real site. The difference traced 100% to Figma's "Show behind transparent
 * areas" toggle on the drop shadow: we defaulted to ON (Figma's API default
 * when unset), h2d defaults to OFF. With a translucent gradient fill, the
 * shadow bleeds through the transparent parts and darkens the surface.
 *
 * Fix: always emit `showShadowBehindNode: false` when building DROP_SHADOW
 * effects. INNER_SHADOW doesn't have this property (shadow is inside the
 * shape; it's unaffected by transparent-area behavior).
 */
import { describe, it, expect } from "vitest";
import { convertEffectsToFigma } from "../rendering/fills";
import type { FigmaEffect, RenderContext } from "../types";

const DEFAULT_PLUGIN_COLORS = {
  text: "#11151A",
  background: "#F1F2F0",
  secondary: "#1f3a5f",
  surface: "#f5f5f5",
  accent: "#3b82f6",
};

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: DEFAULT_PLUGIN_COLORS,
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "absolute",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website", // must be "website" so shadows aren't filtered out
    fontMode: "plugin",
    ...overrides,
  } as RenderContext;
}

describe("DROP_SHADOW — showShadowBehindNode must be false", () => {
  it("box-shadow DROP_SHADOW emits showShadowBehindNode: false", () => {
    const effects: FigmaEffect[] = [
      {
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0.23, g: 0.51, b: 0.96, a: 0.2 },
        offset: { x: 0, y: 24 },
        radius: 60,
        spread: 0,
      },
    ];

    const result = convertEffectsToFigma(effects, makeContext());

    expect(result).toHaveLength(1);
    const shadow = result[0] as DropShadowEffect;
    expect(shadow.type).toBe("DROP_SHADOW");
    expect(shadow.showShadowBehindNode).toBe(false);
  });

  it("every DROP_SHADOW in a multi-effect list carries showShadowBehindNode: false", () => {
    const effects: FigmaEffect[] = [
      {
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: { x: 0, y: 4 },
        radius: 8,
      },
      {
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.05 },
        offset: { x: 0, y: 12 },
        radius: 24,
      },
    ];

    const result = convertEffectsToFigma(effects, makeContext());

    expect(result).toHaveLength(2);
    for (const effect of result) {
      expect((effect as DropShadowEffect).showShadowBehindNode).toBe(false);
    }
  });

  it("INNER_SHADOW does NOT carry showShadowBehindNode (field is DROP_SHADOW-only in Figma API)", () => {
    const effects: FigmaEffect[] = [
      {
        type: "INNER_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.2 },
        offset: { x: 0, y: 2 },
        radius: 4,
      },
    ];

    const result = convertEffectsToFigma(effects, makeContext());

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("INNER_SHADOW");
    // Field must not appear on INNER_SHADOW — it's only valid on DROP_SHADOW
    expect((result[0] as unknown as Record<string, unknown>).showShadowBehindNode).toBeUndefined();
  });
});
