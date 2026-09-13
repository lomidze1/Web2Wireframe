/**
 * Figma's image size limit — and which captured images break it.
 *
 * `figma.createImage` takes PNG/JPEG/GIF up to 4096px in width and height and
 * throws on anything larger ("Image is too large"); it never downscales. The
 * extension captures at the display's native DPR, so on a Retina screen a
 * srcset resolves to its 2x candidate: apple.com's 3008×692 hero arrived as a
 * 6016×1384 JPEG and was drawn as "Image could not be decoded".
 *
 * The sandbox has no canvas, so an oversized image rides the same UI-iframe
 * conversion that already turns WebP/AVIF into PNG/JPEG (main.ts → App.tsx).
 * Pure module: imported by the sandbox (planning) and the UI (sizing).
 */

import { parseImageSize } from "../rendering/imageCrop";
import type { WireframeFrame } from "../types";

export const FIGMA_MAX_IMAGE_DIMENSION = 4096;

/** Base64 characters decoded to find a header — a JPEG frame header usually
 *  sits well inside this; one buried deeper falls back to the full payload. */
const HEADER_BASE64_CHARS = 256 * 1024;

const RASTER_DATA_URI = /^data:image\/(png|jpeg|gif);base64,/i;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

function decodeBase64(base64: string): Uint8Array {
  let s = base64.replace(/\s+/g, "");
  s = s.slice(0, s.length - (s.length % 4));
  let length = (s.length / 4) * 3;
  if (s.endsWith("==")) length -= 2;
  else if (s.endsWith("=")) length -= 1;
  const bytes = new Uint8Array(length);
  let p = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_LOOKUP[s.charCodeAt(i)];
    const b = B64_LOOKUP[s.charCodeAt(i + 1)];
    const c = B64_LOOKUP[s.charCodeAt(i + 2)];
    const d = B64_LOOKUP[s.charCodeAt(i + 3)];
    if (p < length) bytes[p++] = (a << 2) | (b >> 4);
    if (p < length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

/**
 * Natural pixel size of a base64 PNG/JPEG/GIF data URI, read from its header.
 * Null for anything else (other formats are the format-conversion path's job)
 * and for input that does not parse.
 */
export function dataUriImageSize(dataUri: string): { width: number; height: number } | null {
  const match = dataUri.match(RASTER_DATA_URI);
  if (!match) return null;
  const payload = dataUri.slice(match[0].length);
  try {
    const head = parseImageSize(decodeBase64(payload.slice(0, HEADER_BASE64_CHARS)));
    if (head) return head;
    return payload.length > HEADER_BASE64_CHARS ? parseImageSize(decodeBase64(payload)) : null;
  } catch {
    return null;
  }
}

/** Wider or taller than Figma accepts. Unmeasurable input answers false. */
export function exceedsFigmaImageLimit(dataUri: string): boolean {
  const size = dataUriImageSize(dataUri);
  return !!size && Math.max(size.width, size.height) > FIGMA_MAX_IMAGE_DIMENSION;
}

/** The largest size within `max` that keeps the aspect ratio — never upscales, never below 1. */
export function fitWithinFigmaLimit(
  width: number,
  height: number,
  max: number = FIGMA_MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const factor = max / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

export interface OversizedImageJob {
  /** The key the renderer looks up — `node.imageUrl` / `fill.imageUrl`. */
  url: string;
  dataUri: string;
  /** Every frame whose tree asks for this url. */
  frameIdxs: number[];
}

/**
 * The oversized images the renderer is about to hand to `figma.createImage`.
 *
 * Read off each frame's converted tree — `imageUrl` on media nodes and on
 * background fills — because those are exactly the keys the renderer asks the
 * assets map for (nodes.ts / fills.ts). The source is `frame.assets[url]`, else
 * the url itself when it is an inline data URI (a canvas bitmap never enters
 * the map). One job per url across all frames.
 */
export function planOversizedImages(frames: WireframeFrame[]): OversizedImageJob[] {
  const jobs = new Map<string, OversizedImageJob>();

  frames.forEach((frame, frameIdx) => {
    const consider = (url: unknown): void => {
      if (typeof url !== "string" || !url) return;
      const existing = jobs.get(url);
      if (existing) {
        if (!existing.frameIdxs.includes(frameIdx)) existing.frameIdxs.push(frameIdx);
        return;
      }
      const dataUri = frame.assets?.[url] ?? (url.startsWith("data:") ? url : undefined);
      if (dataUri && exceedsFigmaImageLimit(dataUri)) jobs.set(url, { url, dataUri, frameIdxs: [frameIdx] });
    };

    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as { imageUrl?: unknown; fills?: unknown; children?: unknown };
      consider(n.imageUrl);
      if (Array.isArray(n.fills)) for (const fill of n.fills) consider((fill as { imageUrl?: unknown })?.imageUrl);
      if (Array.isArray(n.children)) for (const child of n.children) walk(child);
    };
    walk(frame.tree);
  });

  return Array.from(jobs.values());
}
