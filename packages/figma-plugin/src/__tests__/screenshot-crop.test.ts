import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyScreenshotCrops,
  CROPPABLE_NODE_NAMES,
} from "../ui/shared/screenshotCrop";
import type { WireframeFrame, WireframeNode } from "../types";

/** Records every drawImage source rect so tests can assert the mapping. */
let drawCalls: number[][] = [];
/** When set, toDataURL throws — simulates a tainted/oversized canvas. */
let toDataUrlThrows = false;

const FAKE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 2880;
  naturalHeight = 1800;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  drawCalls = [];
  toDataUrlThrows = false;
  vi.stubGlobal("Image", MockImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        drawImage: (
          _img: unknown,
          sx: number,
          sy: number,
          sw: number,
          sh: number,
        ) => {
          drawCalls.push([sx, sy, sw, sh]);
        },
        fillRect: () => {},
        set fillStyle(_v: string) {},
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
    if (toDataUrlThrows) throw new Error("tainted canvas");
    return FAKE_PNG;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Minimal WireframeNode — only the fields the cropper reads. */
function node(partial: Partial<WireframeNode>): WireframeNode {
  return {
    id: "n",
    name: "Icon",
    type: "placeholder",
    tag: "span",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    children: [],
    isPlaceholder: true,
    ...partial,
  } as WireframeNode;
}

function frame(tree: WireframeNode, viewportWidth = 1440): WireframeFrame {
  return { viewportWidth, viewportHeight: 900, tree };
}

/** Source is 2× the 1440 viewport → every crop rect doubles. */
const SOURCE = { dataUrl: FAKE_PNG, width: 2880, height: 1800 };

describe("applyScreenshotCrops — coordinate mapping", () => {
  it("scales a nested node's absolute box into source pixels", async () => {
    const icon = node({ x: 20, y: 10, width: 40, height: 40 });
    const card = node({
      name: "Card",
      type: "frame",
      isPlaceholder: false,
      x: 80,
      y: 40,
      width: 300,
      height: 200,
      children: [icon],
    });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      width: 1440,
      height: 900,
      children: [card],
    });

    const result = await applyScreenshotCrops([frame(root)], SOURCE);

    // abs = (80+20, 40+10) = (100, 50); ×2 → (200, 100, 80, 80)
    expect(drawCalls).toEqual([[200, 100, 80, 80]]);
    expect(result.cropped).toBe(1);
    expect(icon.imageUrl).toBe("screenshot-crop:200,100,80,80");
  });

  it("attaches the cropped data URI to the frame's assets map", async () => {
    const icon = node({ x: 100, y: 50 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [icon],
    });
    const f = frame(root);

    await applyScreenshotCrops([f], SOURCE);

    expect(f.assets?.[icon.imageUrl!]).toBe(FAKE_PNG);
  });

  it("leaves type/isPlaceholder untouched so nodes.ts takes the real-image branch", async () => {
    const icon = node({ x: 100, y: 50 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [icon],
    });

    await applyScreenshotCrops([frame(root)], SOURCE);

    expect(icon.type).toBe("placeholder");
    expect(icon.isPlaceholder).toBe(true);
  });
});

