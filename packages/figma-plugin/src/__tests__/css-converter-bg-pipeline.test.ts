/**
 * Defect 1 wiring: raw background-size / background-repeat /
 * background-position strings flow from the converter into fills.ts, where
 * the natural image size turns them into the h2d-style CROP/TILE paint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("figma", {
  createImage: vi.fn(() => ({ hash: "mock-hash" })),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { convertFillsToPaints } from "../rendering/fills";
import type { RenderContext, FigmaFill } from "../types";

// Minimal valid PNG header carrying a width/height (same as render-b1-crop-wiring).
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
    x: 0, y: 0, width: 300, height: 200,
    quad: [0, 0, 300, 0, 300, 200, 0, 200],
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

describe("converter emission — raw background strings", () => {
  it("forwards cssSize / cssRepeat / cssPosition on the image fill", () => {
    const wf = convertW2WToWireframe(
      w2wFrame({
        styles: {
          display: "block",
          backgroundImage: "url(https://x.test/icon.png)",
          backgroundSize: "auto",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "20px 30px",
        },
      }),
      undefined,
    );
    const fill = (wf.fills as FigmaFill[]).find((f) => f.type === "IMAGE_PLACEHOLDER")!;
    expect(fill).toBeDefined();
    expect(fill.cssSize).toBe("auto");
    expect(fill.cssRepeat).toBe("no-repeat");
    expect(fill.cssPosition).toBe("20px 30px");
  });

  it("splits per-layer values for multi-layer backgrounds", () => {
    const wf = convertW2WToWireframe(
      w2wFrame({
        styles: {
          display: "block",
          backgroundImage: "url(https://x.test/a.png), url(https://x.test/b.png)",
          backgroundSize: "cover, 24px 24px",
          backgroundRepeat: "no-repeat, repeat",
        },
      }),
      undefined,
    );
    const fills = (wf.fills as FigmaFill[]).filter((f) => f.type === "IMAGE_PLACEHOLDER");
    expect(fills).toHaveLength(2);
    expect(fills[0].cssSize).toBe("cover");
    expect(fills[0].cssRepeat).toBe("no-repeat");
    expect(fills[1].cssSize).toBe("24px 24px");
    expect(fills[1].cssRepeat).toBe("repeat");
  });
});

describe("fills.ts consumption — natural size + raw strings → CROP/TILE", () => {
  it("background-size auto + no-repeat renders the icon at natural size (CROP), not stretched", () => {
    const url = "https://x.test/icon.png";
    const assets = new Map([[url, `data:image/png;base64,${pngBase64(24, 24)}`]]);
    const fills: FigmaFill[] = [{
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      isImagePlaceholder: true,
      imageUrl: url,
      scaleMode: "FILL",
      cssSize: "auto",
      cssRepeat: "no-repeat",
      elementWidth: 300,
      elementHeight: 200,
    }];
    const paints = convertFillsToPaints(fills, websiteContext(assets));
    expect(paints).toHaveLength(1);
    const paint = paints[0] as ImagePaint;
    expect(paint.type).toBe("IMAGE");
    expect(paint.scaleMode).toBe("CROP");
    const t = paint.imageTransform!;
    expect(t[0][0]).toBeCloseTo(300 / 24, 5);
    expect(t[1][1]).toBeCloseTo(200 / 24, 5);
  });

  it("repeat-x hairline at box height tiles with the painted scale", () => {
    const url = "https://x.test/hairline.png";
    const assets = new Map([[url, `data:image/png;base64,${pngBase64(10, 4)}`]]);
    const fills: FigmaFill[] = [{
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      isImagePlaceholder: true,
      imageUrl: url,
      scaleMode: "FILL",
      cssRepeat: "repeat-x",
      elementWidth: 300,
      elementHeight: 4,
    }];
    const paints = convertFillsToPaints(fills, websiteContext(assets));
    expect(paints).toHaveLength(1);
    const paint = paints[0] as ImagePaint;
    expect(paint.scaleMode).toBe("TILE");
    expect(paint.scalingFactor).toBeCloseTo(1, 5);
  });

  it("without raw css strings the legacy FILL path is untouched", () => {
    const url = "https://x.test/legacy.png";
    const assets = new Map([[url, `data:image/png;base64,${pngBase64(800, 600)}`]]);
    const fills: FigmaFill[] = [{
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      isImagePlaceholder: true,
      imageUrl: url,
      scaleMode: "FILL",
      elementWidth: 300,
      elementHeight: 200,
    }];
    const paints = convertFillsToPaints(fills, websiteContext(assets));
    expect(paints).toHaveLength(1);
    const paint = paints[0] as ImagePaint;
    expect(paint.scaleMode).toBe("FILL");
    expect(paint.imageTransform).toBeUndefined();
  });
});
