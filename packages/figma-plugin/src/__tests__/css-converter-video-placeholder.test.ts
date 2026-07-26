/**
 * <video> elements must survive conversion as visible media placeholders.
 *
 * apple.com hero regression: the back-to-school hero is a posterless
 * <video style="opacity:0"> (fades itself in/out) next to a <picture>
 * start-frame that extraction drops while the video plays. The video frame
 * DOES reach the import JSON — but the converter (a) dropped it for
 * opacity:0 and (b) only made media a placeholder when $url was present,
 * so the whole hero rendered as nothing.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

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
  const body = makeFrame({ tag: 'body', width: 1440, height: 900, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1440, height: 900,
    styles: { height: '100%' },
    children: [body],
    isScrollingElt: true,
  });
}

function findByTagName(node: unknown, name: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.name === 'string' && obj.name.includes(name)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByTagName(c, name);
    if (hit) return hit;
  }
  return null;
}

describe("video → placeholder", () => {
  it("posterless visible video becomes a placeholder (not an empty frame)", () => {
    const video = makeFrame({
      tag: 'video',
      attr: { id: 'bts-2026' },
      x: 109, y: 0, width: 1222, height: 460,
      styles: { display: 'block' },
    });
    const root = convertW2WToWireframe(page([makeFrame({ classList: ['wrap'], width: 1440, height: 460, children: [video] })]) as never, { layoutMode: "autoLayout" });
    const node = findByTagName(root, 'video');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('placeholder');
  });

  it("hero-sized opacity-0 video is KEPT as a placeholder", () => {
    const video = makeFrame({
      tag: 'video',
      attr: { id: 'bts-2026' },
      x: 109, y: 0, width: 1222, height: 460,
      styles: { display: 'block', opacity: '0' },
    });
    const root = convertW2WToWireframe(page([makeFrame({ classList: ['wrap'], width: 1440, height: 460, children: [video] })]) as never, { layoutMode: "autoLayout" });
    const node = findByTagName(root, 'video');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('placeholder');
  });

  it("tiny invisible video is still dropped (preload/utility artifacts)", () => {
    const video = makeFrame({
      tag: 'video',
      x: 0, y: 0, width: 40, height: 40,
      styles: { display: 'block', opacity: '0' },
    });
    const root = convertW2WToWireframe(page([makeFrame({ classList: ['wrap'], children: [video] })]) as never, { layoutMode: "autoLayout" });
    expect(findByTagName(root, 'video')).toBeNull();
  });

  it("opacity-0 NON-media frames are still dropped", () => {
    const div = makeFrame({
      tag: 'div', classList: ['curtain'],
      width: 1440, height: 460,
      styles: { display: 'block', opacity: '0' },
    });
    const root = convertW2WToWireframe(page([makeFrame({ classList: ['wrap'], width: 1440, height: 460, children: [div] })]) as never, { layoutMode: "autoLayout" });
    expect(findByTagName(root, 'curtain')).toBeNull();
  });

  it("video with a poster keeps its $url on the placeholder", () => {
    const video = makeFrame({
      tag: 'video',
      $url: 'https://example.com/poster.png',
      x: 0, y: 0, width: 800, height: 450,
      styles: { display: 'block' },
    });
    const root = convertW2WToWireframe(page([makeFrame({ classList: ['wrap'], width: 1440, height: 460, children: [video] })]) as never, { layoutMode: "autoLayout" });
    const node = findByTagName(root, 'video');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('placeholder');
    expect(node!.imageUrl || node!.$url).toBeTruthy();
  });
});
