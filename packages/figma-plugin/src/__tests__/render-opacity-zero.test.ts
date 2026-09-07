/**
 * A fully transparent node has to reach Figma fully transparent.
 *
 * Partial transparency is a colour effect, so plugin-colors mode (flat
 * wireframes) skips it. `opacity: 0` is not a colour choice though — it is how
 * a crossfade carousel keeps seven of its eight slides out of sight. Skipping
 * it there would stack all eight opaque headlines on top of each other, which
 * is why zero applies in every mode.
 */

import { describe, it, expect } from "vitest";
import { applySharedDecorations } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";

function makeContext(colorMode: "plugin" | "website"): RenderContext {
  return {
    pluginColors: {} as RenderContext["pluginColors"],
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode,
    fontMode: "website",
    textMode: "website",
  } as RenderContext;
}

/** Just enough of a Figma node for the decoration pass to write onto. */
function makeTarget() {
  return { opacity: 1, blendMode: "PASS_THROUGH", visible: true } as unknown as SceneNode & {
    opacity: number;
  };
}

const node = (opacity: number): WireframeNode => ({ opacity }) as WireframeNode;

describe("applySharedDecorations: opacity", () => {
  it("carries opacity: 0 through in website-colors mode", () => {
    const target = makeTarget();

    applySharedDecorations(target, node(0), makeContext("website"));

    expect(target.opacity).toBe(0);
  });

  it("carries opacity: 0 through in plugin-colors mode too", () => {
    const target = makeTarget();

    applySharedDecorations(target, node(0), makeContext("plugin"));

    expect(target.opacity).toBe(0);
  });

  it("still applies partial transparency in website-colors mode", () => {
    const target = makeTarget();

    applySharedDecorations(target, node(0.4), makeContext("website"));

    expect(target.opacity).toBeCloseTo(0.4);
  });

  it("still ignores partial transparency in plugin-colors mode", () => {
    const target = makeTarget();

    applySharedDecorations(target, node(0.4), makeContext("plugin"));

    expect(target.opacity).toBe(1);
  });

  it("leaves a fully opaque node alone", () => {
    const target = makeTarget();

    applySharedDecorations(target, node(1), makeContext("website"));

    expect(target.opacity).toBe(1);
  });
});
