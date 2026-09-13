/**
 * HTML Extractor — Puppeteer + CDP website rendering and wireframe extraction
 *
 * Provides two main flows:
 * 1. renderWebsite() — navigate to URL and extract DOM tree via CDP
 * 2. renderHTMLContent() — render raw HTML string with SSRF protection
 *
 * Both use shared-extraction viewport orchestration (Layer #1):
 * - Emulation.setDeviceMetricsOverride (not page.setViewport)
 * - prepareStabilization (event-based, not setTimeout)
 * - Page.getLayoutMetrics (not clientWidth eval)
 */

/* Browser globals used inside page.evaluate() callbacks (runs in Chromium, not Node) */
 
declare const document: { documentElement: { scrollHeight: number } };
declare const window: { scrollBy(x: number, y: number): void; scrollTo(x: number, y: number): void };
declare const localStorage: { setItem(key: string, value: string): void };
declare const sessionStorage: { setItem(key: string, value: string): void };

import { accessSync } from "node:fs";
import puppeteer, { type Browser, type Page, type HTTPRequest } from "puppeteer";
import type { Protocol } from "devtools-protocol";
import { extractDOMTreeWithCDP } from "./cdp/index.js";
import { orchestratePuppeteerViewport } from "./cdp/viewport-orchestration.js";
import { waitForNetworkSettled } from "./cdp/network-settle.js";
import { isPrivateHost, assertPublicUrl } from "../utils/urlValidation.js";
import type {
  ExtractedElement,
  ExtractedFont,
  ExtractedStylesheet,
  ExtractedCSSVariable,
  ViewportMetadata,
} from "@w2w/shared";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Cookie forwarded from Browser Extension (Layer #5: auth forwarding) */
interface ForwardedCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
}

/** Web storage replay from Browser Extension (Layer #5) */
interface WebStorage {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

/** Options shared by renderWebsite and renderHTMLContent */
interface RenderOptions {
  cookies?: ForwardedCookie[];
  webStorage?: WebStorage;
}

/** Result of rendering a single viewport */
interface RenderResult {
  tree: ExtractedElement;
  cssVariables: ExtractedCSSVariable[];
  fonts: ExtractedFont[];
  stylesheets: ExtractedStylesheet[];
  assets: Record<string, string>;
  pageHeight: number;
  pageWidth: number;
  viewportMetadata: ViewportMetadata;
}

/** Single frame inside wireframe data (one per viewport) */
interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: ExtractedElement;
  assets: Record<string, string>;
  viewportMetadata: ViewportMetadata;
}

/** Result of creating wireframe data across multiple viewports */
interface WireframeData {
  frames: WireframeFrame[];
  cssVariables: ExtractedCSSVariable[];
  fonts: ExtractedFont[];
  stylesheets: ExtractedStylesheet[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Auto-scroll the page to trigger lazy-loaded content.
 * Similar to how html.to.design captures full page content.
 */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400; // Scroll step
      const delay = 100; // Delay between scrolls

      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        // Stop when we've scrolled past the bottom
        if (totalHeight >= scrollHeight + 1000) {
          clearInterval(timer);
          // Scroll back to top
          window.scrollTo(0, 0);
          resolve();
        }
      }, delay);

      // Safety timeout - max 30 seconds of scrolling
      setTimeout(() => {
        clearInterval(timer);
        window.scrollTo(0, 0);
        resolve();
      }, 30000);
    });
  });
}

/**
 * Find Chrome executable path on the host machine.
 */
