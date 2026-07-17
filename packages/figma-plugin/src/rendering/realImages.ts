/**
 * Real image rendering for Figma
 * Creates IMAGE fills from base64 data instead of placeholder frames
 */

import type { WireframeNode, RenderContext } from "../types";
import { getBorderRadius } from "./layout";
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
 * Decode SVG data URI back to SVG string for figma.createNodeFromSvg()
 */
function svgDataUriToString(dataUri: string): string {
  // Raw SVG markup (not a data URI) — return as-is.
  // Used when css-converter passes svgMarkup directly from computedStyles.
  if (!dataUri.startsWith('data:')) {
    return dataUri;
  }
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex === -1) throw new Error("Invalid SVG data URI");

  // Decode base64 to bytes, then bytes to UTF-8 string
  const bytes = base64ToBytes(dataUri.substring(commaIndex + 1));
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

  // Border radius
  const cornerRadius = getBorderRadius(node.borderRadius);
  if (cornerRadius > 0) {
    frame.cornerRadius = Math.min(
      cornerRadius,
      Math.min(node.width, node.height) / 2
    );
  }

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

    frame.fills = [
      {
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode: objectFitToScaleMode(node.objectFit),
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
