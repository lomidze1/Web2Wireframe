/**
 * S-C2: Generate `public/og-image.png` (1200×630) — the Open Graph preview
 * card every social-share renders. The audit (Phase 4) flagged this as a
 * Critical SEO issue because the referenced image did not exist, so every
 * Twitter / LinkedIn / Slack / Discord share rendered with a broken placeholder.
 *
 * Design rationale:
 *   - Dark background `#0c0d12` matches the site's `--text` brand color and
 *     gives high contrast for the wordmark.
 *   - White wordmark + accent-orange ".design" suffix mirrors how the brand
 *     is treated in the actual marketing pages.
 *   - Tagline reuses the audit-suggested copy: "Any website → editable Figma
 *     wireframes" — short enough to read at thumbnail size on social cards.
 *   - Subtle gradient accent stripe at the bottom uses the brand
 *     `--accent` (#3b82f6) → logo orange (#e94e1b) so the card looks like
 *     a product, not a wireframe shell.
 *
 * Reproducibility: rerun via `node packages/web/scripts/generate-og-image.mjs`
 * after editing the SVG template below. Sharp converts SVG → PNG locally
 * (no network, no third-party image hosts).
 */

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "og-image.png");

const WIDTH = 1200;
const HEIGHT = 630;

// Inline SVG — sharp renders it to PNG. Keep all fonts as web-safe sans-serif
// because rendering happens locally without web-font loading.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="60%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#e94e1b" />
    </linearGradient>
    <linearGradient id="brandBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c0d12" />
      <stop offset="100%" stop-color="#161821" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#brandBg)" />

  <!-- Decorative wireframe lines (subtle, top-right corner) -->
  <g stroke="rgba(255,255,255,0.06)" stroke-width="2" fill="none">
    <rect x="820" y="80" width="320" height="60" rx="6" />
    <rect x="820" y="160" width="200" height="40" rx="4" />
    <rect x="820" y="220" width="280" height="40" rx="4" />
    <rect x="820" y="290" width="180" height="120" rx="6" />
    <rect x="1020" y="290" width="120" height="58" rx="4" />
    <rect x="1020" y="362" width="120" height="48" rx="4" />
  </g>

  <!-- Wordmark -->
  <text
    x="80"
    y="290"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    font-size="96"
    font-weight="700"
    fill="#ffffff"
    letter-spacing="-3"
  >Web2Wireframe</text>

  <!-- Tagline -->
  <text
    x="80"
    y="370"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    font-size="40"
    font-weight="400"
    fill="rgba(255,255,255,0.78)"
  >Any website → editable Figma wireframes</text>

  <!-- Secondary line: positioning -->
  <text
    x="80"
    y="430"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    font-size="28"
    font-weight="400"
    fill="rgba(255,255,255,0.55)"
  >URL · Screenshot · HTML · Browser extension</text>

  <!-- Accent stripe at the bottom -->
  <rect x="0" y="${HEIGHT - 8}" width="${WIDTH}" height="8" fill="url(#accentBar)" />
</svg>
`;

const png = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, quality: 90 })
  .toBuffer();

await sharp(png).toFile(outPath);

const { size } = await import("node:fs").then((m) => m.promises.stat(outPath));
console.log(
  `✓ Wrote ${outPath} (${WIDTH}×${HEIGHT}, ${Math.round(size / 1024)} KB)`,
);
