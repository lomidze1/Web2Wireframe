/**
 * `<canvas>` bitmap capture — port of h2d's content-script canvas branch.
 *
 * A `<canvas>` carries no DOM children and no CSS background, so a capture that
 * only reads `<img src>` / `<video poster>` renders it as an empty frame. On
 * pages that paint real content into a canvas that loses the whole section:
 * stripe.com's "What's happening" carousel draws all eight cards into
 * `canvas.squeezy-carousel__canvas` (CSS 1232x460), and its source images live
 * only in a `display:none` mobile carousel that never loads — the bitmap is the
 * only pixel source on the page.
 *
 * h2d solves it by exporting the bitmap to a data URL and storing it in the same
 * `$url` field `<img>` uses (`km` -> `Sm` -> `Wa` -> `Em`, index.beautified.js
 * 13405-13466). The renderer already treats `canvas` as media and paints `$url`
 * as an image fill (css-converter.ts `isMedia`), so nothing downstream changes.
 *
 * What is deliberately NOT copied from h2d: it lets every failure escape. A
 * tainted canvas throws SecurityError out of `getImageData`/`toDataURL`, and its
 * WebGL branch awaits a `requestAnimationFrame` that never fires in a hidden
 * tab. Both would abort or stall a capture on a page we do not control, so every
 * path here resolves to null instead.
 */

/**
 * Above this, a single canvas is dropped rather than shipped in the payload.
 *
 * The data URL rides in `$url`, once per node, and the same canvas is captured
 * once per viewport. At 12MB one canvas over three viewports was 36MB before
 * the rest of the page, against the API's 50MB body limit — and a 413 fails the
 * WHOLE import, where a dropped canvas costs one image.
 */
export const MAX_CANVAS_DATA_URL_BYTES = 4 * 1024 * 1024;

/**
 * And a ceiling for the page as a whole: the per-canvas limit says nothing
 * about ten of them. Spent first-come-first-served, i.e. in document order.
 */
export const MAX_CANVAS_TOTAL_BYTES = 8 * 1024 * 1024;

/** A canvas over this many pixels exports as JPEG unless it has transparency. */
const LOSSLESS_PIXEL_BUDGET = 1024 * 1024;

/** How long to wait for the WebGL frame callback before giving up. */
const RAF_TIMEOUT_MS = 200;

export interface CanvasExport {
  type: string;
  quality?: number;
}

