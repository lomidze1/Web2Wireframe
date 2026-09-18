/**
 * Which raster images the UI iframe must recolour before they reach Figma.
 *
 * P0 bakes CSS color filters into vector/text/solid paints; a raster IMAGE
 * paint can't be recoloured in the sandbox (no canvas). notion.com's white
 * logos (`brightness(0) invert(1)` on black PNGs) stayed black. The plan picks
 * the filtered images, rewrites their urls to a filtered key the conversion
 * fills in, and rolls back anything that failed.
 */
import { describe, it, expect } from "vitest";
import { finishFilteredImages, planFilteredImages } from "../utils/filteredImages";
import type { WireframeFrame, WireframeNode } from "../types";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function node(over: Partial<WireframeNode> = {}): WireframeNode {
  return { id: "n", name: "n", type: "frame", tag: "div", x: 0, y: 0, width: 100, height: 40, children: [], ...over } as WireframeNode;
}

function frameOf(tree: WireframeNode, assets: Record<string, string> = {}): WireframeFrame {
  return { viewportWidth: 1440, viewportHeight: 900, tree, assets };
}

describe("planFilteredImages", () => {
  it("an image with its own filter gets a job and a filtered key", () => {
    const img = node({ tag: "img", imageUrl: "https://x/logo.png", cssColorFilter: "brightness(0) invert(1)" });
    const frames = [frameOf(node({ children: [img] }), { "https://x/logo.png": PNG })];

    const plan = planFilteredImages(frames);

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]).toMatchObject({ dataUri: PNG, filter: "brightness(0) invert(1)", frameIdxs: [0] });
    expect(img.imageUrl).toBe(plan.jobs[0].key);
    expect(plan.jobs[0].key).toContain("#w2w-filter=");
  });

  it("inherits an ancestor's filter, own filter first", () => {
    const img = node({ tag: "img", imageUrl: "https://x/p.jpg", cssColorFilter: "saturate(0.25)" });
    const card = node({ cssColorFilter: "brightness(1.4)", children: [img] });
    const plan = planFilteredImages([frameOf(node({ children: [card] }), { "https://x/p.jpg": PNG })]);

    expect(plan.jobs[0].filter).toBe("saturate(0.25) brightness(1.4)");
  });

  it("covers background image fills", () => {
    const box = node({
      cssColorFilter: "invert(1)",
      fills: [{ type: "IMAGE_PLACEHOLDER", imageUrl: "https://x/bg.png" }] as never,
    });
    const plan = planFilteredImages([frameOf(node({ children: [box] }), { "https://x/bg.png": PNG })]);

    expect(plan.jobs).toHaveLength(1);
    expect((box.fills as unknown as Array<{ imageUrl: string }>)[0].imageUrl).toBe(plan.jobs[0].key);
  });

  it("leaves grayscale/saturate-only images to Figma's editable saturation", () => {
    const img = node({ tag: "img", imageUrl: "https://x/l.png", cssColorFilter: "grayscale(1)" });
    const plan = planFilteredImages([frameOf(node({ children: [img] }), { "https://x/l.png": PNG })]);

    expect(plan.jobs).toEqual([]);
    expect(img.imageUrl).toBe("https://x/l.png");
  });

  it("skips images without data and SVGs", () => {
    const missing = node({ tag: "img", imageUrl: "https://x/none.png", cssColorFilter: "invert(1)" });
    const svg = node({ tag: "img", imageUrl: "https://x/i.svg", cssColorFilter: "invert(1)" });
    const plan = planFilteredImages([
      frameOf(node({ children: [missing, svg] }), { "https://x/i.svg": "data:image/svg+xml;base64,PHN2Zz4=" }),
    ]);

    expect(plan.jobs).toEqual([]);
  });

  // notion.com testimonials: `brightness(1.4) saturate(0.25)` on WebP/AVIF
  // portraits. A format Figma can't take is queued for conversion and never
  // lands in frame.assets, so the plan used to skip it and the filter was lost.
  it("plans an image still waiting for format conversion", () => {
    const WEBP = "data:image/webp;base64,UklGRg==";
    const img = node({ tag: "img", imageUrl: "https://x/p.webp", cssColorFilter: "brightness(1.4) saturate(0.25)" });
    const plan = planFilteredImages(
      [frameOf(node({ children: [img] }))],
      new Map([["https://x/p.webp", WEBP]]),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]).toMatchObject({ dataUri: WEBP, filter: "brightness(1.4) saturate(0.25)" });
    expect(img.imageUrl).toBe(plan.jobs[0].key);
  });
});

describe("finishFilteredImages", () => {
  it("restores urls that did not convert and flags only fully converted owners", () => {
    const ok = node({ tag: "img", imageUrl: "https://x/a.png", cssColorFilter: "invert(1)" });
    const failed = node({ tag: "img", imageUrl: "https://x/b.png" });
    const owner = node({ cssColorFilter: "brightness(0)", children: [failed] });
    const frames = [frameOf(node({ children: [ok, owner] }), { "https://x/a.png": PNG, "https://x/b.png": PNG })];
    const plan = planFilteredImages(frames);
    const okKey = ok.imageUrl!;

    finishFilteredImages(plan, new Set([okKey]));

    expect(ok.imageFilterBaked).toBe(true);
    expect(failed.imageUrl).toBe("https://x/b.png");
    expect(owner.imageFilterBaked).toBeUndefined();
  });
});
