/* eslint-disable no-console -- capture diagnostics; silenced in prod by
 * gateConsoleInProduction(). */
/**
 * WebGL canvases, photographed from the compositor.
 *
 * A WebGL context created without `preserveDrawingBuffer` can be read back by
 * the page only until its frame is presented; after that the pixels exist in
 * the compositor alone. The content script's read (canvas-raster.ts) bets on a
 * `requestAnimationFrame` landing right after the page's own draw, which only
 * works while the page redraws every frame. On stripe.com the issuing card,
 * globe, data-viz and developer wave render on demand and read 0% painted even
 * then, and under the reduced motion the capture emulates the hero wave and the
 * agentic background stop redrawing too — six empty boxes in Figma.
 *
 * `Page.captureScreenshot` reads the compositor, but a plain shot of the rect is
 * the page as seen: the section behind the canvas and everything painted over
 * it (stripe's developer wave came back with its "500M+ / 10K+ / 150K+" stats
 * burnt in, then drawn again as live text). So each shot is ISOLATED: every
 * other element `visibility: hidden`, the page background transparent, the
 * canvas's own border / background / shadow and the chain's opacity, filter
 * and blend neutralised (the plugin applies those itself). The PNG is then the
 * canvas's own pixels with alpha, and a canvas that shows nothing comes back
 * fully transparent and stays blank.
 *
 * Only canvases whose context is not 2D qualify: a 2D read is reliable, so a 2D
 * canvas that read blank IS blank. Tainted 2D canvases are the shared
 * `captureTaintedCanvases`'s job, which runs first.
 *
 * Never throws — an improvement on a capture, never a precondition for one.
 */

import type { W2WFrameNode, W2WNode } from "@w2w/shared";
import { MAX_CANVAS_DATA_URL_BYTES, MAX_CANVAS_TOTAL_BYTES } from "../../content/canvas-raster";

type CdpClient = {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A qualifying canvas as the page reports it — document rect, bitmap width, DPR. */
interface WebglCanvasProbe extends Rect {
  idx: number;
  bitmapWidth: number;
  dpr: number;
}

const RECT_TOLERANCE = 1;

/**
 * The page restores itself this long after an isolation, in case the capture
 * dies mid-shot — the debugger detaches (the user cancels its infobar, closes
 * the tab) and the restore below can never be sent. Without it the user's tab
 * would stay blank. Comfortably longer than one shot (~0.3s measured).
 */
const SAFETY_RESTORE_MS = 5000;

const STYLE_ID = "__w2w_canvas_shot";
const SHOT_ATTR = "data-w2w-canvas-shot";
const CHAIN_ATTR = "data-w2w-canvas-shot-chain";

const ISOLATION_CSS = [
  "html, body { background: transparent !important; }",
  // A running transition outranks !important — freeze them for the shot.
  "html * { visibility: hidden !important; transition: none !important; }",
  `[${CHAIN_ATTR}], [${SHOT_ATTR}] { opacity: 1 !important; filter: none !important; mix-blend-mode: normal !important; }`,
  `[${SHOT_ATTR}] { visibility: visible !important; border-color: transparent !important; background: transparent !important; box-shadow: none !important; }`,
].join(" ");

const NEAR_JS = `const near = (a, b) => Math.abs(a - b) <= ${RECT_TOLERANCE};`;

const RESTORE_JS = `
  if (window.__w2wCanvasShotTimer) {
    clearTimeout(window.__w2wCanvasShotTimer);
    window.__w2wCanvasShotTimer = undefined;
  }
  const isolationStyle = document.getElementById('${STYLE_ID}');
  if (isolationStyle) isolationStyle.remove();
  for (const el of document.querySelectorAll('[${SHOT_ATTR}],[${CHAIN_ATTR}]')) {
    el.removeAttribute('${SHOT_ATTR}');
    el.removeAttribute('${CHAIN_ATTR}');
  }
`;

/** Undo {@link w2wIsolateCanvasExpression} — style, markers and safety timer. */
export const W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION = `(() => {${RESTORE_JS}})()`;

/**
 * Every `<canvas>` whose document rect one of `rects` names, that has a bitmap
 * and whose context is not 2D (`getContext('2d')` answers null, or throws once
 * control went to an OffscreenCanvas).
 *
 * `getContext('2d')` is a claim on a canvas nothing has initialized, so it is
 * only asked of canvases that hold a bitmap AND match a captured node: those
 * were already asked for '2d' by the content-script pre-pass (canvas-raster.ts
 * skips zero-size bitmaps, which is why they are skipped here too).
 */
export function w2wWebglCanvasProbeExpression(rects: Rect[]): string {
  const wanted = rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
  return `(() => {
    const rects = ${JSON.stringify(wanted)};
    ${NEAR_JS}
    const out = [];
    const canvases = document.querySelectorAll('canvas');
    for (let idx = 0; idx < canvases.length; idx++) {
      const c = canvases[idx];
      if (!(c.width > 0 && c.height > 0)) continue;
      const r = c.getBoundingClientRect();
      const x = r.left + window.scrollX;
      const y = r.top + window.scrollY;
      if (!rects.some((q) => near(q.x, x) && near(q.y, y) && near(q.width, r.width) && near(q.height, r.height))) continue;
      let twoD = false;
      try { twoD = !!c.getContext('2d'); } catch (e) { twoD = false; }
      if (twoD) continue;
      out.push({ idx, x, y, width: r.width, height: r.height, bitmapWidth: c.width, dpr: window.devicePixelRatio || 1 });
    }
    return out;
  })()`;
}

/**
 * Hide everything but canvas `idx` — after checking it still sits at `rect`
 * (the live page may have added or removed a canvas since the probe). Evaluates
 * to whether it isolated. Arms the self-restore timer.
 */
export function w2wIsolateCanvasExpression(idx: number, rect: Rect): string {
  return `(() => {
    const c = document.querySelectorAll('canvas')[${idx}];
    if (!c) return false;
    ${NEAR_JS}
    const r = c.getBoundingClientRect();
    if (!(near(r.left + window.scrollX, ${rect.x}) && near(r.top + window.scrollY, ${rect.y}) &&
          near(r.width, ${rect.width}) && near(r.height, ${rect.height}))) return false;
    ${RESTORE_JS}
    c.setAttribute('${SHOT_ATTR}', '');
    for (let el = c.parentElement; el; el = el.parentElement) el.setAttribute('${CHAIN_ATTR}', '');
    const style = document.createElement('style');
    style.id = '${STYLE_ID}';
    style.textContent = ${JSON.stringify(ISOLATION_CSS)};
    (document.head || document.documentElement).appendChild(style);
    window.__w2wCanvasShotTimer = setTimeout(() => {${RESTORE_JS}}, ${SAFETY_RESTORE_MS});
    return true;
  })()`;
}

/**
 * True when the PNG has no pixel with any alpha. False when it has one, or when
 * the worker can't decode it (then the shot is kept — unreadable is not proof
 * of empty).
 */
export async function w2wIsFullyTransparentPng(base64: string): Promise<boolean> {
  try {
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return false;
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  } catch {
    return false;
  }
}

function collectBitmaplessCanvases(node: W2WNode, out: W2WFrameNode[]): void {
  if (node.type !== "FRAME") return;
  if (node.tag === "canvas" && !node.$url) out.push(node);
  for (const child of node.children ?? []) collectBitmaplessCanvases(child, out);
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= RECT_TOLERANCE &&
    Math.abs(a.y - b.y) <= RECT_TOLERANCE &&
    Math.abs(a.width - b.width) <= RECT_TOLERANCE &&
    Math.abs(a.height - b.height) <= RECT_TOLERANCE
  );
}