function findChromePath(): string | undefined {
  // Allow explicit override via env var (used in Docker)
  const envPath = process.env.CHROME_EXECUTABLE_PATH;
  if (envPath) {
    try {
      accessSync(envPath);
      return envPath;
    } catch {
      // Path set but not accessible
    }
  }

  const possiblePaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const p of possiblePaths) {
    try {
      accessSync(p);
      return p;
    } catch {
      // Path doesn't exist
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Core extraction functions
// ---------------------------------------------------------------------------

/**
 * Renders website and extracts wireframe data using Puppeteer + CDP.
 *
 * Uses shared-extraction viewport orchestration (Layer #1):
 * - Emulation.setDeviceMetricsOverride (not page.setViewport)
 * - prepareStabilization (event-based, not setTimeout)
 * - Page.getLayoutMetrics (not clientWidth eval)
 * - Returns viewportMetadata
 */
/**
 * In Docker, localhost/127.0.0.1 refers to the container itself.
 * Remap to host.docker.internal so Puppeteer can reach the host machine's dev servers.
 */
function remapLocalhostForDocker(inputUrl: string): string {
  // Never remap in production — localhost imports are rejected upstream.
  if (process.env.NODE_ENV === "production") return inputUrl;
  // Only remap when running inside Docker (host.docker.internal is resolvable)
  if (!process.env.MONGODB_URI?.includes("mongo:")) return inputUrl;
  try {
    const parsed = new URL(inputUrl);
    if (/^localhost$/i.test(parsed.hostname) || /^127\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      parsed.hostname = "host.docker.internal";
      return parsed.toString();
    }
  } catch { /* return original */ }
  return inputUrl;
}

/**
 * Install an SSRF request guard on a page that navigates to a user URL.
 * The initial URL is vetted by assertPublicUrl(); this guard additionally
 * aborts any redirect or subresource request to a private/internal host,
 * so a public page cannot pull data from loopback/metadata addresses.
 */
async function installNavigationSsrfGuard(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (req: HTTPRequest) => {
    const reqUrl = req.url();
    if (reqUrl.startsWith("data:") || reqUrl === "about:blank") {
      void req.continue();
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(reqUrl);
    } catch {
      void req.abort();
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      void req.abort();
      return;
    }
    // Dev-only: localhost imports are remapped to the Docker host.
    if (
      process.env.NODE_ENV !== "production" &&
      parsed.hostname === "host.docker.internal"
    ) {
      void req.continue();
      return;
    }
    if (isPrivateHost(parsed.hostname)) {
      void req.abort();
      return;
    }
    void req.continue();
  });
}

export async function renderWebsite(
  url: string,
  viewportWidth: number = 1440,
  options: RenderOptions = {},
): Promise<RenderResult> {
  await assertPublicUrl(url);
  let browser: Browser | undefined;
  const effectiveUrl = remapLocalhostForDocker(url);
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: findChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();
    await installNavigationSsrfGuard(page);

    // Inject cookies if provided (Layer #5: auth forwarding from Browser Extension)
    if (options.cookies && Array.isArray(options.cookies) && options.cookies.length > 0) {
      const puppeteerCookies: Protocol.Network.CookieParam[] = options.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        secure: c.secure || false,
        httpOnly: c.httpOnly || false,
        ...(c.expirationDate ? { expires: c.expirationDate } : {}),
      }));
      await page.setCookie(...puppeteerCookies);
    }

    // Inject webStorage if provided (Layer #5: storage replay from Browser Extension)
    if (options.webStorage) {
      const hasLocal =
        options.webStorage.localStorage != null &&
        Object.keys(options.webStorage.localStorage).length > 0;
      const hasSession =
        options.webStorage.sessionStorage != null &&
        Object.keys(options.webStorage.sessionStorage).length > 0;

      if (hasLocal || hasSession) {
        await page.evaluateOnNewDocument((ws: WebStorage) => {
          if (ws.localStorage) {
            for (const [k, v] of Object.entries(ws.localStorage)) {
              try {
                localStorage.setItem(k, v);
              } catch {
                /* ignore */
              }
            }
          }
          if (ws.sessionStorage) {
            for (const [k, v] of Object.entries(ws.sessionStorage)) {
              try {
                sessionStorage.setItem(k, v);
              } catch {
                /* ignore */
              }
            }
          }
        }, options.webStorage);
      }
    }

    // Viewport orchestration via CDP (Layer #1):
    // Sets viewport -> registers stabilization listeners -> navigates ->
    // stabilizes -> auto-scrolls -> measures layout -> compensates scrollbar ->
    // hides scrollbar -> captures final metrics
    const { viewportMetadata, cleanup } = await orchestratePuppeteerViewport(page, viewportWidth, {
      navigationFn: async () => {
        await page.goto(effectiveUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        const settle = await waitForNetworkSettled(page);
        console.log(
          `[W2W] network settled: ${settle.reason} ${settle.waitedMs}ms stuck=${settle.stuck}`,
        );
      },
      autoScrollFn: async () => {
        await autoScroll(page);
      },
    });

    // Extract tree using CDP (viewport still set, scrollbar hidden)
    const { tree, cssVariables, fonts, stylesheets, assets } = await extractDOMTreeWithCDP(page, {
      viewportWidth,
    });

    // Cleanup viewport override
    await cleanup();

    await browser.close();

    return {
      tree,
      cssVariables,
      fonts,
      stylesheets,
      assets,
      pageHeight: viewportMetadata.contentHeight,
      pageWidth: viewportWidth,
      viewportMetadata,
    };
  } catch (error) {
    if (browser) await browser.close();
    const message = error instanceof Error ? error.message : String(error);
    console.error("Puppeteer error:", error);
    throw new Error(`Failed to render website: ${message}`);
  }
}

