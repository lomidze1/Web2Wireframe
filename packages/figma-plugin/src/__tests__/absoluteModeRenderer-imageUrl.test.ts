/**
 * Tests for absoluteModeRenderer — imageUrl passthrough
 * Verifies that imageUrl field is preserved when converting ExtractedElement → WireframeNode
 */
import { describe, it, expect } from "vitest";
import { convertToWireframeNode } from "../ui/shared/absoluteModeRenderer";

// Minimal ExtractedElement with imageUrl
function makeElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-1",
    type: "placeholder",
    tag: "img",
    name: "Test Image",
    x: 10,
    y: 20,
    width: 200,
    height: 150,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    boxShadow: null,
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "normal",
    letterSpacing: 0,
    textAlign: "left",
    textContent: "",
    opacity: 1,
    isPlaceholder: true,
    children: [],
    ...overrides,
  };
}

describe("absoluteModeRenderer — imageUrl passthrough", () => {
  it("passes imageUrl from ExtractedElement to WireframeNode", () => {
    const element = makeElement({ imageUrl: "https://example.com/logo.png" });
    const result = convertToWireframeNode(element as never);

    expect(result.imageUrl).toBe("https://example.com/logo.png");
  });

  it("WireframeNode.imageUrl is undefined when element has no imageUrl", () => {
    const element = makeElement();
    const result = convertToWireframeNode(element as never);

    expect(result.imageUrl).toBeUndefined();
  });

  it("passes imageUrl through nested children", () => {
    const child = makeElement({
      id: "child-1",
      imageUrl: "https://example.com/child.png",
    });
    const parent = makeElement({
      id: "parent-1",
      type: "frame",
      tag: "div",
      isPlaceholder: false,
      children: [child],
    });
    const result = convertToWireframeNode(parent as never);

    expect(result.children[0].imageUrl).toBe("https://example.com/child.png");
  });
});
