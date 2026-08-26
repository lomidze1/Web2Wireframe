import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEAD_MARKER_START = "<!--seo-head-->";
const HEAD_FALLBACK_TITLE = /<title>[\s\S]*?<\/title>/;
const HEAD_FALLBACK_DESCRIPTION = /<meta name="description"[\s\S]*?\/>/;
const HEAD_FALLBACK_CANONICAL = /<link rel="canonical"[\s\S]*?\/>/;

async function prerender() {
  // Load the server entry built by Vite SSR build
  const { render, staticRoutes } = await import(
    "./dist/server/entry-server.js"
  );
  // SEO config + render helpers are pure TS modules (no React imports) so we
  // load them directly from source via tsx — no need to bundle them via SSR.
  const { getSeoConfig } = await import("./src/seo/config.js");
  const { renderHead } = await import("./src/seo/render.js");
  const { buildSitemap } = await import("./src/seo/sitemap.js");

  // Read the client HTML template
  const template = fs.readFileSync(
    path.resolve(__dirname, "dist/client/index.html"),
    "utf-8",
  );

  for (const route of staticRoutes) {
    const html = render(route);
    const seo = getSeoConfig(route);
    const headHtml = renderHead(seo);

    let page = template.replace(
      '<div id="root"></div>',
      `<div id="root">${html}</div>`,
    );

    // Inject SEO head: replace fallback title/description/canonical from
    // index.html (which are static defaults) with the per-route values.
    page = page
      .replace(HEAD_FALLBACK_TITLE, "")
      .replace(HEAD_FALLBACK_DESCRIPTION, "")
      .replace(HEAD_FALLBACK_CANONICAL, "")
      .replace(HEAD_MARKER_START, `${HEAD_MARKER_START}\n    ${headHtml}`);

    // Create directory structure: / → dist/client/index.html, /pricing → dist/client/pricing/index.html
    const outDir =
      route === "/"
        ? path.resolve(__dirname, "dist/client")
        : path.resolve(__dirname, `dist/client${route}`);

    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.resolve(outDir, "index.html");

    fs.writeFileSync(outFile, page);
    process.stdout.write(
      `Pre-rendered: ${route} → ${path.relative(__dirname, outFile)}\n`,
    );
  }

  // Sitemap is generated from the same route list that drove the loop above,
  // so it can never list a URL we didn't prerender (or miss one we did).
  const lastmod = new Date().toISOString().slice(0, 10);
  const sitemapPath = path.resolve(__dirname, "dist/client/sitemap.xml");
  const sitemap = buildSitemap(staticRoutes, lastmod);
  fs.writeFileSync(sitemapPath, sitemap);

  const urlCount = (sitemap.match(/<loc>/g) ?? []).length;
  process.stdout.write(
    `Generated:     sitemap.xml → ${urlCount} URLs (lastmod ${lastmod})\n`,
  );

  process.stdout.write(`\nDone! ${staticRoutes.length} pages pre-rendered.\n`);
}

prerender().catch((err) => {
  process.stderr.write(`Prerender failed: ${err}\n`);
  process.exit(1);
});
