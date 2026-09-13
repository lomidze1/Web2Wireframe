/**
 * Stage 2 semantic naming — role name from what the node paints (h2d's `iq`,
 * app.js:51842). Runs as a post-pass at the end of convertW2WToWireframe,
 * when fills/strokes/effects are known on the WireframeNode:
 *
 *   thin+long+painted → "Vertical Divider" / "Horizontal Divider"
 *   all-TEXT children → "Paragraph"
 *   paints joined with "+" → "Background+Border+Shadow" (fills→strokes→effects)
 *   image layers → filename from the URL ("decagon.png")
 *   fallback → "Container"; naming never throws, never leaves ''.
 */
import { describe, it, expect } from "vitest";

import { convertW2WToWireframe } from "../rendering/css-converter";
import { applyRoleNames } from "../rendering/naming";
import type { WireframeNode } from "../types";

type Styles = Record<string, string | number>;

function w2wFrame(
  styles: Styles,
  geo: { x: number; y: number; width: number; height: number },
  extra: Record<string, unknown> = {},
  children: unknown[] = [],
) {
  return {
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    ...geo,
    quad: [
      geo.x, geo.y,
      geo.x + geo.width, geo.y,
      geo.x + geo.width, geo.y + geo.height,
      geo.x, geo.y + geo.height,
    ],
    styles,
    children,
    ...extra,
  };
}