/**
 * Legacy extractDOMTree function - kept for backward compatibility.
 * Now delegates to CDP extraction.
 * @deprecated Use extractDOMTreeWithCDP directly
 */
export async function extractDOMTree(
  page: Page,
  options: { viewportWidth?: number } = {},
): Promise<ExtractedElement> {
  const { tree } = await extractDOMTreeWithCDP(page, options);
  return tree;
}

/**
 * Create wireframe data for multiple viewports.
 */
export async function createWireframeData(
  url: string,
  viewports: number[],
  options: RenderOptions = {},
): Promise<WireframeData> {
  const frames: WireframeFrame[] = [];
  let collectedCSSVariables: ExtractedCSSVariable[] = [];
  let collectedFonts: ExtractedFont[] = [];
  let collectedStylesheets: ExtractedStylesheet[] = [];

  for (const viewport of viewports) {
    try {
      const { tree, cssVariables, fonts, stylesheets, assets, pageHeight, pageWidth, viewportMetadata } =
        await renderWebsite(url, viewport, options);

      frames.push({
        viewportWidth: pageWidth,
        viewportHeight: pageHeight,
        tree,
        assets: assets || {},
        viewportMetadata,
      });

      // Take CSS variables, fonts, and stylesheets from first viewport (same for all viewports)
      if (cssVariables && cssVariables.length > 0 && collectedCSSVariables.length === 0) {
        collectedCSSVariables = cssVariables;
      }
      if (fonts && fonts.length > 0 && collectedFonts.length === 0) {
        collectedFonts = fonts;
      }
      if (stylesheets && stylesheets.length > 0 && collectedStylesheets.length === 0) {
        collectedStylesheets = stylesheets;
      }
    } catch (error) {
      console.error(`Error processing viewport ${viewport}:`, error);
    }
  }

  return {
    frames,
    cssVariables: collectedCSSVariables,
    fonts: collectedFonts,
    stylesheets: collectedStylesheets,
  };
}

// ---------------------------------------------------------------------------
// W2W Content Script extraction (unified pipeline)
// ---------------------------------------------------------------------------

import {
  extractWithContentScript,
  collectFontResponses,
  emulateReducedMotion,
  type W2WExtractionResult,
} from "./cdp/w2w-extraction.js";
import { perfMark } from "../utils/stageTimer.js";
import type { W2WFrameNode, W2WAssetEntry, W2WCSSVariable, W2WFontEntry } from "@w2w/shared";

/** Single frame in W2W format (one per viewport) */
interface W2WWireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: W2WFrameNode;
  assets: Record<string, W2WAssetEntry>;
}

/** Result of W2W wireframe data across multiple viewports */
interface W2WWireframeData {
  frames: W2WWireframeFrame[];
  cssVariables: W2WCSSVariable[];
  fonts: W2WFontEntry[];
}

/**
 * Render website using content script extraction (W2W pipeline).
 * Same content script as Browser Extension → pixel-identical output.
 */
