const puppeteer = require("puppeteer");
const {
  generateLoremIpsum,
  countWords,
  cleanText,
} = require("../utils/loremGenerator");
const { normalizeColor } = require("../utils/styleUtils");

// Maximum elements to extract (performance limit)
const MAX_ELEMENTS = 500;

// Semantic placeholder text based on element type
const SEMANTIC_PLACEHOLDERS = {
  h1: "Main Heading",
  h2: "Section Title",
  h3: "Subsection",
  h4: "Minor Heading",
  h5: "Small Heading",
  h6: "Smallest Heading",
  p: "Body text paragraph content",
  a: "Link Text",
  button: "Button",
  span: "Text",
  li: "List Item",
  label: "Label",
};

/**
 * Renders website and extracts wireframe elements using Puppeteer
 * @param {string} url - Website URL to render
 * @param {number} viewportWidth - Viewport width for rendering
 * @param {string} textMode - Text mode: "website" | "lorem" | "semantic"
 * @param {string} pluginMainColor - Color for image/video placeholders
 * @returns {Promise<{elements: Array, pageHeight: number, pageWidth: number}>}
 */
async function renderWebsite(
  url,
  viewportWidth = 1440,
  textMode = "website",
  pluginMainColor = "#1f3a5f"
) {
  let browser;
  try {
    // Try to find Chrome on the system
    const possiblePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
      "/usr/bin/google-chrome", // Linux
      "/usr/bin/chromium-browser", // Linux Chromium
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Windows
    ];

    let executablePath;
    for (const path of possiblePaths) {
      try {
        require("fs").accessSync(path);
        executablePath = path;
        break;
      } catch {
        // Path doesn't exist, try next
      }
    }

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: executablePath, // Use system Chrome if found
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: viewportWidth,
      height: 1080,
    });

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get full page dimensions
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    // Set viewport to full page height for accurate positioning
    await page.setViewport({
      width: viewportWidth,
      height: Math.min(dimensions.height, 10000), // Cap at 10000 for memory
    });

    // Extract elements with proper positioning using page.evaluate()
    const elements = await extractElementsFromPage(
      page,
      textMode,
      pluginMainColor
    );

    await browser.close();

    return {
      elements: elements.slice(0, MAX_ELEMENTS),
      pageHeight: dimensions.height,
      pageWidth: viewportWidth,
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error("Puppeteer error:", error);
    throw new Error(`Failed to render website: ${error.message}`);
  }
}

/**
 * Extracts elements from rendered page using Puppeteer's evaluate()
 * This runs in the browser context and has access to actual DOM positions
 */
