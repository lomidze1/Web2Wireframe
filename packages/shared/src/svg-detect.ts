/**
 * SVG detection utilities — pure, no I/O.
 * Used by content-script (browser-extension) and figma-plugin rendering.
 */

export function isSvgUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  if (lower.startsWith("data:image/svg")) return true;
  if (lower.startsWith("data:")) return false;
  const pathEnd = url.split(/[?#]/)[0];
  return pathEnd.toLowerCase().endsWith(".svg");
}

export function isSvgMime(mime: string | undefined | null): boolean {
  if (!mime || typeof mime !== "string") return false;
  return mime.trim().toLowerCase().split(";")[0] === "image/svg+xml";
}

export function isSvgMarkup(text: string | undefined | null): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<svg")) return true;
  if (trimmed.startsWith("<?xml")) {
    return /<svg[\s/>]/i.test(trimmed);
  }
  return false;
}
