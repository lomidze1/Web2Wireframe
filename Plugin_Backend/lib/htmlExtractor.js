const puppeteer = require("puppeteer");

// Maximum depth for DOM tree traversal
const MAX_DEPTH = 15;

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
 * Renders website and extracts wireframe data using Puppeteer
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
    await page.setViewport({ width: viewportWidth, height: 1080 });

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
    });

    // Extract tree
    const tree = await extractDOMTree(page, {
      textMode,
      colorMode,
      typographyMode,
      pluginColors,
      pluginFont,
      viewportWidth,
    });

    await browser.close();

    return { tree, pageHeight: dimensions.height, pageWidth: viewportWidth };
  } catch (error) {
    if (browser) await browser.close();
    console.error("Puppeteer error:", error);
    throw new Error(`Failed to render website: ${error.message}`);
  }
}

/**
 * Extract DOM tree with nested structure
 */
async function extractDOMTree(page, options) {
  // Pass MAX_DEPTH to browser context
  const maxDepth = MAX_DEPTH;

  return await page.evaluate((opts) => {
    const { textMode, colorMode, pluginColors, pluginFont, viewportWidth, maxDepth } = opts;

    let nodeId = 0;

    // Default colors
    const defaultColors = {
      main: "#1f3a5f",
      text: "#333333",
      accent: "#3b82f6",
      surface: "#f5f5f5",
      border: "#e0e0e0",
      background: "#ffffff",
    };
    const colors = { ...defaultColors, ...pluginColors };

    // Lorem generator
    const loremWords = ["Lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod", "tempor"];
    const generateLorem = (count) => {
      const result = [];
      for (let i = 0; i < Math.max(count, 2); i++) result.push(loremWords[i % loremWords.length]);
      result[0] = result[0].charAt(0).toUpperCase() + result[0].slice(1);
      return result.join(" ");
    };

    // Semantic placeholders
    const semantic = { h1: "Main Heading", h2: "Section Title", h3: "Subsection", h4: "Heading", p: "Paragraph text", a: "Link", button: "Button", span: "Text", li: "List Item", label: "Label" };

    // Parse color
    const parseColor = (c) => {
      if (!c || c === "rgba(0, 0, 0, 0)" || c === "transparent") return null;
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) return `#${parseInt(m[1]).toString(16).padStart(2, "0")}${parseInt(m[2]).toString(16).padStart(2, "0")}${parseInt(m[3]).toString(16).padStart(2, "0")}`;
      return c.startsWith("#") ? c : null;
    };

    // Get semantic name
    const getName = (el) => {
      const tag = el.tagName.toLowerCase();
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.substring(0, 40);
      const id = el.id;
      if (id && id.length < 25) return id.replace(/-/g, " ");
      const cls = el.className?.toString() || "";
      const patterns = [
        [/header/i, "Header"], [/nav/i, "Navigation"], [/footer/i, "Footer"],
        [/hero/i, "Hero"], [/card/i, "Card"], [/sidebar/i, "Sidebar"],
        [/menu/i, "Menu"], [/button/i, "Button"], [/banner/i, "Banner"],
        [/container/i, "Container"], [/content/i, "Content"], [/section/i, "Section"],
        [/form/i, "Form"], [/search/i, "Search"], [/logo/i, "Logo"],
        [/grid/i, "Grid"], [/list/i, "List"], [/item/i, "Item"],
      ];
      for (const [p, n] of patterns) if (p.test(cls)) return n;
      const tags = { header: "Header", nav: "Navigation", main: "Main", section: "Section", article: "Article", aside: "Sidebar", footer: "Footer", form: "Form", ul: "List", ol: "List", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", h4: "Heading 4", p: "Paragraph", img: "Image", video: "Video" };
      return tags[tag] || "Container";
    };

    // Detect layout - IMPROVED to properly handle grid layouts
    const getLayout = (s) => {
      // Flexbox detection
      if (s.display === "flex" || s.display === "inline-flex") {
        return (s.flexDirection === "column" || s.flexDirection === "column-reverse")
          ? "VERTICAL"
          : "HORIZONTAL";
      }

      // Grid detection - THE KEY FIX!
      if (s.display === "grid" || s.display === "inline-grid") {
        // Check grid-auto-flow for direction
        if (s.gridAutoFlow && s.gridAutoFlow.includes("column")) {
          return "HORIZONTAL";
        }

        // Check grid-template-columns for multiple columns
        const columns = s.gridTemplateColumns;
        if (columns && columns !== "none") {
          // Count column tracks (simplified - count space-separated values)
          const normalizedColumns = columns
            .replace(/repeat\s*\(\s*(\d+)\s*,/g, (_, count) => {
              return Array(parseInt(count)).fill("1fr").join(" ") + " ";
            })
            .trim();
          const columnCount = normalizedColumns.split(/\s+/).filter(v => v && v !== "none").length;
          if (columnCount > 1) {
            return "HORIZONTAL";
          }
        }

        // Default grid to vertical
        return "VERTICAL";
      }

      // Inline elements are typically horizontal
      if (s.display === "inline" || s.display === "inline-block") {
        return "HORIZONTAL";
      }

      return "NONE";
    };

    // Check if media - FIXED: removed SVG from media (preserve inline)
    const isMedia = (el) => {
      const tag = el.tagName.toLowerCase();
      // SVG removed from media list - we preserve SVG inline content
      if (["img", "video", "iframe", "picture", "canvas"].includes(tag)) return true;
      const s = window.getComputedStyle(el);
      if (s.backgroundImage && s.backgroundImage !== "none" && s.backgroundImage.includes("url(")) {
        const r = el.getBoundingClientRect();
        if (r.width > 60 && r.height > 60) return true;
      }
      return false;
    };

    // Get all text content (including nested) - FIXED: removed truncation
    const getAllText = (el) => {
      const text = el.textContent?.trim() || "";
      // Normalize whitespace (multiple spaces/newlines to single space)
      return text.replace(/\s+/g, ' ').trim();
    };

    // Get direct text only (immediate text nodes) - FIXED: removed truncation
    const getDirectText = (el) => {
      let t = "";
      for (const c of el.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) t += c.textContent.trim() + " ";
      }
      return t.trim();
    };

    // Check if element is a structural container that should be kept
    const isStructuralElement = (tag) => {
      return ["header", "nav", "main", "section", "article", "aside", "footer", "form", "div", "ul", "ol", "figure", "figcaption"].includes(tag);
    };

    // Check if element is visually significant (large enough to matter)
    const isSignificantSize = (w, h) => {
      return w >= 50 && h >= 20;
    };

    // Transform text
    const transformText = (text, tag) => {
      if (!text) return "";
      if (textMode === "lorem") return generateLorem(text.split(/\s+/).length);
      if (textMode === "semantic") return semantic[tag] || "Content";
      return text;
    };

    // Skip tags
    const skipTags = ["script", "style", "meta", "noscript", "link", "head", "title", "br", "base", "template"];

    // Process node recursively
    const processNode = (el, depth = 0) => {
      if (depth > maxDepth) return null;

      const tag = el.tagName?.toLowerCase();
      if (!tag || skipTags.includes(tag)) return null;

      const rect = el.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) return null;

      const s = window.getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return null;

      const x = Math.round(rect.x);
      const y = Math.round(rect.y + window.scrollY);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      const media = isMedia(el);
      let type = "frame";
      let textContent = "";

      // Handle text elements
      if (!media && ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "li", "label", "td", "th", "button", "strong", "em", "b", "i"].includes(tag)) {
        // First try direct text nodes
        let textToUse = getDirectText(el);

        // If no direct text, but element has no element children (leaf node), use all textContent
        if (!textToUse && el.children.length === 0) {
          textToUse = getAllText(el);
        }

        // If still no text but has inline children only (spans, strongs, etc), get all text
        if (!textToUse && el.children.length > 0) {
          const allInline = Array.from(el.children).every(child => {
            const childTag = child.tagName?.toLowerCase();
            return ["span", "strong", "em", "b", "i", "a", "small", "mark", "sub", "sup"].includes(childTag);
          });
          if (allInline) {
            textToUse = getAllText(el);
          }
        }

        if (textToUse) {
          type = "text";
          textContent = transformText(textToUse, tag);
        }
      }

      // Handle media
      if (media) {
        type = "placeholder";
      }

      // Colors - extract from computed styles
      const bgColor = parseColor(s.backgroundColor);
      const txtColor = parseColor(s.color);
      const brdColor = parseColor(s.borderColor);
      const shadowColor = parseColor(s.boxShadow); // Extract shadow color too

      let backgroundColor = null;
      let textColor = colors.text;
      let borderColor = null;

      if (colorMode === "website-colors") {
        // Website colors mode - preserve original colors exactly
        backgroundColor = bgColor;
        textColor = txtColor || "#333333"; // Fallback to dark text
        borderColor = brdColor;

        // For elements with no explicit bg but visible (like cards), try to detect
        if (!backgroundColor && s.backgroundImage && s.backgroundImage !== "none") {
          // Has gradient or image - use surface as placeholder
          backgroundColor = "#f0f0f0";
        }
      } else {
        // Plugin colors mode - map to wireframe palette
        const isButton = tag === "button" || el.getAttribute("role") === "button";
        const isLink = tag === "a" && el.getAttribute("href");
        const isInput = ["input", "textarea", "select"].includes(tag);
        const isCard = s.boxShadow && s.boxShadow !== "none";
        const hasVisibleBg = bgColor && bgColor !== colors.background;

        if (isButton || (isLink && hasVisibleBg)) {
          backgroundColor = colors.accent;
          textColor = "#ffffff";
        } else if (isInput) {
          backgroundColor = colors.background;
          borderColor = colors.border;
        } else if (isCard || hasVisibleBg) {
          backgroundColor = colors.surface;
        } else if (media) {
          backgroundColor = colors.surface;
        }

        if (brdColor) {
          borderColor = colors.border;
        }
      }

      // Font
      let fontFamily = pluginFont || "Montserrat";
      if (opts.typographyMode === "website-fonts") {
        fontFamily = s.fontFamily?.split(",")[0]?.replace(/['"]/g, "") || "Inter";
      }

      const node = {
        id: `n${nodeId++}`,
        name: getName(el),
        type,
        tag,
        x, y, width: w, height: h,
        layoutMode: getLayout(s),
        itemSpacing: parseInt(s.gap) || 0,
        padding: {
          top: parseInt(s.paddingTop) || 0,
          right: parseInt(s.paddingRight) || 0,
          bottom: parseInt(s.paddingBottom) || 0,
          left: parseInt(s.paddingLeft) || 0,
        },
        backgroundColor,
        textColor,
        borderColor,
        borderWidth: parseInt(s.borderWidth) || 0,
        borderRadius: parseInt(s.borderRadius) || 0,
        opacity: parseFloat(s.opacity) || 1,
        textContent,
        fontSize: parseInt(s.fontSize) || 14,
        fontWeight: parseInt(s.fontWeight) || 400,
        fontFamily,
        textAlign: s.textAlign || "left",
        isPlaceholder: media,
        children: [],
      };

      // Process children
      for (const child of el.children) {
        const childNode = processNode(child, depth + 1);
        if (childNode) {
          childNode.x = childNode.x - x;
          childNode.y = childNode.y - y;
          node.children.push(childNode);
        }
      }

      // Determine if node should be kept
      const hasVisual = backgroundColor || borderColor || textContent || media;
      const hasChildren = node.children.length > 0;
      const isStructural = isStructuralElement(tag);
      const isLargeEnough = isSignificantSize(w, h);

      // Keep node if:
      // 1. It has visual properties (background, border, text, media)
      // 2. It has children
      // 3. It's a structural element with significant size (even if transparent)
      if (!hasVisual && !hasChildren) {
        // Only filter out non-structural or tiny elements
        if (!isStructural || !isLargeEnough) {
          return null;
        }
      }

      return node;
    };

    // Root
    const body = document.body;
    const bodyRect = body.getBoundingClientRect();
    const bodyStyles = window.getComputedStyle(body);

    const root = {
      id: "root",
      name: "Page",
      type: "frame",
      tag: "body",
      x: 0,
      y: 0,
      width: viewportWidth,
      height: Math.round(bodyRect.height + window.scrollY),
      layoutMode: "NONE",
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: colorMode === "website-colors" ? (parseColor(bodyStyles.backgroundColor) || colors.background) : colors.background,
      textColor: colors.text,
      borderColor: null,
      borderWidth: 0,
      borderRadius: 0,
      opacity: 1,
      textContent: "",
      fontSize: 14,
      fontWeight: 400,
      fontFamily: pluginFont || "Montserrat",
      textAlign: "left",
      isPlaceholder: false,
      children: [],
    };

    for (const child of body.children) {
      const childNode = processNode(child, 1);
      if (childNode) root.children.push(childNode);
    }

    return root;
  }, { ...options, maxDepth });
}

/**
 * Create wireframe data for multiple viewports
 */
async function createWireframeData(url, viewports, options = {}) {
  const frames = [];

  for (const viewport of viewports) {
    try {
      console.log(`Processing viewport: ${viewport}px`);
      const { tree, pageHeight, pageWidth } = await renderWebsite(url, viewport, options);
      frames.push({ viewportWidth: pageWidth, viewportHeight: pageHeight, tree });
    } catch (error) {
      console.error(`Error processing viewport ${viewport}:`, error);
    }
  }

  return frames;
}

module.exports = { renderWebsite, extractDOMTree, createWireframeData };
