/**
 * Render-level proof of the loadFontAsync memoization: rendering a SECOND
 * text node with the same font must not hit figma.loadFontAsync again.
 *
 * This is the fix for the measured stripe.com pathology — 18,627 loads for
 * 697 text nodes (~27 per node), 158.6s of a 216s import. The per-node
 * candidate loops still run; the cache just answers all repeats.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode } from "../types";

function createMockTextNode() {
  return {
    type: "TEXT",
    name: "",
    characters: "",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 12,
    textAlignHorizontal: "LEFT",
    textAlignVertical: "TOP",
    textAutoResize: "WIDTH_AND_HEIGHT",
    fills: [],
    lineHeight: { unit: "AUTO" },
    letterSpacing: { unit: "PIXELS", value: 0 },
    textDecoration: "NONE",
    opacity: 1,
    visible: true,
    locked: false,
    resize: vi.fn(),
    remove: vi.fn(),
    getRangeFontName: vi.fn(() => ({ family: "Inter", style: "Regular" })),
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
    setRangeFills: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeHyperlink: vi.fn(),
  };
}

let loadFontMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  loadFontMock = vi.fn(async () => undefined);
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: loadFontMock,
  };
  const { resetFontCacheForTests } = await import("../rendering/fontLoader");
  resetFontCacheForTests();
});

import { createTextNode } from "../rendering/text";

function textNode(id: string, value: string): WireframeNode {
  return {
    id,
    name: "Text",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 200,
    height: 20,
    textContent: value,
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    children: [],
  } as unknown as WireframeNode;
}

describe("font-load memoization across text nodes", () => {
  it("second node with the same font issues zero new loadFontAsync calls", async () => {
    await createTextNode(textNode("a", "First paragraph"), "Inter");
    const afterFirst = loadFontMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0); // the first node genuinely loads

    await createTextNode(textNode("b", "Second paragraph"), "Inter");

    expect(loadFontMock.mock.calls.length).toBe(afterFirst);
  });

  it("repeated failures are also cached across nodes", async () => {
    loadFontMock.mockImplementation(
      async ({ family }: { family: string }) => {
        if (family !== "Inter") throw new Error("font not found");
      }
    );

    const missing = (id: string) => ({
      ...textNode(id, "Uses a missing font"),
      fontFamily: "Ghost Grotesk",
    });

    await createTextNode(missing("a") as WireframeNode, "Ghost Grotesk");
    const afterFirst = loadFontMock.mock.calls.length;

    await createTextNode(missing("b") as WireframeNode, "Ghost Grotesk");

    // The measured pathology: without the cache the second node repeats the
    // whole failing candidate chain (~27 calls/node on stripe.com).
    expect(loadFontMock.mock.calls.length).toBe(afterFirst);
  });
});
