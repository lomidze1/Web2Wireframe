const puppeteer = require("puppeteer");
const { extractDOMTreeWithCDP } = require("./cdp");

/**
 * Auto-scroll the page to trigger lazy-loaded content
 * Similar to how html.to.design captures full page content
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
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
 * Renders website and extracts wireframe data using Puppeteer + CDP
 *
 * KEY IMPROVEMENT: Uses Chrome DevTools Protocol (CDP) instead of getComputedStyle
 * This preserves:
 * - Gradients (linear-gradient, radial-gradient, etc.)
 * - CSS Variables (var(--name))
 * - Original CSS values (not computed approximations)
 */
async function renderWebsite(url, viewportWidth = 1440, options = {}) {
  const {
    textMode = "website",
    colorMode = "plugin-colors",
    typographyMode = "plugin-fonts",
    pluginColors = {},
    pluginFont = "Montserrat",
  } = options;

  let browser;
  try {
    // Find Chrome
    const possiblePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];

    let executablePath;
    for (const path of possiblePaths) {
      try {
        require("fs").accessSync(path);
        executablePath = path;
        break;
      } catch {
        // Path doesn't exist
      }
    }

    browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();

    // Set viewport — use fixed capture height (matching Browser Extension approach).
    // This ensures vh units and viewport-relative CSS are captured consistently.
    // DOMSnapshot.captureSnapshot captures the entire page regardless of viewport height.
    const captureHeight = 900;
    await page.setViewport({
      width: viewportWidth,
      height: captureHeight,
      deviceScaleFactor: 1,  // CSS pixel bounds; sub-pixel precision comes from computedStyles
    });

    // Navigate
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Full page scroll to trigger lazy-loaded content (like html.to.design)
    await autoScroll(page);

    // Wait for any triggered content to load
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Scrollbar compensation (matching Browser Extension approach):
    // Measure actual layout width and adjust viewport if scrollbar is present
    const actualLayoutWidth = await page.evaluate(() =>
      document.documentElement.clientWidth
    );
    const scrollbarWidth = viewportWidth - actualLayoutWidth;

    if (scrollbarWidth > 0) {
      await page.setViewport({
        width: viewportWidth + scrollbarWidth,
        height: captureHeight,
        deviceScaleFactor: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Hide scrollbar via CSS (matching Browser Extension approach)
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "__w2w_hide_scrollbar";
      style.textContent =
        "html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }";
      document.head.appendChild(style);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get dimensions after scroll (content may have expanded)
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    // NOTE: Do NOT resize viewport to full page height!
    // Keep viewport at captureHeight to match Browser Extension behavior.
    // DOMSnapshot captures the entire page content regardless of viewport height.
    // Resizing would break vh units (100vh = page height instead of 900px).

    // Extract tree using CDP (only viewportWidth is used by the extraction)
    const { tree, cssVariables } = await extractDOMTreeWithCDP(page, {
      viewportWidth,
    });

    await browser.close();

    return { tree, cssVariables, pageHeight: dimensions.height, pageWidth: viewportWidth };
  } catch (error) {
    if (browser) await browser.close();
    console.error("Puppeteer error:", error);
    throw new Error(`Failed to render website: ${error.message}`);
  }
}

/**
 * Legacy extractDOMTree function - kept for backward compatibility
 * Now delegates to CDP extraction
 * @deprecated Use extractDOMTreeWithCDP directly
 */
async function extractDOMTree(page, options) {
  const { tree } = await extractDOMTreeWithCDP(page, options);
  return tree;
}

/**
 * Create wireframe data for multiple viewports
 */
async function createWireframeData(url, viewports, options = {}) {
  const frames = [];
  let collectedCSSVariables = [];

  for (const viewport of viewports) {
    try {
      const { tree, cssVariables, pageHeight, pageWidth } = await renderWebsite(url, viewport, options);
      frames.push({ viewportWidth: pageWidth, viewportHeight: pageHeight, tree });
      // Take CSS variables from first viewport (same for all viewports)
      if (cssVariables && cssVariables.length > 0 && collectedCSSVariables.length === 0) {
        collectedCSSVariables = cssVariables;
      }
    } catch (error) {
      console.error(`Error processing viewport ${viewport}:`, error);
    }
  }

  return { frames, cssVariables: collectedCSSVariables };
}

/**
 * Assemble a full HTML document from user-provided HTML + CSS fragments.
 * If the HTML already contains <!DOCTYPE or <html, inject CSS into <head>.
 * Otherwise wrap the fragment in a minimal document shell.
 */
function buildFullPage(htmlCode, cssCode) {
  const hasFullDoc = /<!DOCTYPE|<html/i.test(htmlCode);
  if (hasFullDoc) {
    if (cssCode) {
      const styleTag = `<style>${cssCode}</style>`;
      if (/<head[^>]*>/i.test(htmlCode)) {
        return htmlCode.replace(/<head[^>]*>/i, `$&${styleTag}`);
      }
      // No <head> — insert before <body> or at start of <html>
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
 */
async function renderHTMLContent(htmlString, viewportWidth = 1440, options = {}) {
  let browser;
  try {
    // Find Chrome
    const possiblePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];

    let executablePath;
    for (const path of possiblePaths) {
      try {
        require("fs").accessSync(path);
        executablePath = path;
        break;
      } catch {
        // Path doesn't exist
      }
    }

    browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();

    // SSRF protection: block all external network requests
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const reqUrl = req.url();
      if (reqUrl.startsWith("data:") || reqUrl === "about:blank") {
        req.continue();
      } else {
        req.abort();
      }
    });

    // Set viewport
    const captureHeight = 900;
    await page.setViewport({
      width: viewportWidth,
      height: captureHeight,
      deviceScaleFactor: 1,
    });

    // Set content (instead of goto)
    await page.setContent(htmlString, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // No auto-scroll needed — user HTML is not lazy-loaded

    // Scrollbar compensation
    const actualLayoutWidth = await page.evaluate(() =>
      document.documentElement.clientWidth
    );
    const scrollbarWidth = viewportWidth - actualLayoutWidth;

    if (scrollbarWidth > 0) {
      await page.setViewport({
        width: viewportWidth + scrollbarWidth,
        height: captureHeight,
        deviceScaleFactor: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Hide scrollbar via CSS
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "__w2w_hide_scrollbar";
      style.textContent =
        "html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }";
      document.head.appendChild(style);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get dimensions
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    // Extract tree using CDP
    const { tree, cssVariables } = await extractDOMTreeWithCDP(page, {
      viewportWidth,
    });

    await browser.close();

    return { tree, cssVariables, pageHeight: dimensions.height, pageWidth: viewportWidth };
  } catch (error) {
    if (browser) await browser.close();
    console.error("HTML render error:", error);
    throw new Error(`Failed to render HTML content: ${error.message}`);
  }
}

/**
 * Create wireframe data from raw HTML for multiple viewports
 */
async function createWireframeDataFromHTML(htmlString, viewports, options = {}) {
  const frames = [];
  let collectedCSSVariables = [];

  for (const viewport of viewports) {
    try {
      const { tree, cssVariables, pageHeight, pageWidth } = await renderHTMLContent(htmlString, viewport, options);
      frames.push({ viewportWidth: pageWidth, viewportHeight: pageHeight, tree });
      if (cssVariables && cssVariables.length > 0 && collectedCSSVariables.length === 0) {
        collectedCSSVariables = cssVariables;
      }
    } catch (error) {
      console.error(`Error processing HTML viewport ${viewport}:`, error);
    }
  }

  return { frames, cssVariables: collectedCSSVariables };
}

module.exports = { renderWebsite, extractDOMTree, createWireframeData, buildFullPage, renderHTMLContent, createWireframeDataFromHTML };
