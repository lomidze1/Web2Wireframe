/**
 * A `<canvas>` that drew a cross-origin image without CORS is tainted forever:
 * `getImageData` and `toDataURL` both raise SecurityError, so the content
 * script's rasterizer — h2d's own algorithm, ported in canvas-raster.ts — can
 * never read it back. The section then reaches Figma as an empty box.
 *
 * Measured on stripe.com: `.squeezy-carousel__canvas` is tainted by drawImage
 * call #79, `https://images.stripeassets.com/.../annual-letter-desktop...` with
 * `crossOrigin: null`. h2d has no answer for this either — their `Em`
 * (index.beautified.js:13410) calls getImageData unguarded and the exception
 * escapes, and their own stripe.com capture holds no node for this canvas.
 *
 * `Page.captureScreenshot` reads the compositor, not the canvas, so taint does
 * not apply. Clipped to the element's document rect it returned the carousel
 * exactly, in 276ms, without moving the scroll position.
 *
 * Both capture paths run this — the API in Puppeteer, the extension over
 * chrome.debugger — so it lives here rather than in either host, the same way
 * `W2W_HYDRATION_EXPRESSION` does. These tests guard the contract: only canvases that
 * actually need it are shot, the clip is in DOCUMENT coordinates (a viewport
 * rect would silently photograph the wrong part of the page), the payload stays
 * bounded, and no failure here can take an import down.
 */
import { describe, it, expect, vi } from "vitest";
import type { W2WFrameNode } from "../w2w-types";
import type { CDPClientInterface } from "../types";
import {
  captureTaintedCanvases,
  MAX_CANVAS_SHOT_BYTES,
  MAX_CANVAS_SHOT_TOTAL_BYTES,
} from "../w2w-canvas-shots";

/** Only `send` is used, so that is all a stub has to provide. */
type CDPSend = CDPClientInterface["send"];

type CanvasProbe = {
  x: number;
  y: number;
  width: number;
  height: number;
  tainted: boolean;
};

function canvasNode(
  cls: string,
  rect: { x: number; y: number; width: number; height: number },
  url?: string,
): W2WFrameNode {
  return {
    type: "FRAME",
    tag: "canvas",
    classList: [cls],
    attr: {},
    styles: {},
    children: [],
    ...rect,
    ...(url ? { $url: url } : {}),
  } as unknown as W2WFrameNode;
}

/** A page root holding the given canvases plus one non-canvas sibling. */
function tree(...canvases: W2WFrameNode[]): W2WFrameNode {
  return {
    type: "FRAME",
    tag: "html",
    classList: [],
    attr: {},
    styles: {},
    x: 0,
    y: 0,
    width: 1440,
    height: 14000,
    children: [
      {
        type: "FRAME",
        tag: "div",
        classList: ["section"],
        attr: {},
        styles: {},
        x: 0,
        y: 0,
        width: 1440,
        height: 500,
        children: canvases,
      },
    ],
  } as unknown as W2WFrameNode;
}

/**
 * A CDP stub: `Runtime.evaluate` answers with `probes`, `Page.captureScreenshot`
 * with `bytes` base64 characters of payload.
 */
function client(probes: CanvasProbe[], opts: { bytes?: number; fail?: boolean } = {}) {
  const send = vi.fn(async (method: string) => {
    if (method === "Runtime.evaluate") {
      return { result: { value: probes } };
    }
    if (method === "Page.captureScreenshot") {
      if (opts.fail) throw new Error("Unable to capture screenshot");
      return { data: "A".repeat(opts.bytes ?? 1024) };
    }
    return {};
  });
  return { send: send as unknown as CDPSend, calls: send };
}

const shots = (c: ReturnType<typeof client>) =>
  c.calls.mock.calls.filter((call) => call[0] === "Page.captureScreenshot");

