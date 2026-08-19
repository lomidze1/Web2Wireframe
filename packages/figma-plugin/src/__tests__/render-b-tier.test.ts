/**
 * B-tier render-fidelity improvements.
 *
 * B4: CSS min-width/min-height/max-height → native Figma minWidth/minHeight/
 *     maxHeight on auto-layout children (imports keep their CSS floors when
 *     edited; previously only max-width survived).
 * B5: base-state text-shadow and `filter: drop-shadow()` → DROP_SHADOW
 *     effects (both already worked on hover variants but rendered flat in
 *     the default state).
 * B7: <a href> → TextNode.hyperlink (the URL was captured and then only used
 *     to pick a link color).
 * Plus: gradient paints now carry fill.opacity (previously dropped).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("figma", {
  createFrame: vi.fn(),
  createText: vi.fn(),
  loadFontAsync: vi.fn(async () => undefined),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { convertFillsToPaints } from "../rendering/fills";
import type { FigmaFill, RenderContext, WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Converter helpers
// ---------------------------------------------------------------------------

function w2wFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 1200, height: 400,
    quad: [0, 0, 1200, 0, 1200, 400, 0, 400],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function w2wText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
    value,
    font: "Inter Regular",
    ...overrides,
  };
}

function convert(tree: Record<string, unknown>): WireframeNode {
  return convertW2WToWireframe(tree as never, { layoutMode: "autoLayout" }) as WireframeNode;
}

// ---------------------------------------------------------------------------
// B4 — converter emission
// ---------------------------------------------------------------------------

describe("B4: min/max size emission (css-converter)", () => {
  it("emits cssMinWidth / cssMinHeight / cssMaxHeight for px values", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        styles: {
          display: "block",
          minWidth: "220px",
          minHeight: "480px",
          maxHeight: "600px",
        },
      })],
    }));
    const child = wf.children![0];
    expect(child.cssMinWidth).toBe(220);
    expect(child.cssMinHeight).toBe(480);
    expect(child.cssMaxHeight).toBe(600);
  });

  it("skips 0px / auto / none / percentages", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        styles: {
          display: "block",
          minWidth: "0px",
          minHeight: "auto",
          maxHeight: "none",
          maxWidth: "50%",
        },
      })],
    }));
    const child = wf.children![0];
    expect(child.cssMinWidth).toBeUndefined();
    expect(child.cssMinHeight).toBeUndefined();
    expect(child.cssMaxHeight).toBeUndefined();
    expect(child.cssMaxWidth).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B5 — effects in base state
// ---------------------------------------------------------------------------

describe("B5: filter drop-shadow + text-shadow (css-converter)", () => {
  it("converts filter: drop-shadow() to a DROP_SHADOW effect", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        styles: {
          display: "block",
          filter: "drop-shadow(rgba(0, 0, 0, 0.3) 0px 4px 6px)",
        },
      })],
    }));
    const child = wf.children![0];
    expect(child.effects).toBeDefined();
    const ds = child.effects!.find((e) => e.type === "DROP_SHADOW");
    expect(ds).toBeDefined();
    expect(ds!.offset).toEqual({ x: 0, y: 4 });
    expect(ds!.radius).toBe(6);
    expect(ds!.color!.a).toBeCloseTo(0.3, 2);
  });

  it("keeps blur() working alongside drop-shadow()", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        styles: {
          display: "block",
          filter: "blur(3px) drop-shadow(rgb(255, 0, 0) 2px 2px 2px)",
        },
      })],
    }));
    const child = wf.children![0];
    const types = (child.effects || []).map((e) => e.type).sort();
    expect(types).toContain("LAYER_BLUR");
    expect(types).toContain("DROP_SHADOW");
  });

  it("carries text-shadow onto coalesced text nodes as textShadowEffects", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        tag: "h1",
        styles: {
          display: "block",
          fontSize: "48px",
          textShadow: "rgba(0, 0, 0, 0.5) 0px 2px 4px",
        },
        children: [w2wText("Hero Title", { width: 400, height: 50 })],
      })],
    }));
    const h1 = wf.children![0];
    expect(h1.type).toBe("text");
    expect(h1.textShadowEffects).toBeDefined();
    expect(h1.textShadowEffects![0].type).toBe("DROP_SHADOW");
    expect(h1.textShadowEffects![0].offset).toEqual({ x: 0, y: 2 });
    expect(h1.textShadowEffects![0].radius).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// B7 — hyperlink extraction
// ---------------------------------------------------------------------------

describe("B7: <a href> → node.href (css-converter)", () => {
  const BASE = "https://example.com/products/page.html";

  it("keeps absolute http(s) hrefs", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        tag: "a",
        attr: { href: "https://other.com/x", baseURI: BASE },
        styles: { display: "inline-block" },
        children: [w2wText("Link text")],
      })],
    }));
    const link = wf.children![0];
    expect(link.href).toBe("https://other.com/x");
  });

  it("resolves root-relative hrefs against the element's origin", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        tag: "a",
        attr: { href: "/pricing", baseURI: BASE },
        styles: { display: "inline-block" },
        children: [w2wText("Pricing")],
      })],
    }));
    expect(wf.children![0].href).toBe("https://example.com/pricing");
  });

  it("resolves path-relative hrefs against the base directory", () => {
    const wf = convert(w2wFrame({
      children: [w2wFrame({
        tag: "a",
        attr: { href: "details.html", baseURI: BASE },
        styles: { display: "inline-block" },
        children: [w2wText("Details")],
      })],
    }));
    expect(wf.children![0].href).toBe("https://example.com/products/details.html");
  });

  it("skips fragment and javascript: hrefs", () => {
    const wf = convert(w2wFrame({
      children: [
        w2wFrame({
          tag: "a",
          attr: { href: "#section", baseURI: BASE },
          styles: { display: "inline-block" },
          children: [w2wText("Anchor")],
        }),
        w2wFrame({
          tag: "a",
          attr: { href: "javascript:void(0)", baseURI: BASE },
          styles: { display: "inline-block" },
          children: [w2wText("JS link")],
        }),
      ],
    }));
    expect(wf.children![0].href).toBeUndefined();
    expect(wf.children![1].href).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gradient paint opacity passthrough (fills.ts)
// ---------------------------------------------------------------------------

describe("gradient paint opacity", () => {
  it("carries fill.opacity onto the GradientPaint", () => {
    const context = {
      colorMode: "website",
      pluginColors: {
        text: "#000", primary: "#000", secondary: "#888",
        background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
      },
    } as unknown as RenderContext;
    const fill = {
      type: "GRADIENT_LINEAR",
      visible: true,
      opacity: 0.4,
      angle: 90,
      elementWidth: 100,
      elementHeight: 100,
      stops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
    } as unknown as FigmaFill;
    const paints = convertFillsToPaints([fill], context);
    expect((paints[0] as GradientPaint).opacity).toBeCloseTo(0.4, 3);
  });
});
