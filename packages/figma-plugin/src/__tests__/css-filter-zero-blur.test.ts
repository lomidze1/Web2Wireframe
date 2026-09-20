/**
 * `filter: blur(0px)` means "no blur" — it is the settled end state of the
 * reveal animations modern sites build with. chroniclehq.com ships it on 12
 * wrappers, among them a 969x654 hero (80 descendants) and the logo strip
 * (47), and never carries a non-zero blur anywhere.
 *
 * Parsing those into a LAYER_BLUR effect handed Figma a blur that applies to
 * the frame AND its entire subtree, so the whole import came back fogged.
 * A zero-radius blur is a no-op and should never become an effect at all —
 * the same reasoning that already drops no-op box-shadows (see
 * css-converter-shadow-order.test.ts).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaEffect } from "../types";

function effectsFor(styles: Record<string, string>): FigmaEffect[] {
  const result = convertW2WToWireframe(
    {
      type: "FRAME",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      quad: [0, 0, 200, 0, 200, 100, 0, 100],
      tag: "div",
      classList: [],
      attr: {},
      styles: { display: "block", ...styles },
      children: [],
    },
    undefined,
  );
  return (result.effects as FigmaEffect[] | undefined) ?? [];
}

describe("zero-radius blur is not an effect", () => {
  it("ignores filter: blur(0px)", () => {
    expect(effectsFor({ filter: "blur(0px)" })).toEqual([]);
  });

  it("ignores backdrop-filter: blur(0px)", () => {
    expect(effectsFor({ backdropFilter: "blur(0px)" })).toEqual([]);
  });

  it("ignores a zero blur written without a unit", () => {
    expect(effectsFor({ filter: "blur(0)" })).toEqual([]);
  });

  it("still converts a real filter blur", () => {
    const effects = effectsFor({ filter: "blur(8px)" });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("LAYER_BLUR");
    expect(effects[0].blurRadius).toBe(8);
  });

  it("still converts a real backdrop blur", () => {
    const effects = effectsFor({ backdropFilter: "blur(12px)" });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("BACKGROUND_BLUR");
    expect(effects[0].blurRadius).toBe(12);
  });

  it("keeps a drop-shadow whose own blur is zero", () => {
    // The zero here belongs to drop-shadow(), not to a blur() — dropping it
    // would delete a shadow the page actually paints.
    const effects = effectsFor({ filter: "drop-shadow(0px 2px 0px red)" });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("DROP_SHADOW");
  });

  it("keeps a real blur that sits alongside a drop-shadow", () => {
    const effects = effectsFor({
      filter: "drop-shadow(0px 2px 4px red) blur(6px)",
    });
    expect(effects.map((e) => e.type).sort()).toEqual([
      "DROP_SHADOW",
      "LAYER_BLUR",
    ]);
    expect(effects.find((e) => e.type === "LAYER_BLUR")?.blurRadius).toBe(6);
  });

  it("drops a zero blur but keeps the drop-shadow beside it", () => {
    const effects = effectsFor({
      filter: "drop-shadow(0px 2px 4px red) blur(0px)",
    });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("DROP_SHADOW");
  });
});
