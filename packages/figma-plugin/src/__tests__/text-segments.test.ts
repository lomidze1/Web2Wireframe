/**
 * collectTextSegments Unit Tests
 *
 * Tests for text segment collection with computedStyles fallback
 */

import { describe, it, expect } from "vitest";
import { collectTextSegments } from "../rendering/text";
import type { WireframeNode } from "../types";

// Helper to create a minimal WireframeNode
function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#333333",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "Test text",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 20,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

describe("collectTextSegments", () => {
  describe("styledSegments path (existing behavior)", () => {
    it("should use styledSegments when available", () => {
      const node = makeNode({
        styledSegments: [
          { text: "Hello ", color: "#000000", fontWeight: 400, fontSize: 14 },
          { text: "world", color: "#0000FF", fontWeight: 700, fontSize: 14, textDecoration: "underline" },
        ],
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("Hello ");
      expect(segments[0].textDecoration).toBeUndefined();
      expect(segments[1].text).toBe("world");
      expect(segments[1].textDecoration).toBe("underline");
    });
  });

  describe("fallback path with computedStyles", () => {
    it("should read text-decoration: underline from computedStyles", () => {
      const node = makeNode({
        textContent: "hey@example.com",
        tag: "a",
        computedStyles: {
          "text-decoration": "underline",
          "color": "rgb(59, 130, 246)",
        },
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("hey@example.com");
      expect(segments[0].textDecoration).toBe("underline");
    });

    it("should read text-decoration-line from computedStyles", () => {
      const node = makeNode({
        textContent: "strikethrough text",
        computedStyles: {
          "text-decoration-line": "line-through",
        },
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(1);
      expect(segments[0].textDecoration).toBe("line-through");
    });

    it("should handle full computed text-decoration format", () => {
      const node = makeNode({
        textContent: "underlined link",
        computedStyles: {
          "text-decoration": "underline solid rgb(59, 130, 246)",
        },
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(1);
      expect(segments[0].textDecoration).toBe("underline");
    });

    it("should return undefined textDecoration when computedStyles has none", () => {
      const node = makeNode({
        textContent: "normal text",
        computedStyles: {
          "text-decoration": "none",
        },
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(1);
      expect(segments[0].textDecoration).toBeUndefined();
    });

    it("should return undefined textDecoration when no computedStyles", () => {
      const node = makeNode({
        textContent: "normal text",
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(1);
      expect(segments[0].textDecoration).toBeUndefined();
    });
  });

  describe("inline children fallback with computedStyles", () => {
    it("should read textDecoration from child computedStyles", () => {
      const node = makeNode({
        textContent: "",
        type: "frame",
        tag: "div",
        children: [
          makeNode({
            textContent: "Click here",
            tag: "#text",
            type: "text",
            computedStyles: {
              "text-decoration": "underline",
            },
          }),
        ],
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("Click here");
      expect(segments[0].textDecoration).toBe("underline");
    });

    it("should handle mix of parent text and child with underline", () => {
      const node = makeNode({
        textContent: "Contact: ",
        children: [
          makeNode({
            textContent: "email@test.com",
            tag: "#text",
            type: "text",
            computedStyles: {
              "text-decoration": "underline",
            },
          }),
        ],
      });
      const segments = collectTextSegments(node);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("Contact: ");
      expect(segments[0].textDecoration).toBeUndefined();
      expect(segments[1].text).toBe("email@test.com");
      expect(segments[1].textDecoration).toBe("underline");
    });
  });
});
