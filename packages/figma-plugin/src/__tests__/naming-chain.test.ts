/**
 * Stage 3 — names carried through wrapper collapses, h2d-style " → " chains.
 *
 * When the text coalescer folds a sole inline wrapper into its parent
 * (`classifyWrapper` → 'collapse' / 'bubble'), the surviving text node keeps
 * the wrapper's semantic identity: `<h3><em>Big</em></h3>` →
 * "Heading 3 → Emphasis → Big". Chains are capped (innermost segments win).
 */
import { describe, it, expect } from "vitest";

import { convertW2WToWireframe } from "../rendering/css-converter";
import { chainNames } from "../rendering/naming";
import type { WireframeNode } from "../types";

function w2wFrame(
  tag: string,
  opts: {
    styles?: Record<string, string | number>;
    classList?: string[];
    attr?: Record<string, string>;
    geo?: { x: number; y: number; width: number; height: number };
    children?: unknown[];
  } = {},
) {
  const geo = opts.geo ?? { x: 0, y: 0, width: 300, height: 24 };
  return {
    type: "FRAME",
    tag,
    classList: opts.classList ?? [],
    attr: opts.attr ?? {},
    ...geo,
    quad: [
      geo.x, geo.y,
      geo.x + geo.width, geo.y,
      geo.x + geo.width, geo.y + geo.height,
      geo.x, geo.y + geo.height,
    ],
    styles: opts.styles ?? { fontSize: "16px", fontFamily: "Arial" },
    children: opts.children ?? [],
  };
}

function w2wText(value: string, geo = { x: 0, y: 0, width: 200, height: 20 }) {
  return {
    type: "TEXT",
    ...geo,
    quad: [
      geo.x, geo.y,
      geo.x + geo.width, geo.y,
      geo.x + geo.width, geo.y + geo.height,
      geo.x, geo.y + geo.height,
    ],
    value,
    font: "16px Arial",
  };
}

function convert(root: unknown, htmlLayerNames = false): WireframeNode {
  return convertW2WToWireframe(root as never, {
    layoutMode: "autoLayout",
    htmlLayerNames,
  });
}

describe("chainNames", () => {
  it("joins segments with ' → '", () => {
    expect(chainNames(["List", "Item"])).toBe("List → Item");
  });

  it("caps at 3 segments keeping the INNERMOST ones", () => {
    expect(chainNames(["List", "Item", "Link", "Pricing"])).toBe(
      "Item → Link → Pricing",
    );
  });

  it("flattens pre-joined segments and drops empties", () => {
    expect(chainNames(["", "Heading 3 → Emphasis", "Big"])).toBe(
      "Heading 3 → Emphasis → Big",
    );
  });
});

describe("collapse chains through the text coalescer", () => {
  it("sole <a> wrapper inside <p> → 'Link - <content>'", () => {
    const out = convert(
      w2wFrame("p", {
        children: [w2wFrame("a", { children: [w2wText("Pricing")] })],
      }),
    );
    expect(out.type).toBe("text");
    expect(out.name).toBe("Link - Pricing");
  });

  it("sole mapped wrapper chains under the parent: h3>em → 'Heading 3 → Emphasis → Big'", () => {
    const out = convert(
      w2wFrame("h3", {
        children: [w2wFrame("em", { children: [w2wText("Big")] })],
      }),
    );
    expect(out.type).toBe("text");
    expect(out.name).toBe("Heading 3 → Emphasis → Big");
  });

  it("sole unmapped wrapper leaves the parent's chain unchanged: h3>span → 'Heading 3 → <content>'", () => {
    const out = convert(
      w2wFrame("h3", {
        children: [w2wFrame("span", { children: [w2wText("Apple Wallet")] })],
      }),
    );
    expect(out.type).toBe("text");
    expect(out.name).toBe("Heading 3 → Apple Wallet");
  });

  it("multiple collapsed wrappers keep the parent identity (no misleading chain)", () => {
    const out = convert(
      w2wFrame("p", {
        geo: { x: 0, y: 0, width: 400, height: 24 },
        children: [
          w2wFrame("a", {
            geo: { x: 0, y: 0, width: 100, height: 20 },
            children: [w2wText("Terms", { x: 0, y: 0, width: 100, height: 20 })],
          }),
          w2wFrame("a", {
            geo: { x: 120, y: 0, width: 100, height: 20 },
            children: [w2wText("Privacy", { x: 120, y: 0, width: 100, height: 20 })],
          }),
        ],
      }),
    );
    expect(out.type).toBe("text");
    // Content-only name — neither link's identity can claim the whole node.
    expect(out.name).toBe("Terms Privacy");
  });

  it("htmlLayerNames: true keeps legacy names — no chains", () => {
    const out = convert(
      w2wFrame("p", {
        classList: ["intro"],
        children: [w2wFrame("a", { children: [w2wText("Pricing")] })],
      }),
      true,
    );
    expect(out.name).toBe("p.intro");
  });
});