async function extractElementsFromPage(page, textMode, pluginMainColor) {
  return await page.evaluate(
    (textMode, pluginMainColor, semanticPlaceholders) => {
      const elements = [];
      let elementId = 0;

      // Helper: Generate lorem ipsum words
      const loremWords = [
        "lorem",
        "ipsum",
        "dolor",
        "sit",
        "amet",
        "consectetur",
        "adipiscing",
        "elit",
        "sed",
        "do",
        "eiusmod",
        "tempor",
        "incididunt",
        "ut",
        "labore",
      ];

      const generateLorem = (wordCount) => {
        const result = [];
        for (let i = 0; i < wordCount; i++) {
          result.push(loremWords[i % loremWords.length]);
        }
        if (result.length > 0) {
          result[0] = result[0].charAt(0).toUpperCase() + result[0].slice(1);
        }
        return result.join(" ");
      };

      // Helper: Parse color to hex
      const parseColor = (color) => {
        if (
          !color ||
          color === "rgba(0, 0, 0, 0)" ||
          color === "transparent"
        ) {
          return null;
        }
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          const r = parseInt(match[1]).toString(16).padStart(2, "0");
          const g = parseInt(match[2]).toString(16).padStart(2, "0");
          const b = parseInt(match[3]).toString(16).padStart(2, "0");
          return `#${r}${g}${b}`;
        }
        return color.startsWith("#") ? color : null;
      };

      // Get all visible elements in the body
      const allElements = document.body.querySelectorAll("*");

      allElements.forEach((elem) => {
        const tag = elem.tagName.toLowerCase();

        // Skip invisible and non-visual elements
        if (
          [
            "script",
            "style",
            "meta",
            "noscript",
            "link",
            "head",
            "title",
            "br",
            "hr",
            "base",
            "template",
          ].includes(tag)
        ) {
          return;
        }

        const rect = elem.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(elem);

        // Skip elements with no visible dimensions
        if (rect.width < 5 || rect.height < 5) return;

        // Skip hidden elements
        if (computedStyle.display === "none") return;
        if (computedStyle.visibility === "hidden") return;
        if (parseFloat(computedStyle.opacity) === 0) return;

        // Determine element type
        let elementType = "div";
        let content = "";
        let isMediaPlaceholder = false;

        if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
          elementType = "heading";
          content = elem.textContent?.trim().substring(0, 100) || "";
        } else if (["p", "span", "a", "li", "label", "td", "th"].includes(tag)) {
          elementType = "text";
          // Only get direct text, not from children
          const directText = Array.from(elem.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent.trim())
            .join(" ");
          content = directText.substring(0, 200) || "";
        } else if (tag === "img") {
          elementType = "image";
          content = "Image";
          isMediaPlaceholder = true;
        } else if (["video", "iframe"].includes(tag)) {
          elementType = "video";
          content = "Video";
          isMediaPlaceholder = true;
        } else if (tag === "svg" || elem.querySelector("svg")) {
          elementType = "icon";
          content = "Icon";
        } else if (
          tag === "button" ||
          elem.getAttribute("role") === "button"
        ) {
          elementType = "text";
          content = elem.textContent?.trim().substring(0, 50) || "Button";
        } else if (["input", "textarea", "select"].includes(tag)) {
          elementType = "div";
          content = elem.placeholder || elem.value || "";
        }

        // Apply text mode transformations (not for media placeholders)
        if (content && !isMediaPlaceholder) {
          if (textMode === "lorem") {
            const wordCount = Math.max(content.split(/\s+/).length, 2);
            content = generateLorem(wordCount);
          } else if (textMode === "semantic") {
            content = semanticPlaceholders[tag] || "Content Block";
          }
          // "website" mode keeps original content
        }

        // Parse colors
        let backgroundColor = parseColor(computedStyle.backgroundColor);
        const textColor = parseColor(computedStyle.color) || "#333333";
        const borderColor = parseColor(computedStyle.borderColor);

        // For images/videos, use plugin placeholder color
        if (isMediaPlaceholder) {
          backgroundColor = pluginMainColor;
        }

        // Skip elements with no visual representation (no bg, no border, no text)
        if (
          !backgroundColor &&
          !borderColor &&
          !content &&
          elementType === "div"
        ) {
          return;
        }

        elements.push({
          id: elementId++,
          type: elementType,
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY), // Account for scroll position
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          backgroundColor: backgroundColor || "transparent",
          textColor: textColor,
          borderColor: borderColor || "transparent",
          borderWidth: parseInt(computedStyle.borderWidth) || 0,
          borderRadius: parseInt(computedStyle.borderRadius) || 0,
          fontFamily:
            computedStyle.fontFamily?.split(",")[0]?.replace(/['"]/g, "") ||
            "Inter",
          fontSize: parseInt(computedStyle.fontSize) || 14,
          fontWeight: parseInt(computedStyle.fontWeight) || 400,
          textAlign: computedStyle.textAlign || "left",
          opacity: parseFloat(computedStyle.opacity) || 1,
          content: content || "",
          isMediaPlaceholder: isMediaPlaceholder,
        });
      });

      return elements;
    },
    textMode,
    pluginMainColor,
    SEMANTIC_PLACEHOLDERS
  );
}

/**
 * Creates wireframe data for multiple viewports
 * @param {string} url - Website URL
 * @param {number[]} viewports - Array of viewport widths
 * @param {string} colorMode - Color mode for styling
 * @param {string} textMode - Text mode: "website" | "lorem" | "semantic"
 * @param {string} pluginMainColor - Color for media placeholders
 * @returns {Promise<Array>} Array of frame objects
 */
async function createWireframeData(
  url,
  viewports,
  colorMode = "plugin-colors",
  textMode = "website",
  pluginMainColor = "#1f3a5f"
) {
  const frames = [];

  for (const viewport of viewports) {
    try {
      const { elements, pageHeight, pageWidth } = await renderWebsite(
        url,
        viewport,
        textMode,
        pluginMainColor
      );

      frames.push({
        viewportWidth: pageWidth,
        viewportHeight: pageHeight,
        backgroundColor: "#ffffff",
        elements: elements,
      });
    } catch (error) {
      console.error(`Error processing viewport ${viewport}:`, error);
      // Continue with other viewports even if one fails
    }
  }

  return frames;
}

module.exports = {
  renderWebsite,
  extractElementsFromPage,
  createWireframeData,
};
