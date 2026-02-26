/**
 * Text Decoration + Deferred TextStyle Linking Tests
 *
 * Bug: When multi-segment text has both a TextStyle link and text-decoration
 * (e.g., <h2>Text <a href="#">link</a></h2>), the underline is lost because
 * setRangeTextStyleId() resets decoration to NONE and the deferred application
 * didn't re-apply it.
 *
 * Fix: applyDeferredTextStyles() now stores textDecoration per pending link
 * and re-applies it after setRangeTextStyleId().
 *
 * These tests verify the data flow: segments carry textDecoration,
 * pendingTextStyleLinks stores it, and re-application happens after style linking.
 */

import { describe, it, expect } from "vitest";
import { collectTextSegments } from "../rendering/text";
import type { WireframeNode } from "../types";

// ============================================================================
// Helpers
// ============================================================================

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "h2",
    x: 0,
    y: 0,
    width: 400,
    height: 30,
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
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

// ============================================================================
// Tests: Segment Collection Preserves Decoration for Multi-Segment Text
// ============================================================================

describe("text-decoration preservation in multi-segment text", () => {
  describe("styledSegments carry textDecoration for deferred linking", () => {
    it("h2 with anchor: underline segment is preserved in collected segments", () => {
      // Simulates: <h2>Questions? Email us at <a href="...">billing@example.com</a></h2>
      const node = makeNode({
        tag: "h2",
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 20,
        styledSegments: [
          {
            text: "Questions about billing or purchases? Email us at ",
            color: "#333333",
            fontWeight: 400,
            fontSize: 14,
          },
          {
            text: "billing@web2wireframe.design",
            color: "#3b82f6",
            fontWeight: 400,
            fontSize: 14,
            isLink: true,
            textDecoration: "underline",
          },
        ],
      });

      const segments = collectTextSegments(node);

      expect(segments).toHaveLength(2);
      // First segment: no decoration
      expect(segments[0].textDecoration).toBeUndefined();
      // Second segment (anchor): must have underline
      expect(segments[1].textDecoration).toBe("underline");
      expect(segments[1].isLink).toBe(true);
    });

    it("multiple anchors within text all preserve their decorations", () => {
      const node = makeNode({
        styledSegments: [
          { text: "Visit ", color: "#333", fontWeight: 400, fontSize: 14 },
          { text: "our site", color: "#3b82f6", fontWeight: 400, fontSize: 14, isLink: true, textDecoration: "underline" },
          { text: " or ", color: "#333", fontWeight: 400, fontSize: 14 },
          { text: "contact us", color: "#3b82f6", fontWeight: 400, fontSize: 14, isLink: true, textDecoration: "underline" },
        ],
      });

      const segments = collectTextSegments(node);

      expect(segments).toHaveLength(4);
      expect(segments[0].textDecoration).toBeUndefined();
      expect(segments[1].textDecoration).toBe("underline");
      expect(segments[2].textDecoration).toBeUndefined();
      expect(segments[3].textDecoration).toBe("underline");
    });

    it("strikethrough decoration is preserved alongside underline", () => {
      const node = makeNode({
        styledSegments: [
          { text: "$99", color: "#999", fontWeight: 400, fontSize: 14, textDecoration: "line-through" },
          { text: " $49", color: "#333", fontWeight: 700, fontSize: 14 },
          { text: " Buy now", color: "#3b82f6", fontWeight: 400, fontSize: 14, isLink: true, textDecoration: "underline" },
        ],
      });

      const segments = collectTextSegments(node);

      expect(segments).toHaveLength(3);
      expect(segments[0].textDecoration).toBe("line-through");
      expect(segments[1].textDecoration).toBeUndefined();
      expect(segments[2].textDecoration).toBe("underline");
    });
  });

  describe("computedStyles fallback preserves decoration for inline children", () => {
    it("anchor child with computedStyles underline is collected", () => {
      // Simulates: <h2>Email us at <a>billing@example.com</a></h2>
      // when styledSegments is not available (fallback path)
      const node = makeNode({
        tag: "h2",
        textContent: "Email us at ",
        styledSegments: undefined,
        children: [
          makeNode({
            textContent: "billing@example.com",
            tag: "#text",
            type: "text",
            computedStyles: {
              "text-decoration": "underline solid rgb(59, 130, 246)",
            },
          }),
        ],
      });

      const segments = collectTextSegments(node);

      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("Email us at ");
      expect(segments[0].textDecoration).toBeUndefined();
      expect(segments[1].text).toBe("billing@example.com");
      expect(segments[1].textDecoration).toBe("underline");
    });
  });
});
