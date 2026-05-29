import type { SeoConfig } from "./types";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "./types";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderHead(config: SeoConfig): string {
  const ogTitle = config.ogTitle ?? config.title;
  const ogDescription = config.ogDescription ?? config.description;
  const ogImage = config.ogImage ?? DEFAULT_OG_IMAGE;
  const ogType = config.ogType ?? "website";
  const twitterCard = config.twitterCard ?? "summary_large_image";

  const tags: string[] = [
    `<title>${escapeAttribute(config.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(config.description)}" />`,
    `<link rel="canonical" href="${escapeAttribute(config.canonical)}" />`,
    `<meta property="og:site_name" content="${escapeAttribute(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeAttribute(ogTitle)}" />`,
    `<meta property="og:description" content="${escapeAttribute(ogDescription)}" />`,
    `<meta property="og:type" content="${escapeAttribute(ogType)}" />`,
    `<meta property="og:url" content="${escapeAttribute(config.canonical)}" />`,
    `<meta property="og:image" content="${escapeAttribute(ogImage)}" />`,
    // S-H4: explicit dimensions + alt let Facebook/LinkedIn skip the
    // re-download + crop step (faster previews) and provide screen-reader
    // text for accessibility. Width/height match the 1200×630 source asset.
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeAttribute(ogTitle)}" />`,
    `<meta name="twitter:card" content="${escapeAttribute(twitterCard)}" />`,
    `<meta name="twitter:title" content="${escapeAttribute(ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(ogDescription)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(ogImage)}" />`,
  ];

  if (config.noindex) {
    tags.push(`<meta name="robots" content="noindex, nofollow" />`);
  }

  if (config.jsonLd && config.jsonLd.length > 0) {
    for (const schema of config.jsonLd) {
      tags.push(
        `<script type="application/ld+json">${JSON.stringify(schema).replace(
          /</g,
          "\\u003c",
        )}</script>`,
      );
    }
  }

  return tags.join("\n    ");
}
