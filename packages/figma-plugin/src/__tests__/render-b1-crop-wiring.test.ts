/**
 * B1 wiring: background-position / object-position flow end-to-end —
 * converter emission → CROP + imageTransform on the Figma paint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => ({
    fills: [] as unknown[],
    name: "",
    width: 0, height: 0,
    layoutMode: "NONE",
    clipsContent: true,
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild() { /* noop */ },
    remove() { /* noop */ },
  })),
  createImage: vi.fn(() => ({ hash: "mock-hash" })),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { convertFillsToPaints } from "../rendering/fills";
import { createRealImage } from "../rendering/realImages";
import type { RenderContext, WireframeNode, FigmaFill } from "../types";

// Minimal valid PNG header: 800×600.
function pngBase64(width: number, height: number): string {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes[16] = (width >>> 24) & 0xff; bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff; bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff; bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff; bytes[23] = height & 0xff;
  return Buffer.from(bytes).toString("base64");
}

function w2wFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 500, height: 500,
    quad: [0, 0, 500, 0, 500, 500, 0, 500],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function websiteContext(assets?: Map<string, string>): RenderContext {
  return {
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "realAssets",
    interactionMode: "none",
    variableMode: "none",
    assetsMap: assets,
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("converter emission", () => {
  it("emits fill.position from background-position", () => {
    const wf = convertW2WToWireframe(
      w2wFrame({
        children: [w2wFrame({
          styles: {
            display: "block",
            backgroundImage: 'url("https://site.com/hero.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "50% 30%",
          },
        })],
      }) as never,
      { layoutMode: "autoLayout" }
    ) as WireframeNode;
    const fill = wf.children![0].fills!.find((f) => f.type === "IMAGE_PLACEHOLDER")!;
    expect(fill.position).toEqual({ x: 0.5, y: 0.3 });
    expect(fill.elementWidth).toBe(500);
    expect(fill.elementHeight).toBe(500);
  });

  it("emits node.objectPosition for an <img> with object-position", () => {
    const wf = convertW2WToWireframe(
      w2wFrame({
        children: [w2wFrame({
          tag: "img",
          $url: "https://site.com/photo.jpg",
          styles: { display: "block", objectFit: "cover", objectPosition: "center bottom" },
        })],
      }) as never,
      { layoutMode: "autoLayout" }
    ) as WireframeNode;
    expect(wf.children![0].objectPosition).toEqual({ x: 0.5, y: 1 });
  });
});

describe("fills.ts CROP upgrade", () => {
  it("produces CROP + imageTransform for a positioned cover background", () => {
    const url = "https://site.com/hero.png";
    const assets = new Map([[url, `data:image/png;base64,${pngBase64(2000, 1000)}`]]);
    const fill = {
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      imageUrl: url,
      scaleMode: "FILL",
      position: { x: 0.5, y: 0 },
      elementWidth: 500,
      elementHeight: 500,
    } as unknown as FigmaFill;

    const paints = convertFillsToPaints([fill], websiteContext(assets));
    const paint = paints[0] as ImagePaint;
    expect(paint.type).toBe("IMAGE");
    expect(paint.scaleMode).toBe("CROP");
    // 2000×1000 in 500×500: visible width fraction 0.5, centered → tx 0.25.
    expect(paint.imageTransform![0][0]).toBeCloseTo(0.5, 5);
    expect(paint.imageTransform![0][2]).toBeCloseTo(0.25, 5);
    expect(paint.imageTransform![1][1]).toBeCloseTo(1, 5);
  });

  it("keeps plain FILL when no position is present", () => {
    const url = "https://site.com/hero.png";
    const assets = new Map([[url, `data:image/png;base64,${pngBase64(2000, 1000)}`]]);
    const fill = {
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      imageUrl: url,
      scaleMode: "FILL",
      elementWidth: 500,
      elementHeight: 500,
    } as unknown as FigmaFill;
    const paints = convertFillsToPaints([fill], websiteContext(assets));
    expect((paints[0] as ImagePaint).scaleMode).toBe("FILL");
  });
});

describe("realImages CROP upgrade", () => {
  it("applies CROP for object-position on a cover image", async () => {
    const node = {
      id: "img", name: "Image", type: "placeholder", tag: "img",
      x: 0, y: 0, width: 500, height: 500,
      layoutMode: "NONE", itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: null, backgroundGradient: null,
      textColor: "#000", borderColor: null,
      borderWidth: 0, borderRadius: 0, opacity: 1,
      textContent: "", fontSize: 16, fontWeight: 400,
      fontFamily: "Arial", textAlign: "left",
      lineHeight: "normal", letterSpacing: 0,
      objectFit: "cover",
      objectPosition: { x: 1, y: 0.5 },
    } as unknown as WireframeNode;

    const frame = await createRealImage(
      node,
      `data:image/png;base64,${pngBase64(2000, 1000)}`,
      websiteContext()
    );
    const paint = (frame.fills as ImagePaint[])[0];
    expect(paint.scaleMode).toBe("CROP");
    expect(paint.imageTransform![0][2]).toBeCloseTo(0.5, 5); // x=100% → full overflow
  });
});
