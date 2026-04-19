/**
 * fills.ts — SVG defensive skip tests (TDD)
 *
 * Covers: IMAGE_PLACEHOLDER fills whose assetsMap entry is an SVG data URI
 * should NOT call figma.createImage (which throws), and should cleanly
 * fall back to surface color paint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub figma BEFORE importing the SUT (fills.ts reads global figma)
const createImageMock = vi.fn(() => ({ hash: "mock-hash-png" }));
vi.stubGlobal("figma", {
  createImage: createImageMock,
});

import { convertFillsToPaints } from "../rendering/fills";
import type { FigmaFill, RenderContext } from "../types";

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
    colorMode: "plugin",
    fontMode: "plugin",
    assetMode: "realAssets",
    assetsMap: new Map(),
    ...overrides,
  } as RenderContext;
}

const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';
// btoa works in happy-dom test environment
const SVG_DATA_URI = `data:image/svg+xml;base64,${btoa(SVG_MARKUP)}`;

// Minimal 1×1 PNG
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("convertFillsToPaints — SVG defensive skip", () => {
  beforeEach(() => {
    createImageMock.mockClear();
  });

  it("does NOT call figma.createImage for SVG data URI in assetsMap", () => {
    const assetsMap = new Map([["/logo.svg", SVG_DATA_URI]]);
    const fills: FigmaFill[] = [
      {
        type: "IMAGE_PLACEHOLDER",
        visible: true,
        opacity: 1,
        isImagePlaceholder: true,
        imageUrl: "/logo.svg",
      },
    ];

    convertFillsToPaints(fills, makeContext({ assetsMap }));

    expect(createImageMock).not.toHaveBeenCalled();
  });

  it("falls back to surface color paint when background is SVG", () => {
    const assetsMap = new Map([["/logo.svg", SVG_DATA_URI]]);
    const fills: FigmaFill[] = [
      {
        type: "IMAGE_PLACEHOLDER",
        visible: true,
        opacity: 1,
        isImagePlaceholder: true,
        imageUrl: "/logo.svg",
      },
    ];

    const result = convertFillsToPaints(fills, makeContext({ assetsMap }));

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("type", "SOLID");
  });

  it("still calls figma.createImage for PNG data URI (regression)", () => {
    const assetsMap = new Map([["/pic.png", PNG_DATA_URI]]);
    const fills: FigmaFill[] = [
      {
        type: "IMAGE_PLACEHOLDER",
        visible: true,
        opacity: 1,
        isImagePlaceholder: true,
        imageUrl: "/pic.png",
      },
    ];

    convertFillsToPaints(fills, makeContext({ assetsMap }));

    expect(createImageMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to surface color when URL is missing from assetsMap (unchanged)", () => {
    const fills: FigmaFill[] = [
      {
        type: "IMAGE_PLACEHOLDER",
        visible: true,
        opacity: 1,
        isImagePlaceholder: true,
        imageUrl: "/absent.svg",
      },
    ];

    const result = convertFillsToPaints(fills, makeContext({ assetsMap: new Map() }));

    expect(createImageMock).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("type", "SOLID");
  });
});
