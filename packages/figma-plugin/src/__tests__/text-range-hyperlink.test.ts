/**
 * Per-range hyperlinks (h2d `lh`/`q5` parity).
 *
 * Before: the hyperlink was assigned once per NODE (text.ts, `node.href` →
 * `textNode.hyperlink`), so a paragraph containing three different links got
 * one link — or none.
 *
 * After: each styled segment carries its own href and gets its own
 * `setRangeHyperlink` call. The node-level assignment stays as the fallback
 * for the single-link case, so nothing regresses there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, RenderContext, TextSegment } from "../types";

function createMockTextNode() {
  let _characters = "";
  return {
    type: "TEXT",
    name: "",
    width: 400,
    height: 20,
    fills: [] as unknown[],
    effects: [] as unknown[],
    hyperlink: null as unknown,
    fontSize: 14,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    textAlignHorizontal: "LEFT",
    lineHeight: { unit: "AUTO" },
    letterSpacing: { value: 0, unit: "PIXELS" },
    textTruncation: undefined as string | undefined,
    textDecoration: "NONE",
    fillStyleId: "",
    textStyleId: "",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    get characters() { return _characters; },
    set characters(v: string) { _characters = v; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
    setRangeHyperlink: vi.fn(),
  };
}

let mockNode: ReturnType<typeof createMockTextNode>;

beforeEach(() => {
  mockNode = createMockTextNode();
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => mockNode),
    loadFontAsync: vi.fn(async () => undefined),
  };
});

import { createTextNode } from "../rendering/text";

function segment(text: string, extra: Partial<TextSegment> = {}): TextSegment {
  return {
    text,
    color: "#333333",
    fontWeight: 400,
    fontSize: 16,
    fontFamily: "Inter",
    ...extra,
  };
}

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "t1",
    name: "Text",
    type: "text",
    tag: "p",
    x: 0, y: 0, width: 400, height: 24,
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
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    browserLineCount: 1,
    ...overrides,
  } as WireframeNode;
}

function makeContext(): RenderContext {
  return {
    pluginColors: {
      text: "#333333", primary: "#000", secondary: "#888",
      background: "#ffffff", surface: "#f5f5f5", accent: "#3b82f6", border: "#e0e0e0",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    textMode: "original",
  } as unknown as RenderContext;
}

/** Char range → hyperlink value, as applied to the node. */
function rangeLinks(): Array<[number, number, string]> {
  return mockNode.setRangeHyperlink.mock.calls.map(
    (c) => [c[0], c[1], (c[2] as { value: string } | null)?.value] as [number, number, string],
  );
}

describe("per-range hyperlinks", () => {
  it("gives each of three links in one paragraph its own range", async () => {
    // "Read the docs, the pricing or email us."
    const node = makeNode({
      styledSegments: [
        segment("Read the "),
        segment("docs", { isLink: true, tag: "a", href: "https://w2w.design/docs" }),
        segment(", the "),
        segment("pricing", { isLink: true, tag: "a", href: "https://w2w.design/pricing" }),
        segment(" or "),
        segment("email us", { isLink: true, tag: "a", href: "mailto:hello@w2w.design" }),
        segment("."),
      ],
    });

    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode).not.toBeNull();

    const chars = textNode!.characters;
    const links = rangeLinks();
    expect(links.length).toBe(3);

    // Each range covers exactly its own anchor text, and nothing else.
    for (const [start, end] of links) {
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(chars.length);
    }
    expect(links.map(([s, e]) => chars.slice(s, e))).toEqual([
      "docs",
      "pricing",
      "email us",
    ]);
    expect(links.map(([, , url]) => url)).toEqual([
      "https://w2w.design/docs",
      "https://w2w.design/pricing",
      "mailto:hello@w2w.design",
    ]);
  });

  it("does not set a whole-node hyperlink once ranges carry the links", async () => {
    const node = makeNode({
      href: "https://w2w.design/docs",
      styledSegments: [
        segment("Read the "),
        segment("docs", { isLink: true, tag: "a", href: "https://w2w.design/docs" }),
        segment(" or the "),
        segment("pricing", { isLink: true, tag: "a", href: "https://w2w.design/pricing" }),
      ],
    });

    const textNode = await createTextNode(node, "Inter", makeContext());
    // The node-level setter applies to EVERY character — it would clobber the
    // ranges we just set.
    expect(textNode!.hyperlink).toBeNull();
    expect(rangeLinks().length).toBe(2);
  });

  it("keeps the node-level hyperlink when one link covers the whole node", async () => {
    const node = makeNode({
      href: "https://w2w.design/pricing",
      textContent: "See pricing",
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode!.hyperlink).toEqual({
      type: "URL",
      value: "https://w2w.design/pricing",
    });
    expect(rangeLinks().length).toBe(0);
  });

  it("keeps the node-level hyperlink when every segment shares one link", async () => {
    // <a> wrapping several runs (`<a>Get <b>Plus</b></a>`) is ONE link.
    const node = makeNode({
      href: "https://w2w.design/plus",
      styledSegments: [
        segment("Get ", { isLink: true, tag: "a", href: "https://w2w.design/plus" }),
        segment("Plus", { isLink: true, tag: "a", href: "https://w2w.design/plus", fontWeight: 700 }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode!.hyperlink).toEqual({
      type: "URL",
      value: "https://w2w.design/plus",
    });
    expect(rangeLinks().length).toBe(0);
  });

  it("leaves unlinked runs alone", async () => {
    const node = makeNode({
      styledSegments: [
        segment("Plain "),
        segment("linked", { isLink: true, tag: "a", href: "https://w2w.design/x" }),
        segment(" plain"),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(rangeLinks().length).toBe(1);
    expect(textNode!.characters.slice(rangeLinks()[0][0], rangeLinks()[0][1])).toBe("linked");
  });

  it("survives a Figma build with no setRangeHyperlink", async () => {
    delete (mockNode as unknown as Record<string, unknown>).setRangeHyperlink;
    const node = makeNode({
      styledSegments: [
        segment("a "),
        segment("b", { href: "https://w2w.design/x" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode).not.toBeNull();
  });
});
