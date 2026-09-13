// Renders each *.html in this folder to a 1600x900 PNG (2x) next to it.
import puppeteer from "puppeteer";
import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".html")).sort();

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });

for (const f of files) {
  await page.goto(pathToFileURL(join(here, f)).href, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  const out = join(here, f.replace(/\.html$/, ".png"));
  await page.screenshot({ path: out });
  console.log("rendered", f, "→", out.split("/").pop());
}
await browser.close();
