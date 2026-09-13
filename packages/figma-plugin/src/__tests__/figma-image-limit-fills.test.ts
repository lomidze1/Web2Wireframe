/**
 * A downscaled background keeps the page's geometry.
 *
 * With `background-size: auto` the painted size IS the image's natural pixel
 * size (imageCrop.ts computeBackgroundLayout), and the legacy TILE fallback
 * scales by it too. An image squeezed from 6016px to Figma's 4096px limit would
 * otherwise tile at 68% and crop wrong. The conversion records the original
 * size in `context.imageNaturalSizes`; fills.ts must measure with it.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", {
  createImage: vi.fn(() => ({ hash: "mock-hash" })),
  mixed: Symbol("figma.mixed"),
});

import { convertFillsToPaints } from "../rendering/fills";
import type { RenderContext, FigmaFill } from "../types";

function pngBase64(width: number, height: number): string {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes[16] = (width >>> 24) & 0xff; bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff; bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff; bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff; bytes[23] = height & 0xff;
  return Buffer.from(bytes).toString("base64");
}

function context(assets: Map<string, string>, naturalSizes?: Map<string, { width: number; height: number }>): RenderContext {
  return {
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "realAssets",
    interactionMode: "none",
    variableMode: "none",
    assetsMap: assets,
    ...(naturalSizes ? { imageNaturalSizes: naturalSizes } : {}),
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

const URL_ = "https://x.test/hero_2x.png";
const ORIGINAL = `data:image/png;base64,${pngBase64(6016, 1384)}`;
const DOWNSCALED = `data:image/png;base64,${pngBase64(4096, 942)}`;

function fill(overrides: Partial<FigmaFill>): FigmaFill[] {
  return [{
    type: "IMAGE_PLACEHOLDER",
    visible: true,
    opacity: 1,
    isImagePlaceholder: true,
    imageUrl: URL_,
    scaleMode: "FILL",
    elementWidth: 3008,
    elementHeight: 692,
    ...overrides,
  } as FigmaFill];
}

function paint(fills: FigmaFill[], ctx: RenderContext): ImagePaint {
  const paints = convertFillsToPaints(fills, ctx);
  expect(paints).toHaveLength(1);
  return paints[0] as ImagePaint;
}

describe("fills.ts measures a downscaled background by its original size", () => {
  it("background-size auto, no-repeat: the CROP transform equals the original's", () => {
    const f = fill({ cssSize: "auto", cssRepeat: "no-repeat" });
    const reference = paint(f, context(new Map([[URL_, ORIGINAL]])));
    const downscaled = paint(f, context(new Map([[URL_, DOWNSCALED]]), new Map([[URL_, { width: 6016, height: 1384 }]])));
    expect(reference.scaleMode).toBe("CROP");
    expect(downscaled.scaleMode).toBe("CROP");
    expect(downscaled.imageTransform).toEqual(reference.imageTransform);
  });

  it("background-size auto, repeat: the TILE scale equals the original's", () => {
    // Wider than one 6016px tile, so the repeat actually shows.
    const f = fill({ cssSize: "auto", cssRepeat: "repeat", elementWidth: 13000, elementHeight: 3000 });
    const reference = paint(f, context(new Map([[URL_, ORIGINAL]])));
    const downscaled = paint(f, context(new Map([[URL_, DOWNSCALED]]), new Map([[URL_, { width: 6016, height: 1384 }]])));
    expect(reference.scaleMode).toBe("TILE");
    expect(downscaled.scaleMode).toBe("TILE");
    expect(downscaled.scalingFactor).toBeCloseTo(reference.scalingFactor!, 6);
  });

  it("legacy px tile size: the scale equals the original's", () => {
    const f = fill({ scaleMode: "TILE", tileSize: { width: 1504, height: 346 } } as Partial<FigmaFill>);
    const reference = paint(f, context(new Map([[URL_, ORIGINAL]])));
    const downscaled = paint(f, context(new Map([[URL_, DOWNSCALED]]), new Map([[URL_, { width: 6016, height: 1384 }]])));
    expect(downscaled.scalingFactor).toBeCloseTo(reference.scalingFactor!, 6);
  });

  it("without a recorded original size nothing changes", () => {
    const f = fill({ cssSize: "auto", cssRepeat: "no-repeat" });
    const a = paint(f, context(new Map([[URL_, DOWNSCALED]])));
    const b = paint(f, context(new Map([[URL_, DOWNSCALED]]), new Map()));
    expect(b.imageTransform).toEqual(a.imageTransform);
  });
});
