/**
 * Posterless `<video>` → its current frame as a data URL for `$url`.
 *
 * A `<video>` without a `poster` gives the extractor nothing to paint, and the
 * renderer draws a placeholder. apple.com's hero tiles are exactly that: the
 * URL import only gets an image because the API emulates reduced motion before
 * navigation, so Apple never starts the video and shows a static `<picture>`
 * instead. The extension captures the user's live tab, where the video already
 * played and that picture is `display:none`.
 *
 * The frame on screen is the honest source, and it can be read like a canvas
 * bitmap (measured on apple.com: `drawImage(video)` is readable, same-origin
 * media). Same hardening as canvas-raster.ts — this runs in a tab we do not
 * control, so every failure resolves to null and nothing throws.
 */
import { MAX_CANVAS_DATA_URL_BYTES } from './canvas-raster';

/** A video frame has no alpha, so JPEG — at the quality a hero image needs. */
export const VIDEO_FRAME_QUALITY = 0.8;

/** Figma's `createImage` rejects anything larger on either side. */
const FIGMA_MAX_IMAGE_SIDE = 4096;

/** `HTMLMediaElement.HAVE_CURRENT_DATA` — the current frame is decoded. */
const HAVE_CURRENT_DATA = 2;

function isFullyTransparent(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

/**
 * Every pixel exactly black — what a DRM-protected (EME) video draws: the read
 * succeeds, nothing throws, and a black rectangle would be worse than today's
 * placeholder. A real dark frame still carries some colour noise.
 */
function isSolidBlack(data: ArrayLike<number>): boolean {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return false;
  }
  return true;
}

/**
 * The size to draw the frame at: intrinsic, but no larger than 2x the box the
 * page shows it in (retina) and never past Figma's limit.
 */
export function videoFrameSize(video: HTMLVideoElement): { width: number; height: number } {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const rect = video.getBoundingClientRect();
  const boxLongSide = Math.max(rect.width, rect.height);
  const limit = boxLongSide > 0
    ? Math.min(FIGMA_MAX_IMAGE_SIDE, boxLongSide * 2)
    : FIGMA_MAX_IMAGE_SIDE;
  const scale = Math.min(1, limit / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Export one video's current frame, or null when there is nothing to export. Never throws. */
export function captureVideoFrame(video: HTMLVideoElement): string | null {
  try {
    // The page's own poster wins — this only fills the gap.
    if (video.poster) return null;
    if (!(video.readyState >= HAVE_CURRENT_DATA)) return null;
    if (!(video.videoWidth > 0 && video.videoHeight > 0)) return null;
    // Not shown (display:none, collapsed) — the traversal drops it anyway, and
    // it must not spend the shared payload budget first.
    const rect = video.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;

    const { width, height } = videoFrameSize(video);
    if (!(width > 0 && height > 0)) return null;

    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    // Throws for a cross-origin video without CORS — caught below.
    const pixels = ctx.getImageData(0, 0, width, height).data;
    if (isFullyTransparent(pixels) || isSolidBlack(pixels)) return null;

    const url = scratch.toDataURL('image/jpeg', VIDEO_FRAME_QUALITY);
    if (url.length > MAX_CANVAS_DATA_URL_BYTES) {
      console.warn(
        `[W2W] video frame dropped: ${Math.round(url.length / 1024 / 1024)}MB exceeds the payload budget`,
        { width, height },
      );
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Capture every posterless video into `target`, spending at most `budgetBytes`
 * (first come, first served), and return the bytes spent.
 *
 * Deletes on failure, like the canvas pass: viewports are emulated in place, so
 * a stale desktop frame would otherwise leak into the mobile capture.
 */
export function captureVideoFrames(
  target: WeakMap<HTMLVideoElement, string>,
  budgetBytes: number,
): number {
  let videos: HTMLVideoElement[];
  try {
    videos = Array.from(document.querySelectorAll('video'));
  } catch {
    return 0;
  }

  let spent = 0;
  for (const video of videos) {
    const url = spent < budgetBytes ? captureVideoFrame(video) : null;
    if (url && spent + url.length > budgetBytes) {
      console.warn('[W2W] video frame dropped: page payload budget spent');
      target.delete(video);
      continue;
    }
    if (url) {
      spent += url.length;
      target.set(video, url);
    } else {
      target.delete(video);
    }
  }
  return spent;
}
