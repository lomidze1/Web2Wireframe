/**
 * Unit tests for realImages.ts — createRealImage
 * Tests real image rendering with Figma API mocks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks
// ============================================================================

const mockImageHash = "mock-image-hash-123";

const mockFrame = {
  name: "",
  resize: vi.fn(),
  fills: [] as unknown[],
  cornerRadius: 0,
  clipsContent: false,
  layoutMode: "NONE",
  primaryAxisSizingMode: "FIXED",
  counterAxisSizingMode: "FIXED",
  primaryAxisAlignItems: "CENTER",
  counterAxisAlignItems: "CENTER",
  appendChild: vi.fn(),
};

const mockSvgNode = {
  name: "",
  resize: vi.fn(),
  width: 100,
  height: 100,
};

// Setup global figma mock before module imports
vi.stubGlobal("figma", {
  createFrame: vi.fn(() => ({ ...mockFrame })),
  createImage: vi.fn(() => ({ hash: mockImageHash })),
  createNodeFromSvg: vi.fn(() => ({ ...mockSvgNode })),
});

// Import after mocking
import { createRealImage } from "../rendering/realImages";
import type { WireframeNode, RenderContext } from "../types";

// ============================================================================
// Helpers
// ============================================================================

function makeNode(overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-node",
    name: "Test Image",
    type: "placeholder",
    tag: "img",
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    isPlaceholder: true,
    textContent: "",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 1.5,
    letterSpacing: 0,
    children: [],
    ...overrides,
  } as WireframeNode;
}

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      text: "#11151A",
      background: "#F1F2F0",
      secondary: "#BDC1B2",
      surface: "#AAB5C3",
      accent: "#AFC6DC",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "plugin",
    fontMode: "plugin",
    textMode: "semantic",
    assetMode: "realAssets",
    assetsMap: new Map(),
    ...overrides,
  } as RenderContext;
}

// Minimal valid PNG in base64 (1x1 pixel, transparent)
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

// SVG data URI
const SVG_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';
const SVG_DATA_URI = `data:image/svg+xml;base64,${btoa(SVG_CONTENT)}`;

// ============================================================================
// Tests
// ============================================================================

describe("createRealImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates frame with IMAGE fill from valid PNG base64", async () => {
    const node = makeNode();
    const context = makeContext();

    const result = await createRealImage(node, PNG_DATA_URI, context);

    expect(result).toBeDefined();
    expect(figma.createFrame).toHaveBeenCalled();
    expect(figma.createImage).toHaveBeenCalled();
    // Should have IMAGE fill with the image hash
    expect(result.fills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "IMAGE",
          imageHash: mockImageHash,
          scaleMode: "FILL",
        }),
      ])
    );
  });

  it("applies borderRadius from node", async () => {
    const node = makeNode({ borderRadius: 8 });
    const context = makeContext();

    const result = await createRealImage(node, PNG_DATA_URI, context);

    expect(result.cornerRadius).toBe(8);
  });

  it("sets clipsContent to true", async () => {
    const node = makeNode();
    const context = makeContext();

    const result = await createRealImage(node, PNG_DATA_URI, context);

    expect(result.clipsContent).toBe(true);
  });

  it("handles SVG data by using createNodeFromSvg", async () => {
    const node = makeNode();
    const context = makeContext();

    const result = await createRealImage(node, SVG_DATA_URI, context);

    // Should detect SVG and use createNodeFromSvg
    expect(figma.createNodeFromSvg).toHaveBeenCalled();
  });

  it("falls back to placeholder frame on createImage error", async () => {
    // Make createImage throw
    vi.mocked(figma.createImage).mockImplementationOnce(() => {
      throw new Error("Invalid image data");
    });

    const node = makeNode();
    const context = makeContext();

    const result = await createRealImage(node, PNG_DATA_URI, context);

    // Should still return a valid frame (fallback)
    expect(result).toBeDefined();
    expect(result.name).toContain(node.name);
  });

  it("handles raw SVG markup (not data URI) by using createNodeFromSvg", async () => {
    const node = makeNode({ name: "SVG" });
    const context = makeContext();

    // Pass raw SVG markup, NOT a data URI — this is what css-converter stores
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="44"><path d="M0 0h14v44H0z"/></svg>';
    const result = await createRealImage(node, rawSvg, context);

    // Should detect raw SVG and use createNodeFromSvg
    expect(figma.createNodeFromSvg).toHaveBeenCalledWith(rawSvg);
    expect(result).toBeDefined();
  });

  it("raster-masquerade SVG: skips createNodeFromSvg, extracts embedded image", async () => {
    const node = makeNode({ name: "FakeLogo" });
    const context = makeContext();

    const masquerade = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image xlink:href="${PNG_DATA_URI}"/>
</svg>`;

    const result = await createRealImage(node, masquerade, context);

    // Should NOT call createNodeFromSvg — it's a fake vector
    expect(figma.createNodeFromSvg).not.toHaveBeenCalled();
    // Should extract the PNG and create an image fill
    expect(figma.createImage).toHaveBeenCalled();
    expect(result.fills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "IMAGE", imageHash: mockImageHash }),
      ])
    );
  });

  it("real vector SVG still uses createNodeFromSvg (regression)", async () => {
    const node = makeNode();
    const context = makeContext();

    const realSvg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24"/></svg>';
    await createRealImage(node, realSvg, context);

    expect(figma.createNodeFromSvg).toHaveBeenCalledWith(realSvg);
    expect(figma.createImage).not.toHaveBeenCalled();
  });

  it("resizes frame to node dimensions", async () => {
    const node = makeNode({ width: 300, height: 200 });
    const context = makeContext();

    const result = await createRealImage(node, PNG_DATA_URI, context);

    expect(result.resize).toHaveBeenCalledWith(300, 200);
  });
});