function w2wText(value: string, geo = { x: 0, y: 0, width: 100, height: 20 }) {
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

const GEO = { x: 0, y: 0, width: 200, height: 100 };

function convert(root: unknown): WireframeNode {
  return convertW2WToWireframe(root as never, { layoutMode: "autoLayout" });
}

describe("stage 2 — divider detection", () => {
  it("thin painted vertical strip → 'Vertical Divider'", () => {
    const out = convert(
      w2wFrame({ backgroundColor: "rgb(200, 200, 200)" }, { x: 0, y: 0, width: 1, height: 40 }),
    );
    expect(out.name).toBe("Vertical Divider");
  });

  it("thin painted horizontal strip → 'Horizontal Divider'", () => {
    const out = convert(
      w2wFrame({ backgroundColor: "rgb(200, 200, 200)" }, { x: 0, y: 0, width: 300, height: 1 }),
    );
    expect(out.name).toBe("Horizontal Divider");
  });

  it("unpainted thin strip is NOT a divider", () => {
    const out = convert(w2wFrame({}, { x: 0, y: 0, width: 300, height: 1 }));
    expect(out.name).toBe("Container");
  });
});

describe("stage 2 — Paragraph", () => {
  it("a div whose children are all TEXT → 'Paragraph'", () => {
    // display:flex prevents text coalescing into the div itself (layout
    // container), so the TEXT children survive as text nodes.
    const out = convert(
      w2wFrame({ display: "flex", flexDirection: "column" }, GEO, {}, [
        w2wText("First line", { x: 0, y: 0, width: 180, height: 20 }),
        w2wText("Second line", { x: 0, y: 24, width: 160, height: 20 }),
      ]),
    );
    expect(out.children.every((c) => c.type === "text")).toBe(true);
    expect(out.name).toBe("Paragraph");
  });
});

describe("stage 2 — paint parts joined with '+'", () => {
  it("solid fill → 'Background'", () => {
    const out = convert(w2wFrame({ backgroundColor: "rgb(255, 255, 255)" }, GEO));
    expect(out.name).toBe("Background");
  });

  it("semi-transparent fill (opacity <= 0.9) → 'Overlay'", () => {
    const out = convert(
      w2wFrame({ backgroundColor: "rgb(0, 0, 0)", opacity: "0.5" }, GEO),
    );
    expect(out.name).toBe("Overlay");
  });

  it("gradient fill → 'Gradient'", () => {
    const out = convert(
      w2wFrame(
        { backgroundImage: "linear-gradient(180deg, rgb(255, 0, 0), rgb(0, 0, 255))" },
        GEO,
      ),
    );
    expect(out.name).toBe("Gradient");
  });

  it("border on all sides → 'Border'", () => {
    const out = convert(
      w2wFrame(
        {
          borderTopWidth: "1px", borderTopColor: "rgb(0,0,0)", borderTopStyle: "solid",
          borderRightWidth: "1px", borderRightColor: "rgb(0,0,0)", borderRightStyle: "solid",
          borderBottomWidth: "1px", borderBottomColor: "rgb(0,0,0)", borderBottomStyle: "solid",
          borderLeftWidth: "1px", borderLeftColor: "rgb(0,0,0)", borderLeftStyle: "solid",
        },
        GEO,
      ),
    );
    expect(out.name).toBe("Border");
  });

  it("top/bottom-only border → 'HorizontalBorder', left/right-only → 'VerticalBorder'", () => {
    const horizontal = convert(
      w2wFrame(
        { borderBottomWidth: "1px", borderBottomColor: "rgb(0,0,0)", borderBottomStyle: "solid" },
        GEO,
      ),
    );
    expect(horizontal.name).toBe("HorizontalBorder");
    const vertical = convert(
      w2wFrame(
        { borderLeftWidth: "2px", borderLeftColor: "rgb(0,0,0)", borderLeftStyle: "solid" },
        GEO,
      ),
    );
    expect(vertical.name).toBe("VerticalBorder");
  });

  it("shadow / blur effects → 'Shadow' / 'OverlayBlur'", () => {
    const shadow = convert(
      w2wFrame({ boxShadow: "rgba(0, 0, 0, 0.2) 0px 4px 8px 0px" }, GEO),
    );
    expect(shadow.name).toBe("Shadow");
    const blur = convert(w2wFrame({ backdropFilter: "blur(10px)" }, GEO));
    expect(blur.name).toBe("OverlayBlur");
  });

  it("joins fills→strokes→effects: 'Background+Border+Shadow'", () => {
    const out = convert(
      w2wFrame(
        {
          backgroundColor: "rgb(255, 255, 255)",
          borderTopWidth: "1px", borderTopColor: "rgb(0,0,0)", borderTopStyle: "solid",
          borderRightWidth: "1px", borderRightColor: "rgb(0,0,0)", borderRightStyle: "solid",
          borderBottomWidth: "1px", borderBottomColor: "rgb(0,0,0)", borderBottomStyle: "solid",
          borderLeftWidth: "1px", borderLeftColor: "rgb(0,0,0)", borderLeftStyle: "solid",
          boxShadow: "rgba(0, 0, 0, 0.2) 0px 4px 8px 0px",
        },
        GEO,
      ),
    );
    expect(out.name).toBe("Background+Border+Shadow");
  });
});

describe("stage 2 — image layers named by filename", () => {
  it("img with $url → last path segment ('decagon.png')", () => {
    const out = convert(
      w2wFrame({}, GEO, {
        tag: "img",
        $url: "https://images.stripeassets.com/media/decagon.png?w=400&q=80",
      }),
    );
    expect(out.name).toBe("decagon.png");
  });

  it("decodes percent-encoding and ignores data: URIs", () => {
    const encoded = convert(
      w2wFrame({}, GEO, { tag: "img", $url: "https://cdn.x.com/hero%20image.jpg" }),
    );
    expect(encoded.name).toBe("hero image.jpg");
    const dataUri = convert(
      w2wFrame({}, GEO, { tag: "img", $url: "data:image/png;base64,iVBORw0KGgo=" }),
    );
    expect(dataUri.name.length).toBeGreaterThan(0);
    expect(dataUri.name).not.toContain("base64");
  });
});

describe("stage 2 — contract", () => {
  it("plain div with nothing → 'Container'", () => {
    expect(convert(w2wFrame({}, GEO)).name).toBe("Container");
  });

  it("never leaves an empty name anywhere in a converted tree (both modes)", () => {
    const tree = w2wFrame({ display: "flex" }, { x: 0, y: 0, width: 800, height: 600 }, {}, [
      w2wFrame({ backgroundColor: "rgb(250, 250, 250)" }, { x: 0, y: 0, width: 800, height: 80 }, { tag: "header" }, [
        w2wFrame({}, { x: 10, y: 10, width: 200, height: 40 }, { tag: "nav" }),
      ]),
      w2wFrame({}, { x: 0, y: 80, width: 800, height: 400 }, {}, [
        w2wFrame({}, { x: 0, y: 0, width: 1, height: 300 }),
        w2wFrame({}, { x: 10, y: 0, width: 300, height: 24 }, { tag: "h2" }, [w2wText("Title")]),
      ]),
    ]);
    for (const htmlLayerNames of [false, true]) {
      const out = convertW2WToWireframe(structuredClone(tree) as never, {
        layoutMode: "autoLayout",
        htmlLayerNames,
      });
      const walk = (n: WireframeNode): void => {
        expect(typeof n.name).toBe("string");
        expect(n.name.length).toBeGreaterThan(0);
        (n.children ?? []).forEach(walk);
      };
      walk(out);
    }
  });

  it("applyRoleNames tolerates malformed nodes without throwing", () => {
    const broken = {
      name: "",
      type: "frame",
      width: NaN,
      height: NaN,
      opacity: 1,
      fills: [{ type: "SOLID" }],
      children: [{ name: "", type: "text", children: undefined }],
    } as unknown as WireframeNode;
    expect(() => applyRoleNames(broken)).not.toThrow();
    expect(broken.name.length).toBeGreaterThan(0);
    expect(broken.children[0].name).toBe("Text");
  });
});
