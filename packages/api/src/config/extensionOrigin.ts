/**
 * Browser-extension CORS origin check.
 *
 * The extension's popup/options pages send `Origin: chrome-extension://<id>`
 * on cross-origin fetches to the API (the background service worker sends no
 * Origin and is handled separately by the `!origin` branch in the CORS config).
 * We allow only our own published extension id, supplied via the `EXTENSION_ID`
 * env var, so arbitrary third-party extensions can't make credentialed CORS
 * requests to the plugin routes.
 */
const CHROME_EXTENSION_PREFIX = "chrome-extension://";

export function isAllowedExtensionOrigin(
  origin: string,
  allowedId: string,
): boolean {
  if (!allowedId) return false;
  if (!origin.startsWith(CHROME_EXTENSION_PREFIX)) return false;
  return origin.slice(CHROME_EXTENSION_PREFIX.length) === allowedId;
}
