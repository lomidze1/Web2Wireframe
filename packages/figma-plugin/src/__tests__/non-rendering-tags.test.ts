/**
 * Tests that media-metadata elements never become Figma frames.
 *
 * `<source>` (inside `<picture>`/`<video>`/`<audio>`), `<track>` and `<param>`
 * declare candidates and settings — the browser paints none of them. They do
 * occupy an inline box though, so the extractor reports them at roughly
 * 1 × line-height, and each one landed in Figma as a sliver frame.
 *
 * Real-world case: iwm.org.uk serves four `<source>` variants per `<picture>`.
 * Every responsive image imported with 4 junk 1×19 frames beside it, and the
 * `<picture>` frame grew 3px taller than the `<img>` it wraps because those
 * slivers joined its horizontal auto-layout.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function tags(node: WireframeNode, acc: string[] = []): string[] {
  acc.push(node.tag);
  for (const c of node.children || []) tags(c, acc);
  return acc;
}

describe("convertW2WToWireframe — non-rendering media tags", () => {
  it("drops the <source> variants of a <picture>", () => {
    const picture = frame({
      tag: "picture",
      styles: { display: "inline" },
      children: [
        frame({ tag: "source", width: 1, height: 19, attr: { srcset: "a.webp" } }),
        frame({ tag: "source", width: 1, height: 19, attr: { srcset: "b.webp" } }),
        frame({ tag: "source", width: 1, height: 19, attr: { srcset: "c.webp" } }),
        frame({ tag: "source", width: 1, height: 19, attr: { srcset: "d.webp" } }),
        frame({ tag: "img", width: 400, height: 300, attr: { src: "a.jpg" } }),
      ],
    });
    const node = convertW2WToWireframe(picture as never);
    expect(tags(node)).not.toContain("source");
    expect(tags(node)).toContain("img");
  });

  it("drops <track> and <param>", () => {
    const video = frame({
      tag: "video",
      children: [
        frame({ tag: "track", width: 1, height: 19 }),
        frame({ tag: "param", width: 1, height: 19 }),
      ],
    });
    const node = convertW2WToWireframe(video as never);
    expect(tags(node)).not.toContain("track");
    expect(tags(node)).not.toContain("param");
  });

  it("keeps ordinary elements of the same size", () => {
    const row = frame({
      tag: "div",
      children: [frame({ tag: "span", width: 1, height: 19 })],
    });
    const node = convertW2WToWireframe(row as never);
    expect(tags(node)).toContain("span");
  });
});
