/**
 * Image scaling semantics: CSS object-fit / background-size / background-repeat.
 *
 * Previously every image rendered with a hardcoded Figma scaleMode "FILL"
 * (cover-crop), so `contain` logos got cropped and tiled patterns rendered as
 * one stretched copy. The converter must propagate:
 *   - <img> object-fit → WireframeNode.objectFit
 *   - background-size contain → fill.scaleMode "FIT", cover → "FILL"
 *   - explicit small px background-size with default/explicit repeat → "TILE"
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { objectFitToScaleMode } from "../rendering/realImages";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: 'body', width: 1440, height: 800, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1440, height: 800,
    styles: { height: '100%' },
    children: [body],
    isScrollingElt: true,
  });
}

interface FoundNode {
  tag?: string;
  objectFit?: string;
  fills?: Array<{ type: string; scaleMode?: string; imageUrl?: string }>;
  children?: FoundNode[];
}

function findByTag(node: FoundNode, tag: string): FoundNode | null {
  if (node.tag === tag) return node;
  for (const c of node.children ?? []) {
    const hit = findByTag(c, tag);
    if (hit) return hit;
  }
  return null;
}

function findImageFill(node: FoundNode): { type: string; scaleMode?: string } | null {
  const fill = node.fills?.find(f => f.type === 'IMAGE_PLACEHOLDER');
  if (fill) return fill;
  for (const c of node.children ?? []) {
    const hit = findImageFill(c);
    if (hit) return hit;
  }
  return null;
}

describe("object-fit propagation", () => {
  it("propagates object-fit: contain from <img> styles", () => {
    const img = makeFrame({
      tag: 'img',
      styles: { display: 'block', objectFit: 'contain' },
      $url: 'https://example.com/logo.png',
    });
    const root = convertW2WToWireframe(page([img]) as never, { layoutMode: "autoLayout" });
    const node = findByTag(root as FoundNode, 'img');
    expect(node?.objectFit).toBe('contain');
  });

  it("maps object-fit values to Figma scaleMode", () => {
    expect(objectFitToScaleMode('cover')).toBe('FILL');
    expect(objectFitToScaleMode('contain')).toBe('FIT');
    expect(objectFitToScaleMode('none')).toBe('FIT');
    expect(objectFitToScaleMode('scale-down')).toBe('FIT');
    expect(objectFitToScaleMode('fill')).toBe('FILL');
    expect(objectFitToScaleMode(undefined)).toBe('FILL');
  });
});

describe("background-size/repeat → fill.scaleMode", () => {
  function bgDiv(styles: Record<string, string>): Record<string, unknown> {
    return makeFrame({
      styles: {
        display: 'block',
        backgroundImage: 'url("https://example.com/bg.png")',
        ...styles,
      },
    });
  }

  it("background-size: contain → FIT", () => {
    const root = convertW2WToWireframe(page([bgDiv({ backgroundSize: 'contain' })]) as never, { layoutMode: "autoLayout" });
    expect(findImageFill(root as FoundNode)?.scaleMode).toBe('FIT');
  });

  it("background-size: cover → FILL", () => {
    const root = convertW2WToWireframe(page([bgDiv({ backgroundSize: 'cover' })]) as never, { layoutMode: "autoLayout" });
    expect(findImageFill(root as FoundNode)?.scaleMode).toBe('FILL');
  });

  it("small explicit px size with default repeat → TILE", () => {
    // element is 400x300; 24px pattern with repeat (default, not captured) tiles
    const root = convertW2WToWireframe(page([bgDiv({ backgroundSize: '24px 24px' })]) as never, { layoutMode: "autoLayout" });
    expect(findImageFill(root as FoundNode)?.scaleMode).toBe('TILE');
  });

  it("small explicit px size with no-repeat → FILL (no tiling)", () => {
    const root = convertW2WToWireframe(
      page([bgDiv({ backgroundSize: '24px 24px', backgroundRepeat: 'no-repeat' })]) as never,
      { layoutMode: "autoLayout" },
    );
    expect(findImageFill(root as FoundNode)?.scaleMode).toBe('FILL');
  });

  it("explicit repeat-x → TILE", () => {
    const root = convertW2WToWireframe(
      page([bgDiv({ backgroundRepeat: 'repeat-x' })]) as never,
      { layoutMode: "autoLayout" },
    );
    expect(findImageFill(root as FoundNode)?.scaleMode).toBe('TILE');
  });

  it("plain url with no size/repeat info → FILL (default)", () => {
    const root = convertW2WToWireframe(page([bgDiv({})]) as never, { layoutMode: "autoLayout" });
    expect(findImageFill(root as FoundNode)?.scaleMode).toBe('FILL');
  });
});