export async function renderWebsiteW2W(
  url: string,
  viewportWidth: number = 1440,
  options: RenderOptions = {},
): Promise<W2WExtractionResult> {
  await assertPublicUrl(url);
  let browser: Browser | undefined;
  const effectiveUrl = remapLocalhostForDocker(url);
  let t = Date.now();
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: findChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    t = perfMark("launch", t);

    const page = await browser.newPage();
    await installNavigationSsrfGuard(page);
    // Before the first navigation: a site reads `matchMedia` when it boots.
    await emulateReducedMotion(page);
    t = perfMark("newPage+ssrfGuard", t);

    // Inject cookies if provided
    if (options.cookies && Array.isArray(options.cookies) && options.cookies.length > 0) {
      const puppeteerCookies: Protocol.Network.CookieParam[] = options.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        secure: c.secure || false,
        httpOnly: c.httpOnly || false,
        ...(c.expirationDate ? { expires: c.expirationDate } : {}),
      }));
      await page.setCookie(...puppeteerCookies);
    }

    // Inject webStorage if provided
    if (options.webStorage) {
      const hasLocal = options.webStorage.localStorage != null &&
        Object.keys(options.webStorage.localStorage).length > 0;
      const hasSession = options.webStorage.sessionStorage != null &&
        Object.keys(options.webStorage.sessionStorage).length > 0;

      if (hasLocal || hasSession) {
        await page.evaluateOnNewDocument((ws: WebStorage) => {
          if (ws.localStorage) {
            for (const [k, v] of Object.entries(ws.localStorage)) {
              try { localStorage.setItem(k, v); } catch { /* ignore */ }
            }
          }
          if (ws.sessionStorage) {
            for (const [k, v] of Object.entries(ws.sessionStorage)) {
              try { sessionStorage.setItem(k, v); } catch { /* ignore */ }
            }
          }
        }, options.webStorage);
      }
    }

    // Capture font bytes from the FIRST load. Historically the collector was
    // attached inside extractWithContentScript — i.e. after this navigation —
    // so a cache-busting `Page.reload` was needed to make the fonts come down
    // again where the listener could see them. That second full download cost
    // 7.7s of a 45.6s stripe.com capture. Attaching here removes the need.
    const fontCollector = collectFontResponses(page);

    // Size the viewport BEFORE navigating, so the first (and now only) load
    // renders at the target width: media queries, `srcset`/`sizes` picks and
    // lazy-loading thresholds all resolve for the viewport we actually want.
    // extractWithContentScript re-applies the authoritative CDP override
    // (with the deviceScaleFactor correction) once the page is up.
    await page.setViewport({ width: viewportWidth, height: 900 });

    // Navigate to URL
    await page.goto(effectiveUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    t = perfMark("goto", t);
    const settle = await waitForNetworkSettled(page);
    console.log(
      `[W2W] network settled: ${settle.reason} ${settle.waitedMs}ms stuck=${settle.stuck}`,
    );

    t = perfMark("settle#1", t);

    // Extract using content script (handles viewport, scroll, extraction, assets, fonts).
    // Handing over the collector's map both seeds the already-captured fonts
    // and tells extraction the reload is unnecessary.
    const result = await extractWithContentScript(page, {
      viewportWidth,
      prefetchedFonts: fontCollector.buffers,
    });
    t = perfMark("extractWithContentScript(TOTAL)", t);

    fontCollector.detach();
    await browser.close();
    perfMark("browser.close", t);
    return result;
  } catch (error) {
    if (browser) await browser.close();
    const message = error instanceof Error ? error.message : String(error);
    console.error("Puppeteer W2W error:", error);
    throw new Error(`Failed to render website (W2W): ${message}`);
  }
}

/**
 * Create W2W wireframe data for multiple viewports.
 * Uses content script extraction — unified pipeline.
 */
export async function createWireframeDataW2W(
  url: string,
  viewports: number[],
  options: RenderOptions = {},
): Promise<W2WWireframeData> {
  const frames: W2WWireframeFrame[] = [];
  let collectedCSSVariables: W2WCSSVariable[] = [];
  let collectedFonts: W2WFontEntry[] = [];

  for (const viewport of viewports) {
    try {
      const result = await renderWebsiteW2W(url, viewport, options);

      frames.push({
        viewportWidth: result.width,
        viewportHeight: result.doc.innerHeight,
        tree: result.frame,
        assets: result.assets || {},
      });

      // Collect CSS variables and fonts from first viewport
      if (result.cssVariables.length > 0 && collectedCSSVariables.length === 0) {
        collectedCSSVariables = result.cssVariables;
      }
      if (result.fonts.length > 0 && collectedFonts.length === 0) {
        collectedFonts = result.fonts;
      }
    } catch (error) {
      console.error(`Error processing viewport ${viewport} (W2W):`, error);
    }
  }

  return {
    frames,
    cssVariables: collectedCSSVariables,
    fonts: collectedFonts,
  };
}

/**
 * Render raw HTML content using content script extraction (W2W pipeline).
 * Uses page.setContent() with SSRF protection.
 */