async function evaluateValue(client: CdpClient, expression: string): Promise<unknown> {
  const res = await client.send<{ result?: { value?: unknown }; exceptionDetails?: unknown }>(
    "Runtime.evaluate",
    { expression, returnByValue: true },
  );
  return res?.exceptionDetails ? undefined : res?.result?.value;
}

/**
 * Give every bitmap-less WebGL canvas in `frame` its compositor pixels, in
 * place. Runs per viewport, after `captureTaintedCanvases` and before the frame
 * is banked. `isBlank` is injectable for tests.
 */
export async function captureWebglCanvases(
  client: CdpClient,
  frame: W2WFrameNode,
  isBlank: (base64Png: string) => Promise<boolean> = w2wIsFullyTransparentPng,
): Promise<void> {
  const nodes: W2WFrameNode[] = [];
  collectBitmaplessCanvases(frame, nodes);
  if (nodes.length === 0) return;

  let probes: WebglCanvasProbe[];
  try {
    const value = await evaluateValue(client, w2wWebglCanvasProbeExpression(nodes));
    probes = Array.isArray(value) ? (value as WebglCanvasProbe[]) : [];
  } catch {
    return;
  }

  let spent = 0;
  let captured = 0;
  for (const probe of probes) {
    if (spent >= MAX_CANVAS_TOTAL_BYTES) break;

    // The rect has to name exactly one node — a wrong image is worse than none.
    const matches = nodes.filter((n) => !n.$url && sameRect(n, probe));
    if (matches.length !== 1) continue;

    let data = "";
    let overrideAttempted = false;
    let overrideFailed = false;
    try {
      if ((await evaluateValue(client, w2wIsolateCanvasExpression(probe.idx, probe))) === true) {
        overrideAttempted = true;
        try {
          await client.send("Emulation.setDefaultBackgroundColorOverride", {
            color: { r: 0, g: 0, b: 0, a: 0 },
          });
        } catch {
          overrideFailed = true;
        }
        if (!overrideFailed) {
          const shot = await client.send<{ data?: string }>("Page.captureScreenshot", {
            format: "png", // the alpha is the point — JPEG would turn it black
            clip: {
              x: probe.x,
              y: probe.y,
              width: probe.width,
              height: probe.height,
              // The resolution toDataURL would have given, never above the device's.
              scale: Math.min(1, probe.bitmapWidth / probe.width / probe.dpr),
            },
            captureBeyondViewport: true,
          });
          data = shot?.data ?? "";
        }
      }
    } catch {
      data = "";
    } finally {
      if (overrideAttempted) {
        await client.send("Emulation.setDefaultBackgroundColorOverride", {}).catch(() => undefined);
      }
      await client
        .send("Runtime.evaluate", { expression: W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION })
        .catch(() => undefined);
    }

    if (overrideFailed) {
      // Without a transparent page background a blank canvas would come back as
      // an opaque box covering content — stop rather than risk it.
      console.warn("[W2W] WebGL canvas shots skipped: transparent background override refused");
      break;
    }
    if (!data) continue;
    if (data.length > MAX_CANVAS_DATA_URL_BYTES || spent + data.length > MAX_CANVAS_TOTAL_BYTES) {
      console.warn(
        `[W2W] WebGL canvas shot dropped: ${Math.round(data.length / 1024)}KB exceeds the payload budget`,
        { width: Math.round(probe.width), height: Math.round(probe.height) },
      );
      continue;
    }
    // Shows nothing: stays blank, so the plugin can still report it.
    if (await isBlank(data)) continue;

    spent += data.length;
    matches[0].$url = `data:image/png;base64,${data}`;
    captured++;
  }

  if (captured > 0) {
    console.log(`[W2W] WebGL canvases captured by isolated screenshot: ${captured}, ${Math.round(spent / 1024)}KB`);
  }
}