describe("applyScreenshotCrops — which nodes qualify", () => {
  it.each([...CROPPABLE_NODE_NAMES])("crops %s", async (name) => {
    const target = node({ name, x: 100, y: 50 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [target],
    });

    await applyScreenshotCrops([frame(root)], SOURCE);

    expect(target.imageUrl).toBeTruthy();
  });

  it.each(["Search Icon", "Chevron", "Star", "Star Empty", "Dot"])(
    "skips the synthesized sub-placeholder %s",
    async (name) => {
      const target = node({ name, x: 100, y: 50 });
      const root = node({
        name: "Body",
        type: "frame",
        isPlaceholder: false,
        children: [target],
      });

      await applyScreenshotCrops([frame(root)], SOURCE);

      expect(target.imageUrl).toBeUndefined();
      expect(drawCalls).toEqual([]);
    },
  );

  it("skips a placeholder that has children", async () => {
    const target = node({
      x: 100,
      y: 50,
      children: [node({ name: "Inner", type: "frame", isPlaceholder: false })],
    });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [target],
    });

    await applyScreenshotCrops([frame(root)], SOURCE);

    expect(target.imageUrl).toBeUndefined();
  });

  it("skips non-placeholder nodes even when the name matches", async () => {
    const target = node({
      name: "Icon",
      type: "frame",
      isPlaceholder: false,
      x: 100,
      y: 50,
    });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [target],
    });

    await applyScreenshotCrops([frame(root)], SOURCE);

    expect(target.imageUrl).toBeUndefined();
  });
});

describe("applyScreenshotCrops — dedupe", () => {
  it("reuses one asset key for the same source rect across viewport frames", async () => {
    // 1440 and 720 frames describe the same region — the 720 tree carries
    // half-size boxes, so both map back to the identical source rect.
    const iconA = node({ x: 100, y: 50, width: 40, height: 40 });
    const iconB = node({ x: 50, y: 25, width: 20, height: 20 });
    const rootA = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [iconA],
    });
    const rootB = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [iconB],
    });

    const frames = [frame(rootA, 1440), frame(rootB, 720)];
    const result = await applyScreenshotCrops(frames, SOURCE);

    expect(iconA.imageUrl).toBe(iconB.imageUrl);
    // Cropped once, reused for the second frame.
    expect(drawCalls).toHaveLength(1);
    expect(result.cropped).toBe(2);
    expect(frames[1].assets?.[iconB.imageUrl!]).toBe(FAKE_PNG);
  });
});

describe("applyScreenshotCrops — guards", () => {
  it("skips boxes smaller than 8 source pixels", async () => {
    // 3×3 at viewport scale → 6×6 in source pixels.
    const tiny = node({ x: 10, y: 10, width: 3, height: 3 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [tiny],
    });

    const result = await applyScreenshotCrops([frame(root)], SOURCE);

    expect(tiny.imageUrl).toBeUndefined();
    expect(result.skipped).toBe(1);
  });

  it("skips a box that lies fully outside the source image", async () => {
    const offscreen = node({ x: 5000, y: 50, width: 40, height: 40 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [offscreen],
    });

    await applyScreenshotCrops([frame(root)], SOURCE);

    expect(offscreen.imageUrl).toBeUndefined();
  });

  it("clamps a box that overhangs the source edge", async () => {
    // x=1420 ×2 = 2840; width 40 ×2 = 80 → clamped to 40 (source is 2880 wide).
    const edge = node({ x: 1420, y: 50, width: 40, height: 40 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [edge],
    });

    await applyScreenshotCrops([frame(root)], SOURCE);

    expect(drawCalls).toEqual([[2840, 100, 40, 80]]);
  });

  it("keeps the placeholder when encoding throws, and keeps going", async () => {
    toDataUrlThrows = true;
    const icon = node({ x: 100, y: 50 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [icon],
    });
    const f = frame(root);

    const result = await applyScreenshotCrops([f], SOURCE);

    expect(icon.imageUrl).toBeUndefined();
    expect(f.assets).toBeUndefined();
    expect(result.skipped).toBe(1);
  });

  it("returns zero counts for an unusable source", async () => {
    const icon = node({ x: 100, y: 50 });
    const root = node({
      name: "Body",
      type: "frame",
      isPlaceholder: false,
      children: [icon],
    });

    const result = await applyScreenshotCrops([frame(root)], {
      dataUrl: FAKE_PNG,
      width: 0,
      height: 0,
    });

    expect(result).toEqual({ cropped: 0, skipped: 0 });
    expect(icon.imageUrl).toBeUndefined();
  });
});