export async function renderHTMLContentW2W(
  htmlString: string,
  viewportWidth: number = 1440,
): Promise<W2WExtractionResult> {
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: findChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();
    // Before setContent: a site reads `matchMedia` when it boots.
    await emulateReducedMotion(page);

    // SSRF protection: same as renderHTMLContent
    const ALLOWED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
      "stylesheet", "font", "image", "media",
    ]);
    await page.setRequestInterception(true);
    page.on("request", (req: HTTPRequest) => {
      const reqUrl = req.url();
      if (reqUrl.startsWith("data:") || reqUrl === "about:blank") {
        void req.continue();
        return;
      }
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        void req.abort();
        return;
      }
      let parsed: URL;
      try { parsed = new URL(reqUrl); } catch { void req.abort(); return; }
      if (isPrivateHost(parsed.hostname)) { void req.abort(); return; }
      if (
        parsed.protocol !== "https:" &&
        !/^(?:localhost|127\.\d+\.\d+\.\d+)$/i.test(parsed.hostname)
      ) {
        void req.abort();
        return;
      }
      if (!ALLOWED_RESOURCE_TYPES.has(req.resourceType())) {
        void req.abort();
        return;
      }
      void req.continue();
    });

    // Set HTML content
    await page.setContent(htmlString, { waitUntil: "domcontentloaded", timeout: 30000 });
    const settle = await waitForNetworkSettled(page);
    console.log(
      `[W2W] network settled: ${settle.reason} ${settle.waitedMs}ms stuck=${settle.stuck}`,
    );

    // Extract using content script. skipReload: the document was injected via
    // page.setContent() (URL stays about:blank); reloading would wipe it and
    // leave an empty body.
    const result = await extractWithContentScript(page, { viewportWidth, skipReload: true });

    await browser.close();
    return result;
  } catch (error) {
    if (browser) await browser.close();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to render HTML (W2W): ${message}`);
  }
}

/**
 * Create W2W wireframe data from raw HTML+CSS for multiple viewports.
 */
export async function createWireframeDataFromHTMLW2W(
  htmlCode: string,
  cssCode: string | undefined,
  viewports: number[],
): Promise<W2WWireframeData> {
  const fullHTML = buildFullPage(htmlCode, cssCode);
  const frames: W2WWireframeFrame[] = [];
  let collectedCSSVariables: W2WCSSVariable[] = [];
  let collectedFonts: W2WFontEntry[] = [];

  for (const viewport of viewports) {
    try {
      const result = await renderHTMLContentW2W(fullHTML, viewport);

      frames.push({
        viewportWidth: result.width,
        viewportHeight: result.doc.innerHeight,
        tree: result.frame,
        assets: result.assets || {},
      });

      if (result.cssVariables.length > 0 && collectedCSSVariables.length === 0) {
        collectedCSSVariables = result.cssVariables;
      }
      if (result.fonts.length > 0 && collectedFonts.length === 0) {
        collectedFonts = result.fonts;
      }
    } catch (error) {
      console.error(`Error processing viewport ${viewport} (W2W HTML):`, error);
    }
  }

  return {
    frames,
    cssVariables: collectedCSSVariables,
    fonts: collectedFonts,
  };
}

// ---------------------------------------------------------------------------
// HTML content rendering (raw HTML input with SSRF protection)
// ---------------------------------------------------------------------------

/**
 * Assemble a full HTML document from user-provided HTML + CSS fragments.
 * If the HTML already contains <!DOCTYPE or <html, inject CSS into <head>.
 * Otherwise wrap the fragment in a minimal document shell.
 */
export function buildFullPage(htmlCode: string, cssCode: string | undefined): string {
  const hasFullDoc = /<!DOCTYPE|<html/i.test(htmlCode);
  if (hasFullDoc) {
    if (cssCode) {
      const styleTag = `<style>${cssCode}</style>`;
      if (/<head[^>]*>/i.test(htmlCode)) {
        return htmlCode.replace(/<head[^>]*>/i, `$&${styleTag}`);
      }
      // No <head> -- insert before <body> or at start of <html>
      if (/<body[^>]*>/i.test(htmlCode)) {
        return htmlCode.replace(/<body[^>]*>/i, `<head>${styleTag}</head>$&`);
      }
    }
    return htmlCode;
  }
  // Wrap fragment
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${cssCode ? `<style>${cssCode}</style>` : ""}</head><body>${htmlCode}</body></html>`;
}

/**
 * Renders raw HTML content and extracts wireframe data using Puppeteer + CDP.
 * Similar to renderWebsite() but uses page.setContent() instead of page.goto(),
 * blocks external requests (SSRF protection), and skips auto-scroll.
 *
 * Uses shared-extraction viewport orchestration (Layer #1).
 */
