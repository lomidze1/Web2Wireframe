/**
 * Content script bundle loader for Puppeteer injection.
 *
 * Reads the pre-built IIFE bundle from disk. The bundle contains
 * the browser-extension's DOM extraction logic (extractor.ts + visibility.ts + styles.ts)
 * and exposes:
 *   window.__w2w_extractPage()     — main DOM extraction
 *   window.__w2w_cleanupMarkers()  — remove data-w2w-idx markers
 *   window.__w2w_extractSubtree()  — re-extract a subtree (hover states)
 *
 * Built by: scripts/bundle-content-script.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _cachedBundle: string | null = null;

/**
 * Get the content script bundle as a JS string for page.evaluate().
 * The result is cached after first read.
 */
export function getContentScriptBundle(): string {
  if (_cachedBundle) return _cachedBundle;

  // In built output (dist/), the bundle is alongside the compiled JS
  // In source (src/), it's in ../dist/
  const paths = [
    resolve(__dirname, "w2w-content-script.iife.js"),         // dist/ (built)
    resolve(__dirname, "../dist/w2w-content-script.iife.js"), // src/ (dev with tsx)
  ];

  for (const p of paths) {
    try {
      _cachedBundle = readFileSync(p, "utf-8");
      return _cachedBundle;
    } catch {
      // Try next path
    }
  }

  throw new Error(
    "Content script bundle not found. Run `node scripts/bundle-content-script.mjs` or `pnpm build` in packages/shared."
  );
}
