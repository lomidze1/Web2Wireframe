/**
 * A7: realImages.ts base64 decoder lacked the whitespace-strip + padding fix
 * that fills.ts already has. MIME-style base64 with embedded newlines (or an
 * unpadded payload) produced garbage bytes — charCodeAt past the string end
 * returns NaN — and the resulting figma.createImage() bytes were corrupt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createdImages: Uint8Array[] = [];

function createMockFrameNode(): Record<string, unknown> {
  return {
    type: "FRAME",
    name: "",
    width: 100, height: 100,
    fills: [] as unknown[],
    children: [] as unknown[],
    layoutMode: "NONE",
    clipsContent: true,
    cornerRadius: undefined,
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: unknown) { (this.children as unknown[]).push(child); },
    remove() { /* noop */ },
  };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createImage: vi.fn((bytes: Uint8Array) => {
    createdImages.push(bytes);
    return { hash: "mock-hash" };
  }),
  createNodeFromSvg: vi.fn(() => createMockFrameNode()),
  mixed: Symbol("figma.mixed"),
});

import { createRealImage } from "../rendering/realImages";
import type { RenderContext, WireframeNode } from "../types";

function makeNode(): WireframeNode {
  return {
    id: "img1", name: "Image", type: "placeholder", tag: "img",
    x: 0, y: 0, width: 100, height: 100,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "rgb(0,0,0)", borderColor: null,
    borderWidth: 0, borderRadius: 0, opacity: 1,
    textContent: "", fontSize: 16, fontWeight: 400,
    fontFamily: "Arial", textAlign: "left",
    lineHeight: "normal", letterSpacing: 0,
  } as WireframeNode;
}

function mockContext(): RenderContext {
  return {
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
  } as unknown as RenderContext;
}

beforeEach(() => {
  createdImages.length = 0;
  vi.clearAllMocks();
});

describe("A7: base64 decoding in realImages", () => {
  const payload = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 4, 5, 6]);
  const clean = Buffer.from(payload).toString("base64");

  it("decodes MIME-wrapped base64 with embedded newlines correctly", async () => {
    // Insert a newline mid-payload the way MIME encoders wrap at 76 chars.
    const mid = Math.floor(clean.length / 2);
    const wrapped = clean.slice(0, mid) + "\r\n" + clean.slice(mid);
    await createRealImage(makeNode(), `data:image/png;base64,${wrapped}`, mockContext());
    expect(createdImages).toHaveLength(1);
    expect(Array.from(createdImages[0])).toEqual(Array.from(payload));
  });

  it("decodes unpadded base64 correctly", async () => {
    const unpadded = clean.replace(/=+$/, "");
    await createRealImage(makeNode(), `data:image/png;base64,${unpadded}`, mockContext());
    expect(createdImages).toHaveLength(1);
    expect(Array.from(createdImages[0])).toEqual(Array.from(payload));
  });

  it("decodes clean padded base64 exactly as before", async () => {
    await createRealImage(makeNode(), `data:image/png;base64,${clean}`, mockContext());
    expect(createdImages).toHaveLength(1);
    expect(Array.from(createdImages[0])).toEqual(Array.from(payload));
  });
});