describe("captureTaintedCanvases", () => {
  it("shoots a tainted canvas and puts the image in $url", async () => {
    const node = canvasNode("squeezy-carousel__canvas", { x: 104, y: 11675.84, width: 1232, height: 460 });
    const c = client([{ x: 104, y: 11675.84, width: 1232, height: 460, tainted: true }]);

    await captureTaintedCanvases(c, tree(node));

    expect(shots(c)).toHaveLength(1);
    expect(node.$url).toMatch(/^data:image\/png;base64,A+$/);
  });

  it("clips in DOCUMENT coordinates and reaches past the viewport", async () => {
    // The canvas sits 11675px down a page scrolled back to the top. A viewport
    // rect would photograph the hero instead.
    const node = canvasNode("squeezy-carousel__canvas", { x: 104, y: 11675.84, width: 1232, height: 460 });
    const c = client([{ x: 104, y: 11675.84, width: 1232, height: 460, tainted: true }]);

    await captureTaintedCanvases(c, tree(node));

    const [, params] = shots(c)[0] as unknown as [string, Record<string, unknown>];
    expect(params.captureBeyondViewport).toBe(true);
    expect(params.clip).toMatchObject({ x: 104, y: 11675.84, width: 1232, height: 460, scale: 1 });
  });

  it("leaves a canvas the content script already read alone", async () => {
    // stripe.com's five `divider-canvas` elements are untainted and arrive with
    // their own bitmap — re-shooting them would be pure waste.
    const node = canvasNode("divider-canvas", { x: 0, y: 100, width: 1264, height: 20 }, "data:image/png;base64,EXISTING");
    const c = client([{ x: 0, y: 100, width: 1264, height: 20, tainted: false }]);

    await captureTaintedCanvases(c, tree(node));

    expect(shots(c)).toHaveLength(0);
    expect(node.$url).toBe("data:image/png;base64,EXISTING");
  });

  it("leaves an untainted, unpainted canvas alone", async () => {
    // A canvas whose backing store was never sized paints nothing. Its
    // screenshot would be the page behind it — an opaque rectangle that covers
    // content instead of adding any.
    const node = canvasNode("hero-wave-animation__canvas", { x: 0, y: 0, width: 1392, height: 761 });
    const c = client([{ x: 0, y: 0, width: 1392, height: 761, tainted: false }]);

    await captureTaintedCanvases(c, tree(node));

    expect(shots(c)).toHaveLength(0);
    expect(node.$url).toBeUndefined();
  });

  it("picks JPEG once the region is past the lossless pixel budget", async () => {
    // Same rule as canvas-raster.ts: PNG up to 1M pixels, JPEG above it.
    const big = canvasNode("big", { x: 0, y: 0, width: 2000, height: 1000 });
    const c = client([{ x: 0, y: 0, width: 2000, height: 1000, tainted: true }]);

    await captureTaintedCanvases(c, tree(big));

    const [, params] = shots(c)[0] as unknown as [string, Record<string, unknown>];
    expect(params.format).toBe("jpeg");
    expect(params.quality).toBe(75);
    expect(big.$url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("drops a shot that busts the per-canvas budget", async () => {
    const node = canvasNode("huge", { x: 0, y: 0, width: 900, height: 900 });
    const c = client([{ x: 0, y: 0, width: 900, height: 900, tainted: true }], {
      bytes: MAX_CANVAS_SHOT_BYTES + 1,
    });

    await captureTaintedCanvases(c, tree(node));

    expect(node.$url).toBeUndefined();
  });

  it("stops once the page budget is spent", async () => {
    // Each shot sits just inside the per-canvas cap, so it is the page total
    // that runs out: two fit, the third does not.
    const each = MAX_CANVAS_SHOT_BYTES - 1;
    expect(each * 2).toBeLessThanOrEqual(MAX_CANVAS_SHOT_TOTAL_BYTES);
    expect(each * 3).toBeGreaterThan(MAX_CANVAS_SHOT_TOTAL_BYTES);

    const nodes = [0, 200, 400].map((y, i) =>
      canvasNode(`c${i}`, { x: 0, y, width: 100, height: 100 }),
    );
    const c = client(
      [0, 200, 400].map((y) => ({ x: 0, y, width: 100, height: 100, tainted: true })),
      { bytes: each },
    );

    await captureTaintedCanvases(c, tree(...nodes));

    expect(nodes[0].$url).toBeDefined();
    expect(nodes[1].$url).toBeDefined();
    expect(nodes[2].$url).toBeUndefined();
  });

  it("skips a rect that matches no node, or more than one", async () => {
    // Two canvases stacked at the same rect: assigning either shot to either
    // node would be a guess, and a wrong image is worse than none.
    const a = canvasNode("a", { x: 10, y: 20, width: 300, height: 150 });
    const b = canvasNode("b", { x: 10, y: 20, width: 300, height: 150 });
    const c = client([
      { x: 10, y: 20, width: 300, height: 150, tainted: true },
      { x: 999, y: 999, width: 50, height: 50, tainted: true },
    ]);

    await captureTaintedCanvases(c, tree(a, b));

    expect(a.$url).toBeUndefined();
    expect(b.$url).toBeUndefined();
    expect(shots(c)).toHaveLength(0);
  });

  it("never throws when the screenshot fails", async () => {
    const node = canvasNode("squeezy", { x: 0, y: 0, width: 100, height: 100 });
    const c = client([{ x: 0, y: 0, width: 100, height: 100, tainted: true }], { fail: true });

    await expect(captureTaintedCanvases(c, tree(node))).resolves.toBeUndefined();
    expect(node.$url).toBeUndefined();
  });

  it("never throws when the page cannot be probed at all", async () => {
    const node = canvasNode("squeezy", { x: 0, y: 0, width: 100, height: 100 });
    const send = vi.fn().mockRejectedValue(new Error("Execution context destroyed"));

    await expect(
      captureTaintedCanvases({ send: send as unknown as CDPSend }, tree(node)),
    ).resolves.toBeUndefined();
    expect(node.$url).toBeUndefined();
  });

  it("does not probe a page with no canvas nodes at all", async () => {
    const c = client([]);
    await captureTaintedCanvases(c, tree());
    expect(c.calls).not.toHaveBeenCalled();
  });
});