export async function renderHTMLContent(
  htmlString: string,
  viewportWidth: number = 1440,
  _options: RenderOptions = {},
): Promise<RenderResult> {
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: findChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();

    // SSRF protection: allow safe external subresources, block dangerous requests
    const ALLOWED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
      "stylesheet",
      "font",
      "image",
      "media",
    ]);
    await page.setRequestInterception(true);
    page.on("request", (req: HTTPRequest) => {
      const reqUrl = req.url();

      // Always allow data: URIs and about:blank
      if (reqUrl.startsWith("data:") || reqUrl === "about:blank") {
        void req.continue();
        return;
      }

      // Block main-frame navigation (prevent the HTML from redirecting)
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        void req.abort();
        return;
      }

      // Parse URL -- block unparseable
      let parsed: URL;
      try {
        parsed = new URL(reqUrl);
      } catch {
        void req.abort();
        return;
      }

      // Block private/internal hosts (SSRF protection)
      if (isPrivateHost(parsed.hostname)) {
        void req.abort();
        return;
      }

      // Only allow HTTPS for public hosts (localhost/127.x.x.x can use HTTP)
      const isLoopback = /^localhost$/i.test(parsed.hostname) || /^127\.\d+\.\d+\.\d+$/.test(parsed.hostname);
      if (parsed.protocol !== "https:" && !isLoopback) {
        void req.abort();
        return;
      }

      // Only allow safe resource types (no scripts, XHR, fetch, websocket)
      if (!ALLOWED_RESOURCE_TYPES.has(req.resourceType())) {
        void req.abort();
        return;
      }

      void req.continue();
    });

    // Viewport orchestration via CDP (Layer #1):
    // No auto-scroll needed for user-provided HTML (not lazy-loaded)
    const { viewportMetadata, cleanup } = await orchestratePuppeteerViewport(page, viewportWidth, {
      navigationFn: async () => {
        await page.setContent(htmlString, { waitUntil: "domcontentloaded", timeout: 30000 });
        const settle = await waitForNetworkSettled(page);
        console.log(
          `[W2W] network settled: ${settle.reason} ${settle.waitedMs}ms stuck=${settle.stuck}`,
        );
      },
      // No autoScrollFn -- user HTML is not lazy-loaded
    });

    // Extract tree using CDP (viewport still set, scrollbar hidden)
    const { tree, cssVariables, fonts, stylesheets, assets } = await extractDOMTreeWithCDP(page, {
      viewportWidth,
    });

    // Cleanup viewport override
    await cleanup();

    await browser.close();

    return {
      tree,
      cssVariables,
      fonts,
      stylesheets,
      assets,
      pageHeight: viewportMetadata.contentHeight,
      pageWidth: viewportWidth,
      viewportMetadata,
    };
  } catch (error) {
    if (browser) await browser.close();
    const message = error instanceof Error ? error.message : String(error);
    console.error("HTML render error:", error);
    throw new Error(`Failed to render HTML content: ${message}`);
  }
}

/**
 * Create wireframe data from raw HTML for multiple viewports.
 */
export async function createWireframeDataFromHTML(
  htmlString: string,
  viewports: number[],
  options: RenderOptions = {},
): Promise<WireframeData> {
  const frames: WireframeFrame[] = [];
  let collectedCSSVariables: ExtractedCSSVariable[] = [];
  let collectedFonts: ExtractedFont[] = [];
  let collectedStylesheets: ExtractedStylesheet[] = [];

  for (const viewport of viewports) {
    try {
      const { tree, cssVariables, fonts, stylesheets, assets, pageHeight, pageWidth, viewportMetadata } =
        await renderHTMLContent(htmlString, viewport, options);

      frames.push({
        viewportWidth: pageWidth,
        viewportHeight: pageHeight,
        tree,
        assets: assets || {},
        viewportMetadata,
      });

      if (cssVariables && cssVariables.length > 0 && collectedCSSVariables.length === 0) {
        collectedCSSVariables = cssVariables;
      }
      if (fonts && fonts.length > 0 && collectedFonts.length === 0) {
        collectedFonts = fonts;
      }
      if (stylesheets && stylesheets.length > 0 && collectedStylesheets.length === 0) {
        collectedStylesheets = stylesheets;
      }
    } catch (error) {
      console.error(`Error processing HTML viewport ${viewport}:`, error);
    }
  }

  return {
    frames,
    cssVariables: collectedCSSVariables,
    fonts: collectedFonts,
    stylesheets: collectedStylesheets,
  };
}
