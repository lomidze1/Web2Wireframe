/**
 * `<canvas>` bitmaps the page itself cannot hand over.
 *
 * The content-script rasterizer (h2d's algorithm, ported in
 * `packages/browser-extension/src/content/canvas-raster.ts`) reads a canvas with
 * `toDataURL`. That fails permanently once the canvas has drawn a cross-origin
 * image without CORS: it is tainted, and both `getImageData` and `toDataURL`
 * raise SecurityError. The only way left is to photograph the compositor.
 *
 * Lives here, not in either host, because both capture paths run it — the API
 * over Puppeteer's CDP session and the extension over `chrome.debugger`. The
 * hydration wait spent a while duplicated across the two, only the API's copy
 * got fixed, and every extension capture quietly lost scroll-reveal content
 * until it moved into this package.
 */

import type { CDPClientInterface } from "./types";
import type { W2WFrameNode, W2WNode } from "./w2w-types";

/**
 * Above this a single canvas screenshot is dropped rather than shipped, and
 * above the total the page stops spending. Same figures, and the same reasoning,
 * as the content-script rasterizer's own caps in
 * `packages/browser-extension/src/content/canvas-raster.ts`: the image rides in
 * `$url` once per node and once per viewport, and a 413 fails the WHOLE import
 * where a dropped canvas costs one image. Re-declared rather than imported —
 * `@w2w/shared` does not re-export them and the API must not depend on the
 * extension package.
 */
export const MAX_CANVAS_SHOT_BYTES = 4 * 1024 * 1024;
export const MAX_CANVAS_SHOT_TOTAL_BYTES = 8 * 1024 * 1024;

/** Above this a shot is JPEG rather than PNG — canvas-raster.ts's rule. */
const CANVAS_LOSSLESS_PIXEL_BUDGET = 1024 * 1024;

/** One canvas as the page reports it: document-space rect plus readability. */
interface CanvasProbe {
  x: number;
  y: number;
  width: number;
  height: number;
  tainted: boolean;
}

/**
 * Ask the page for every `<canvas>`: where it is, and whether its pixels can
 * still be read back.
 *
 * `getImageData(0, 0, 1, 1)` is the cheap probe — it throws on a tainted canvas
 * without encoding anything, where `toDataURL` would encode the whole bitmap
 * just to find out. It only answers for a 2D context, so a WebGL canvas falls
 * back to `toDataURL`. Claiming the 2D context is safe here for the same reason
 * canvas-raster.ts gives: the content-script pre-pass already asked every canvas
 * for '2d' before we ever run, so this creates nothing new.
 */
const CANVAS_PROBE_EXPRESSION = `
  (() => {
    const out = [];
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (!(r.width > 0.5 && r.height > 0.5)) continue;
      let tainted = false;
      try {
        let ctx = null;
        try { ctx = c.getContext('2d'); } catch (e) { ctx = null; }
        if (ctx) ctx.getImageData(0, 0, 1, 1);
        else c.toDataURL();
      } catch (e) {
        tainted = true;
      }
      out.push({
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        width: r.width,
        height: r.height,
        tainted,
      });
    }
    return out;
  })()
`;

/** Collect every `<canvas>` frame in the tree, in document order. */
function collectCanvasNodes(node: W2WNode, out: W2WFrameNode[]): void {
  if (node.type !== "FRAME") return;
  const frame = node as W2WFrameNode;
  if (frame.tag === "canvas") out.push(frame);
  for (const child of frame.children ?? []) collectCanvasNodes(child, out);
}

