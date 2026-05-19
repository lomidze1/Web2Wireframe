/**
 * Centralized API base URL for ALL plugin → backend calls (payment, license,
 * import endpoints). This is the single place the address is defined.
 *
 * Figma plugins are built once and published — the runtime has no env vars,
 * so dev vs. production is one manual toggle:
 *
 *   USE_PRODUCTION = false → http://localhost:3002           (local dev + sandbox testing)
 *   USE_PRODUCTION = true  → https://api.web2wireframe.design (the build you publish)
 *
 * Workflow:
 *   • Local development / testing → keep USE_PRODUCTION = false.
 *   • Publishing to Figma Community → set true, `npm run build`, upload.
 *     Then set it back to false to keep developing locally.
 *
 * The published Community plugin and your local dev plugin are SEPARATE
 * instances in Figma. Flipping this toggle only affects your NEXT build —
 * it never changes the plugin already published on Community.
 *
 * The manifest's `networkAccess` whitelists both URLs, so either build works.
 */
const USE_PRODUCTION = false;

export const API_BASE_URL = USE_PRODUCTION
  ? "https://api.web2wireframe.design"
  : "http://localhost:3002";

/**
 * Append a `figmaUserId` query parameter to a URL, preserving any existing
 * query string. URL-encodes the id.
 */
export function withFigmaUserId(url: string, figmaUserId: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}figmaUserId=${encodeURIComponent(figmaUserId)}`;
}
