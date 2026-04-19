#!/usr/bin/env node
/**
 * Bundle browser-extension content script into a single IIFE string
 * for injection via Puppeteer's page.evaluate().
 *
 * Input:  packages/browser-extension/src/content/extractor.ts
 *         + visibility.ts, styles.ts (imported by extractor.ts)
 *
 * Output: packages/shared/dist/w2w-content-script.iife.js
 *
 * The bundle exposes:
 *   window.__w2w_extractPage()           — main DOM extraction
 *   window.__w2w_cleanupMarkers()        — remove data-w2w-idx attributes
 *   window.__w2w_extractSubtree()        — re-extract a subtree (hover states)
 *   window.__w2w_collectHoverSelectors() — parse document.styleSheets for :hover rules
 *
 * Usage:
 *   node scripts/bundle-content-script.mjs
 *   (automatically called during `pnpm build` via shared's build script)
 */

import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ENTRY = resolve(ROOT, "packages/browser-extension/src/content/extractor.ts");
const OUT_DIR = resolve(ROOT, "packages/shared/dist");
const OUT_FILE = resolve(OUT_DIR, "w2w-content-script.iife.js");

async function main() {
  // Bundle content script into IIFE
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    globalName: "__w2w_bundle",
    write: false,
    minify: false, // Keep readable for debugging
    target: "es2020",
    // Inline @w2w/shared — extractor.ts has value imports (e.g. shouldRenderPseudo)
    // that need to be bundled into the IIFE. Marking as external causes
    // "Cannot find module '@w2w/shared'" at Puppeteer page.evaluate() time.
    platform: "browser",
  });

  if (result.errors.length > 0) {
    console.error("esbuild errors:", result.errors);
    process.exit(1);
  }

  let code = result.outputFiles[0].text;

  // Append window exports so Puppeteer can call them
  code += `\n;
// Expose public API on window for page.evaluate() access
window.__w2w_extractPage = __w2w_bundle.extractPage;
window.__w2w_cleanupMarkers = __w2w_bundle.cleanupMarkers;
window.__w2w_extractSubtree = __w2w_bundle.extractSubtree;
window.__w2w_collectHoverSelectors = __w2w_bundle.collectHoverSelectors;
`;

  // Ensure output directory exists
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, code, "utf-8");

  const sizeKB = (Buffer.byteLength(code, "utf-8") / 1024).toFixed(1);
  console.log(`[bundle-content-script] ${OUT_FILE} (${sizeKB} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