/**
 * Fill in the canvases the content script could not read.
 *
 * A `<canvas>` that has drawn a cross-origin image without CORS is tainted for
 * the rest of its life: `getImageData` and `toDataURL` both raise SecurityError,
 * so the rasterizer in the page — h2d's own algorithm, ported in
 * canvas-raster.ts — has nothing to export and the section reaches Figma as an
 * empty box. Measured on stripe.com: `.squeezy-carousel__canvas` is tainted by
 * `drawImage` call #79 (`images.stripeassets.com/.../annual-letter-desktop...`,
 * `crossOrigin: null`), and h2d loses that canvas too — their `Em`
 * (index.beautified.js:13410) calls `getImageData` unguarded, and their own
 * stripe.com capture carries no node for it.
 *
 * `Page.captureScreenshot` reads the compositor rather than the canvas, so taint
 * does not reach it. Clipped to the element's document rect it returned the
 * carousel exactly — 527KB, 276ms, scroll position untouched.
 *
 * Only tainted canvases are shot. One that arrived with its own bitmap needs
 * nothing, and one that is merely blank must stay blank: its screenshot would be
 * the page behind it, i.e. an opaque rectangle covering content rather than
 * adding any.
 *
 * Never throws. This is an improvement on a capture, never a precondition for
 * one.
 */
export async function captureTaintedCanvases(
  // Only `send` is used, so a bare CDP session satisfies this — no host has to
  // hand over a client it does not have.
  client: Pick<CDPClientInterface, "send">,
  frame: W2WFrameNode,
): Promise<void> {
  const nodes: W2WFrameNode[] = [];
  collectCanvasNodes(frame, nodes);
  if (nodes.length === 0) return;

  let probes: CanvasProbe[];
  try {
    const result = await client.send<{ result: { value?: CanvasProbe[] } }>(
      "Runtime.evaluate",
      { expression: CANVAS_PROBE_EXPRESSION, returnByValue: true },
    );
    probes = result?.result?.value ?? [];
  } catch {
    return;
  }

  let spent = 0;
  for (const probe of probes) {
    if (!probe.tainted) continue;
    if (spent >= MAX_CANVAS_SHOT_TOTAL_BYTES) break;

    // A node already carrying a bitmap needs nothing. Among the rest the rect
    // has to identify exactly one — two canvases stacked at the same rect would
    // make the assignment a guess, and a wrong image is worse than none.
    const candidates = nodes.filter(
      (n) =>
        !n.$url &&
        Math.abs(n.x - probe.x) <= 1 &&
        Math.abs(n.y - probe.y) <= 1 &&
        Math.abs(n.width - probe.width) <= 1 &&
        Math.abs(n.height - probe.height) <= 1,
    );
    if (candidates.length !== 1) {
      console.warn(
        `[W2W] tainted canvas skipped: ${candidates.length} nodes match ${Math.round(probe.width)}x${Math.round(probe.height)} @ ${Math.round(probe.x)},${Math.round(probe.y)}`,
      );
      continue;
    }
    const node = candidates[0];

    const lossless = probe.width * probe.height <= CANVAS_LOSSLESS_PIXEL_BUDGET;
    const format = lossless ? "png" : "jpeg";

    let data: string;
    try {
      const shot = await client.send<{ data: string }>("Page.captureScreenshot", {
        format,
        ...(lossless ? {} : { quality: 75 }),
        // Document coordinates, and the region is far outside the viewport on a
        // page scrolled back to the top — a viewport rect would photograph
        // whatever happens to be on screen instead.
        clip: {
          x: probe.x,
          y: probe.y,
          width: probe.width,
          height: probe.height,
          scale: 1,
        },
        captureBeyondViewport: true,
      });
      data = shot?.data ?? "";
    } catch {
      continue;
    }
    if (!data) continue;

    if (data.length > MAX_CANVAS_SHOT_BYTES || spent + data.length > MAX_CANVAS_SHOT_TOTAL_BYTES) {
      console.warn(
        `[W2W] tainted canvas dropped: ${Math.round(data.length / 1024 / 1024)}MB exceeds the payload budget`,
        { width: Math.round(probe.width), height: Math.round(probe.height), format },
      );
      continue;
    }

    spent += data.length;
    node.$url = `data:image/${format};base64,${data}`;
    console.log(
      `[W2W] tainted canvas captured by screenshot: ${Math.round(probe.width)}x${Math.round(probe.height)} ${format} ${Math.round(data.length / 1024)}KB`,
    );
  }
}
