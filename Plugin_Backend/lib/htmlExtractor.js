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

    // Set exact viewport - critical for accurate bounds!
    await page.setViewport({
      width: viewportWidth,
      height: 1080,
      deviceScaleFactor: 1,  // Explicit: no zoom scaling
    });

    // Navigate
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Full page scroll to trigger lazy-loaded content (like html.to.design)
    await autoScroll(page);

    // Wait for any triggered content to load
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Get dimensions after scroll (content may have expanded)
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    await page.setViewport({
      width: viewportWidth,
      height: Math.min(dimensions.height, 15000),
      deviceScaleFactor: 1,  // Keep consistent scale
    });

    // Extract tree using CDP
    const { tree, cssVariables } = await extractDOMTreeWithCDP(page, {
      textMode,
      colorMode,
      typographyMode,
      pluginColors,
      pluginFont,
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

module.exports = { renderWebsite, extractDOMTree, createWireframeData };
