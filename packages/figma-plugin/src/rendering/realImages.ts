/**
 * Real image rendering for Figma
 * Creates IMAGE fills from base64 data instead of placeholder frames
 */

import type { WireframeNode, RenderContext } from "../types";
import { applyCornerRadii } from "./layout";
import { parseImageSize, computeCoverCropTransform } from "./imageCrop";
import { isRasterMasqueradeSvg, extractEmbeddedImageFromSvg } from "@w2w/shared";
import { logger } from "../utils/logger";

// Base64 lookup table for pure JS decoding (Figma sandbox has no atob)
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

/**
 * Decode base64 string to Uint8Array — pure JS, no atob needed.
 * Works in Figma's restricted sandbox environment.
 */
function base64ToBytes(base64: string): Uint8Array {
  // Strip whitespace/newlines (MIME encoders wrap at 76 chars), then pad to
  // a multiple of 4 so charCodeAt never reads past the string end — an
  // out-of-range read returns NaN and produced garbage bytes. Mirrors the
  // same fix in fills.ts.
  let sanitized = base64.replace(/\s+/g, "");
  while (sanitized.length % 4 !== 0) sanitized += "=";
  base64 = sanitized;

  const len = base64.length;
  let bufferLength = Math.floor(len * 3 / 4);
  if (base64[len - 1] === "=") bufferLength--;
  if (base64[len - 2] === "=") bufferLength--;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[base64.charCodeAt(i)];
    const b = B64_LOOKUP[base64.charCodeAt(i + 1)];
    const c = B64_LOOKUP[base64.charCodeAt(i + 2)];
    const d = B64_LOOKUP[base64.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    bytes[p++] = ((b & 15) << 4) | (c >> 2);
    bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

/**
 * Decode a data URI to Uint8Array for figma.createImage()
 * Supports: data:image/png;base64,... and data:image/jpeg;base64,...
 */
function dataUriToBytes(dataUri: string): Uint8Array {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex === -1) throw new Error("Invalid data URI");
  return base64ToBytes(dataUri.substring(commaIndex + 1));
}

/**
 * Check if data URI is an SVG
 */
function isSvgDataUri(dataUri: string): boolean {
  return (
    dataUri.startsWith("data:image/svg") ||
    dataUri.trimStart().startsWith("<svg") ||
    dataUri.trimStart().startsWith("<?xml")
  );
}

/**
 * Decode an SVG data URI back to SVG markup for figma.createNodeFromSvg().
 *
 * Handles all three shapes a page can serve:
 *   - `data:image/svg+xml;base64,…`        → base64
 *   - `data:image/svg+xml;charset=utf-8,…` → percent-encoded text (iwm.org.uk's
 *                                             hero wordmark; base64-decoding it
 *                                             yields garbage, not markup)
 *   - raw `<svg …>` markup passed straight through by css-converter.
 *
 * Exported for tests.
 */
export function decodeSvgDataUri(dataUri: string): string {
  // Raw SVG markup (not a data URI) — return as-is.
  // Used when css-converter passes svgMarkup directly from computedStyles.
  if (!dataUri.startsWith('data:')) {
    return dataUri;
  }
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex === -1) throw new Error("Invalid SVG data URI");

  const meta = dataUri.substring(0, commaIndex);
  const payload = dataUri.substring(commaIndex + 1);

  // Text payload: percent-encoded (or already plain) markup.
  if (!/;\s*base64/i.test(meta)) {
    try {
      return decodeURIComponent(payload);
    } catch {
      return payload;
    }
  }

  // Decode base64 to bytes, then bytes to UTF-8 string
  const bytes = base64ToBytes(payload);
  let str = "";
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  // Handle UTF-8 encoded characters
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

/** @deprecated internal alias kept for existing call sites. */
const svgDataUriToString = decodeSvgDataUri;

/**
 * Map CSS object-fit to a Figma ImagePaint scaleMode.
 * cover crops to fill (Figma FILL); contain letterboxes (Figma FIT);
 * none/scale-down show the image un-cropped, approximated with FIT;
 * fill (CSS default stretch) stays FILL — Figma cannot distort aspect
 * without an image transform, and FILL matches when aspect ratios agree.
 */
export function objectFitToScaleMode(objectFit?: string): "FILL" | "FIT" {
  switch (objectFit) {
    case "contain":
    case "none":
    case "scale-down":
      return "FIT";
    default:
      return "FILL";
  }
}

/**
 * Create a real image frame from base64 data
 *
 * For raster images (PNG, JPEG, WebP):
 *   figma.createImage(bytes) → IMAGE fill with scaleMode from object-fit
 *
 * For SVG:
 *   figma.createNodeFromSvg(string) → native SVG node
 *
 * On error: returns a fallback frame (no icon, just surface color)
 */
export async function createRealImage(
  node: WireframeNode,
  base64Data: string,
  context: RenderContext
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.fills = []; // Clear Figma default white fill
  frame.name = node.name || "Image";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));
  frame.clipsContent = true;

  // Border radius (per-corner — asymmetric CSS radii stay asymmetric)
  applyCornerRadii(frame, node.borderRadius, node.width, node.height);

  // Fixed sizing to prevent collapse in auto-layout
  frame.layoutMode = "NONE";

  try {
    // SVG handling
    if (isSvgDataUri(base64Data)) {
      const svgString = svgDataUriToString(base64Data);

      // Raster-masquerade SVG: Adobe Illustrator / "Save As SVG" exports that
      // wrap a base64 PNG/JPEG in an <image> tag with no real vector content.
      // figma.createNodeFromSvg produces a broken node for these; extract the
      // embedded raster and render as a regular image instead.
      if (isRasterMasqueradeSvg(svgString)) {
        const embedded = extractEmbeddedImageFromSvg(svgString);
        if (embedded) {
          // The outer `frame` (created above) is never used on this branch —
          // the inner recursion creates its own fresh frame. Remove ours
          // first to avoid leaking an orphan on figma.currentPage.
          try { frame.remove(); } catch { /* non-fatal */ }
          return await createRealImage(node, embedded, context);
        }
      }

      // Phase D (h2d-parity): if the icon library has a master for this
      // SVG, emit an INSTANCE instead of inlining markup. This dedups
      // repeated icons across the page (Apple nav: 1 search/bag/menu master,
      // many INSTANCE references) and matches h2d's `Component 3` pattern.
      const iconLib = context.iconLibrary;
      if (iconLib) {
        try {
          const { hashSvg } = await import("./svgLibrary");
          const hash = hashSvg(svgString);
          const master = iconLib.hashToComponent.get(hash);
          if (master) {
            const instance = master.createInstance();
            try {
              instance.resize(Math.max(node.width, 1), Math.max(node.height, 1));
            } catch {
              // Best-effort sizing.
            }
            frame.appendChild(instance);
            return frame;
          }
        } catch {
          // Fall through to inline render on any lookup failure.
        }
      }

      const svgNode = figma.createNodeFromSvg(svgString);
      svgNode.resize(Math.max(node.width, 1), Math.max(node.height, 1));
      frame.appendChild(svgNode);
      return frame;
    }

    // Try to create image directly — Figma supports PNG/JPEG/GIF.
    // If createImage() throws, the catch block creates a placeholder fallback.
    const bytes = dataUriToBytes(base64Data);
    const image = figma.createImage(bytes);

    // object-position on a cover image → CROP + imageTransform so the
    // author's focus point survives (FILL always center-crops).
    let scaleMode: "FILL" | "FIT" | "CROP" = objectFitToScaleMode(node.objectFit);
    let imageTransform: Transform | undefined;
    if (
      scaleMode === "FILL" &&
      node.objectPosition &&
      node.width > 0 &&
      node.height > 0
    ) {
      const size = parseImageSize(bytes);
      if (size) {
        const crop = computeCoverCropTransform(
          size.width,
          size.height,
          node.width,
          node.height,
          node.objectPosition.x,
          node.objectPosition.y
        );
        if (crop) {
          scaleMode = "CROP";
          imageTransform = crop as Transform;
        }
      }
    }

    frame.fills = [
      {
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode,
        ...(imageTransform ? { imageTransform } : {}),
        // CSS filter: grayscale(N) on the <img> → Figma saturation adjustment
        // (telex.ge brand logos render grayscale until hover).
        ...(typeof node.filterGrayscale === "number" && node.filterGrayscale > 0
          ? { filters: { saturation: -Math.min(1, node.filterGrayscale) } }
          : {}),
        visible: true,
        opacity: 1,
      } as ImagePaint,
    ];
  } catch (error) {
    // Fallback: empty frame with surface color
    logger.warn("Failed to create real image", { name: node.name, error });
    const { hexToFigmaRGB } = await import("./colors");
    const surfaceRgb = hexToFigmaRGB(context.pluginColors.surface);
    frame.fills = [
      {
        type: "SOLID",
        color: surfaceRgb,
        opacity: 0.6,
      },
    ];
  }

  return frame;
}
