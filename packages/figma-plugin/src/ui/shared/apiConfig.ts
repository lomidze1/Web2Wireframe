/**
 * Centralized API base URL for all plugin → backend calls.
 *
 * The Figma plugin runtime does not natively support build-time env injection,
 * so this is a constant. Update before `npm run build` for production.
 *
 * Local dev:  http://localhost:3002
 * Production: https://api.web2wireframe.design
 *
 * The figma-plugin manifest's `networkAccess` whitelists both URLs, so the
 * plugin will load either at runtime — but only one is reachable per build.
 */
export const API_BASE_URL = "http://localhost:3002";

/**
 * Append a `figmaUserId` query parameter to a URL, preserving any existing
 * query string. URL-encodes the id.
 */
export function withFigmaUserId(url: string, figmaUserId: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}figmaUserId=${encodeURIComponent(figmaUserId)}`;
}
