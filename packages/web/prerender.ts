import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function prerender() {
  // Load the server entry built by Vite SSR build
  const { render, staticRoutes } = await import(
    "./dist/server/entry-server.js"
  );

  // Read the client HTML template
  const template = fs.readFileSync(
    path.resolve(__dirname, "dist/client/index.html"),
    "utf-8"
  );

  for (const route of staticRoutes) {
    const html = render(route);
    const page = template.replace(
      '<div id="root"></div>',
      `<div id="root">${html}</div>`
    );

    // Create directory structure: / → dist/client/index.html, /pricing → dist/client/pricing/index.html
    const outDir =
      route === "/"
        ? path.resolve(__dirname, "dist/client")
        : path.resolve(__dirname, `dist/client${route}`);

    fs.mkdirSync(outDir, { recursive: true });

    const outFile =
      route === "/"
        ? path.resolve(outDir, "index.html")
        : path.resolve(outDir, "index.html");

    fs.writeFileSync(outFile, page);
    console.log(`Pre-rendered: ${route} → ${path.relative(__dirname, outFile)}`);
  }

  console.log(`\nDone! ${staticRoutes.length} pages pre-rendered.`);
}

prerender().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});