/** h2d `Cm` — every pixel fully transparent, i.e. nothing was ever painted. */
function isFullyTransparent(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

/** h2d `Mm` — at least one pixel is not fully opaque. */
function hasTransparency(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

/**
 * Read a canvas's pixels through a scratch 2D canvas — the only way to inspect
 * a WebGL canvas, which has no `getImageData` of its own.
 *
 * Full size, not a downscale: `drawImage` would average sparse content away and
 * a thin line could read as empty. Returns null when nothing can be read —
 * a tainted source taints the scratch canvas too, and unreadable is not proof
 * of empty.
 */
function readPixelsViaScratchCanvas(canvas: HTMLCanvasElement): ArrayLike<number> | null {
  try {
    const { width, height } = canvas;
    if (!(width > 0 && height > 0)) return null;
    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    return ctx.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }
}

/**
 * Which format to export this canvas as — h2d `Em`, plus a WebGL emptiness
 * check h2d does not have.
 *
 * Returns null when the canvas paints nothing, so a blank bitmap never becomes a
 * multi-megabyte transparent PNG in the payload — and, just as importantly,
 * never occupies `$url`, which would suppress the `captureTaintedCanvases`
 * screenshot fallback (it only fires on a node with no `$url`).
 *
 * Only a 2D context can be read directly. For WebGL h2d assumes content and
 * transparency (and therefore PNG); we first try a scratch-canvas read, because
 * an unpainted WebGL buffer is common in a capture: `preserveDrawingBuffer` is
 * usually false, so anything that stops the render loop — a hidden tab, a
 * paused animation, `prefers-reduced-motion` — leaves it fully transparent.
 * Measured on stripe.com: five canvases (hero wave, globe, data-viz, two
 * developer waves) came back 100% transparent that way. When the read fails,
 * h2d's assumption stands.
 */
export function canvasExportType(canvas: HTMLCanvasElement): CanvasExport | null {
  let transparent = false;
  // h2d's default for the unreadable (WebGL) case.
  let translucent = true;

  try {
    const ctx = canvas.getContext('2d');
    const data = ctx
      ? ctx.getImageData(0, 0, canvas.width, canvas.height).data
      : readPixelsViaScratchCanvas(canvas);
    if (data) {
      transparent = isFullyTransparent(data);
      translucent = hasTransparency(data);
    }
  } catch {
    // Tainted canvas (cross-origin pixels drawn without CORS) — the pixels
    // cannot be inspected, and toDataURL will refuse too. Bail out here rather
    // than let the caller discover it one throw later.
    return null;
  }

  if (transparent) return null;

  const withinBudget = canvas.width * canvas.height <= LOSSLESS_PIXEL_BUDGET;
  return withinBudget || translucent
    ? { type: 'image/png' }
    : { type: 'image/jpeg', quality: 0.75 };
}

/** h2d `Wa` — export, or null when the canvas has nothing worth exporting. */
function exportCanvas(canvas: HTMLCanvasElement): string | null {
  const format = canvasExportType(canvas);
  if (!format) return null;

  let url: string;
  try {
    url = canvas.toDataURL(format.type, format.quality);
  } catch {
    // Tainted canvas — h2d lets this throw and loses the whole subtree.
    return null;
  }

  if (url.length > MAX_CANVAS_DATA_URL_BYTES) {
    console.warn(
      `[W2W] canvas bitmap dropped: ${Math.round(url.length / 1024 / 1024)}MB exceeds the payload budget`,
      { width: canvas.width, height: canvas.height, type: format.type },
    );
    return null;
  }

  return url;
}

/**
 * Rasterize one canvas to a data URL — h2d `Sm`, hardened. Never throws.
 *
 * A WebGL context created without `preserveDrawingBuffer` has its buffer cleared
 * as soon as the frame is composited, so reading it outside a frame callback
 * yields an empty image. h2d waits on `requestAnimationFrame` for exactly that;
 * we race it against a timeout, because a hidden or throttled tab never fires
 * one and the capture would otherwise wait forever.
 */
export async function rasterizeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  if (!canvas.width || !canvas.height) return null;

  try {
    // 2D first — h2d probes WebGL first, and that ordering is not safe here.
    // `getContext` is a claim, not a query: on a canvas the page has not
    // initialized yet, the first type asked for is the type it is stuck with,
    // and this runs inside the user's real tab. Claiming 2D leaves the page's
    // own `getContext('2d')` — by far the most common later call — working,
    // where claiming webgl2 made it return null forever. A canvas that already
    // holds a WebGL context answers null to '2d' without creating anything, so
    // the WebGL branch below is reached exactly as before.
    const ctx2d = getContextSafely(canvas, '2d');

    if (!ctx2d) {
      const gl = (getContextSafely(canvas, 'webgl2') ??
        getContextSafely(canvas, 'webgl')) as WebGLRenderingContext | null;

      if (gl && !gl.getContextAttributes()?.preserveDrawingBuffer) {
        return await readInsideAnimationFrame(canvas);
      }
    }

    return exportCanvas(canvas);
  } catch {
    return null;
  }
}

function getContextSafely(canvas: HTMLCanvasElement, type: string): unknown {
  try {
    return canvas.getContext(type);
  } catch {
    return null;
  }
}

function readInsideAnimationFrame(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), RAF_TIMEOUT_MS);

    requestAnimationFrame(() => {
      clearTimeout(timer);
      let url: string | null = null;
      try {
        url = exportCanvas(canvas);
      } catch {
        url = null;
      }
      finish(url);
    });
  });
}

/**
 * Rasterize every canvas in the document into `target`, before the (synchronous)
 * DOM traversal reads it. Runs as a pre-pass because the WebGL branch has to
 * await a frame callback and the traversal cannot.
 */
export async function rasterizeCanvases(
  target: WeakMap<HTMLCanvasElement, string>,
): Promise<void> {
  let canvases: HTMLCanvasElement[];
  try {
    canvases = Array.from(document.querySelectorAll('canvas'));
  } catch {
    return;
  }

  let spent = 0;
  for (const canvas of canvases) {
    if (spent >= MAX_CANVAS_TOTAL_BYTES) {
      target.delete(canvas);
      continue;
    }
    const url = await rasterizeCanvas(canvas);
    if (url && spent + url.length > MAX_CANVAS_TOTAL_BYTES) {
      console.warn('[W2W] canvas bitmap dropped: page payload budget spent', {
        width: canvas.width,
        height: canvas.height,
      });
      target.delete(canvas);
      continue;
    }
    if (url) spent += url.length;
    // Delete on failure, never leave the previous entry standing. The capture
    // emulates each viewport in place — no Page.reload — so both this map and
    // the canvas elements survive into the next one. A canvas that exported at
    // 1440 and then fails at 375 (the WebGL read gives up on a 200ms rAF
    // timeout, which is flaky under load) would otherwise hand the mobile
    // frame the desktop bitmap.
    if (url) target.set(canvas, url);
    else target.delete(canvas);
  }
}
