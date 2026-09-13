/**
 * Posterless <video> elements must adopt the poster image of an overlapping
 * <picture>/<img> sibling so the media area renders real pixels.
 *
 * apple.com hero: <div.inline-media-wrapper> holds a <picture class="start-frame">
 * (opacity:0 once the video plays — but its <img> $url = the real poster PNG
 * reaches the import JSON) next to a posterless <video>. The converter used to
 * drop the opacity-0 picture and render the video as a blank gray placeholder.
 * Now the video adopts the sibling's poster URL and the donor picture is
 * dropped (no double render).
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
  // Layer names are semantic now — match on the preserved tag/className
  // fields instead of the incidental DOM-derived name.
  if (typeof obj.tag === 'string' && obj.tag.includes(name)) return obj;
  if (typeof obj.className === 'string' && obj.className.includes(name)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByTagName(c, name);
    if (hit) return hit;
  }
  return null;
}

const POSTER_URL = 'https://example.com/hero_startframe.png';

/** apple.com hero shape: wrapper > [picture > img, video] */
function heroWrapper(pictureStyles: Record<string, unknown>): Record<string, unknown> {
  const img = makeFrame({
    tag: 'img',
    $url: POSTER_URL,
    x: 109, y: 0, width: 1222, height: 460,
  });
  const picture = makeFrame({
    tag: 'picture',
    classList: ['start-frame'],
    x: 0, y: 0, width: 1425, height: 460,
    styles: { display: 'block', ...pictureStyles },
    children: [img],
  });
  const video = makeFrame({
    tag: 'video',
    attr: { id: 'bts-2026' },
    x: 109, y: 0, width: 1222, height: 460,
    styles: { display: 'block' },
  });
  return makeFrame({
    classList: ['inline-media-wrapper'],
    width: 1440, height: 460,
    children: [picture, video],
  });
}

describe("video poster transplant", () => {
  it("posterless video adopts $url from a hidden (opacity-0) sibling picture; donor is dropped", () => {
    const root = convertW2WToWireframe(page([heroWrapper({ opacity: '0' })]) as never, { layoutMode: "autoLayout" });
    const video = findByTagName(root, 'video');
    expect(video).not.toBeNull();
    expect(video!.type).toBe('placeholder');
    expect(video!.imageUrl).toBe(POSTER_URL);
    expect(findByTagName(root, 'picture')).toBeNull();
    expect(findByTagName(root, 'img')).toBeNull();
  });

  it("posterless video adopts $url from a VISIBLE sibling picture; donor is dropped (no double render)", () => {
    const root = convertW2WToWireframe(page([heroWrapper({})]) as never, { layoutMode: "autoLayout" });
    const video = findByTagName(root, 'video');
    expect(video).not.toBeNull();
    expect(video!.type).toBe('placeholder');
    expect(video!.imageUrl).toBe(POSTER_URL);
    expect(findByTagName(root, 'picture')).toBeNull();
  });

  it("video with its own poster $url is untouched; sibling picture renders normally", () => {
    const wrapper = heroWrapper({});
    const children = wrapper.children as Record<string, unknown>[];
    const video = children.find((c) => c.tag === 'video')!;
    video.$url = 'https://example.com/native_poster.png';
    const root = convertW2WToWireframe(page([wrapper]) as never, { layoutMode: "autoLayout" });
    const videoNode = findByTagName(root, 'video');
    expect(videoNode).not.toBeNull();
    expect(videoNode!.imageUrl).toBe('https://example.com/native_poster.png');
    // Visible picture stays in the tree — no transplant happened
    expect(findByTagName(root, 'picture')).not.toBeNull();
  });

  it("non-overlapping sibling img is NOT adopted and stays in the tree", () => {
    const thumb = makeFrame({
      tag: 'img',
      classList: ['thumb'],
      $url: 'https://example.com/thumb.png',
      x: 1300, y: 500, width: 120, height: 120,
    });
    const video = makeFrame({
      tag: 'video',
      x: 0, y: 0, width: 800, height: 450,
      styles: { display: 'block' },
    });
    const wrapper = makeFrame({ classList: ['wrap'], width: 1440, height: 700, children: [thumb, video] });
    const root = convertW2WToWireframe(page([wrapper]) as never, { layoutMode: "autoLayout" });
    const videoNode = findByTagName(root, 'video');
    expect(videoNode).not.toBeNull();
    expect(videoNode!.imageUrl).toBeUndefined();
    const thumbNode = findByTagName(root, 'thumb');
    expect(thumbNode).not.toBeNull();
    expect(thumbNode!.imageUrl).toBe('https://example.com/thumb.png');
  });

  it("tiny video does not steal a sibling image", () => {
    const img = makeFrame({
      tag: 'img',
      classList: ['photo'],
      $url: 'https://example.com/photo.png',
      x: 0, y: 0, width: 800, height: 450,
    });
    const video = makeFrame({
      tag: 'video',
      x: 0, y: 0, width: 60, height: 60,
      styles: { display: 'block' },
    });
    const wrapper = makeFrame({ classList: ['wrap'], width: 1440, height: 460, children: [img, video] });
    const root = convertW2WToWireframe(page([wrapper]) as never, { layoutMode: "autoLayout" });
    const photo = findByTagName(root, 'photo');
    expect(photo).not.toBeNull();
    expect(photo!.imageUrl).toBe('https://example.com/photo.png');
  });

  it("animated GIF <img> keeps its $url as placeholder imageUrl (regression guard)", () => {
    const gif = makeFrame({
      tag: 'img',
      classList: ['anim'],
      $url: 'https://example.com/loader.gif',
      x: 0, y: 0, width: 300, height: 200,
    });
    const wrapper = makeFrame({ classList: ['wrap'], width: 1440, height: 300, children: [gif] });
    const root = convertW2WToWireframe(page([wrapper]) as never, { layoutMode: "autoLayout" });
    const gifNode = findByTagName(root, 'anim');
    expect(gifNode).not.toBeNull();
    expect(gifNode!.type).toBe('placeholder');
    expect(gifNode!.imageUrl).toBe('https://example.com/loader.gif');
  });
});
