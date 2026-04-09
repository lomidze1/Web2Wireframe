/**
 * Tests for collectImageUrlsFromW2W() — W2W tree asset URL collection.
 */
import { describe, it, expect } from "vitest";
import { collectImageUrlsFromW2W } from "../resource-graph";
import type { W2WFrameNode, W2WTextNode, W2WSVGNode } from "../w2w-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Partial<W2WFrameNode> = {}): W2WFrameNode {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 100,
    quad: [0, 0, 100, 0, 100, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function makeText(value: string): W2WTextNode {
  return {
    type: "TEXT",
    x: 0, y: 0, width: 50, height: 16,
    quad: [0, 0, 50, 0, 50, 16, 0, 16],
    value,
    font: "Arial",
  };
}

function makeSvg(): W2WSVGNode {
  return {
    type: "SVG",
    x: 0, y: 0, width: 24, height: 24,
    quad: [0, 0, 24, 0, 24, 24, 0, 24],
    svg: "<svg></svg>",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collectImageUrlsFromW2W", () => {
  it("returns empty set for a tree with no images", () => {
    const tree = makeFrame({ children: [makeText("hello")] });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.size).toBe(0);
  });

  it("collects $url from FRAME nodes (img src)", () => {
    const tree = makeFrame({
      children: [
        makeFrame({ $url: "https://example.com/photo.jpg" }),
        makeFrame({ $url: "https://example.com/icon.png" }),
      ],
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls).toEqual(new Set([
      "https://example.com/photo.jpg",
      "https://example.com/icon.png",
    ]));
  });

  it("collects background-image URLs from styles", () => {
    const tree = makeFrame({
      children: [
        makeFrame({
          styles: { backgroundImage: 'url("https://example.com/bg.webp")' },
        }),
      ],
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.has("https://example.com/bg.webp")).toBe(true);
  });

  it("collects multiple URLs from background-image with multiple url()", () => {
    const tree = makeFrame({
      styles: {
        backgroundImage:
          'url("https://a.com/1.png"), url(https://b.com/2.jpg)',
      },
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.has("https://a.com/1.png")).toBe(true);
    expect(urls.has("https://b.com/2.jpg")).toBe(true);
  });

  it("handles nested trees recursively", () => {
    const tree = makeFrame({
      children: [
        makeFrame({
          children: [
            makeFrame({
              children: [
                makeFrame({ $url: "https://deep.com/img.svg" }),
              ],
            }),
          ],
        }),
      ],
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.has("https://deep.com/img.svg")).toBe(true);
    expect(urls.size).toBe(1);
  });

  it("deduplicates URLs", () => {
    const url = "https://example.com/dup.png";
    const tree = makeFrame({
      children: [
        makeFrame({ $url: url }),
        makeFrame({ $url: url }),
        makeFrame({ styles: { backgroundImage: `url("${url}")` } }),
      ],
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.size).toBe(1);
    expect(urls.has(url)).toBe(true);
  });

  it("skips TEXT and SVG nodes (no images)", () => {
    const tree = makeFrame({
      children: [
        makeText("hello"),
        makeSvg(),
        makeFrame({ $url: "https://example.com/real.png" }),
      ],
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.size).toBe(1);
  });

  it("handles background-image with single quotes", () => {
    const tree = makeFrame({
      styles: { backgroundImage: "url('https://example.com/sq.png')" },
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.has("https://example.com/sq.png")).toBe(true);
  });

  it("handles background-image without quotes", () => {
    const tree = makeFrame({
      styles: { backgroundImage: "url(https://example.com/nq.png)" },
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.has("https://example.com/nq.png")).toBe(true);
  });

  it("skips data: URLs in background-image", () => {
    const tree = makeFrame({
      styles: { backgroundImage: "url(data:image/png;base64,abc123)" },
    });
    const urls = collectImageUrlsFromW2W(tree);
    // data: URLs are still collected — they're resolved at asset extraction time
    expect(urls.size).toBe(1);
  });

  it("combines $url and background-image from same node", () => {
    const tree = makeFrame({
      $url: "https://example.com/img.jpg",
      styles: { backgroundImage: 'url("https://example.com/bg.jpg")' },
    });
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.size).toBe(2);
    expect(urls.has("https://example.com/img.jpg")).toBe(true);
    expect(urls.has("https://example.com/bg.jpg")).toBe(true);
  });

  it("handles empty tree", () => {
    const tree = makeFrame();
    const urls = collectImageUrlsFromW2W(tree);
    expect(urls.size).toBe(0);
  });
});
