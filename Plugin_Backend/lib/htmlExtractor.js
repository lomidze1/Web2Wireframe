const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const {
  generateLoremIpsum,
  countWords,
  cleanText,
} = require("../utils/loremGenerator");
const { normalizeColor } = require("../utils/styleUtils");

async function renderWebsite(url, viewportWidth = 1440) {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

    // Get full page height
    const bodyHandle = await page.$("body");
    const { height } = await bodyHandle.boundingBox();
    await page.setViewport({
      width: viewportWidth,
      height: Math.ceil(height) + 100,
    });

    // Get HTML
    const html = await page.content();
    await browser.close();

    return html;
  } catch (error) {
    console.error("Puppeteer error:", error);
    throw new Error(`Failed to render website: ${error.message}`);
  }
}

async function extractWireframeElements(html, colorMode = "plugin-colors") {
  const $ = cheerio.load(html);
  const elements = [];
  let elementId = 0;

  // Remove script and style tags
  $("script, style, noscript, meta, link, head").remove();

  // Process main elements
  $("body *").each(function () {
    const $elem = $(this);
    const tag = this.name;

    // Skip certain elements
    if (["script", "style", "meta", "noscript", "link"].includes(tag)) {
      return;
    }

    // Get computed styles
    const styles = $elem.attr("style") || "";
    const computedStyle = parseInlineStyles(styles);

    // Get text content
    let textContent = cleanText($elem.text());

    // Skip if empty and no background color
    if (!textContent && !computedStyle.backgroundColor) {
      return;
    }

    // Limit text length for display
    if (textContent.length > 200) {
      textContent = textContent.substring(0, 200) + "...";
    }

    // Determine element type
    let elementType = "div";
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      elementType = "heading";
    } else if (["p", "span", "a", "li"].includes(tag)) {
      elementType = "text";
    } else if (["img"].includes(tag)) {
      elementType = "image";
      textContent = "Image";
    } else if (["video", "iframe"].includes(tag)) {
      elementType = "video";
      textContent = "Video";
    } else if (["i", "svg", "button"].includes(tag)) {
      if (tag === "button") elementType = "div";
      else {
        elementType = "icon";
        textContent = "Icon";
      }
    }

    // Create placeholder element
    const element = {
      id: elementId++,
      type: elementType,
      x: Math.random() * 50 + 20, // Placeholder positioning
      y: Math.random() * 50 + 20,
      width: 100,
      height: elementType === "image" || elementType === "video" ? 150 : 40,
      backgroundColor: computedStyle.backgroundColor || "#ffffff",
      textColor: computedStyle.color || "#333333",
      borderColor: computedStyle.borderColor || "transparent",
      borderWidth: computedStyle.borderWidth || 0,
      borderStyle: "solid",
      fontFamily: computedStyle.fontFamily || "Open Sans",
      fontSize: computedStyle.fontSize || 14,
      fontWeight: computedStyle.fontWeight || 400,
      textAlign: computedStyle.textAlign || "left",
      content: textContent || "Content",
      gradient: computedStyle.gradient || "",
      shadow: computedStyle.boxShadow || "",
      opacity: computedStyle.opacity !== null ? computedStyle.opacity : 1,
      borderRadius: computedStyle.borderRadius || 0,
    };

    elements.push(element);
  });

  return elements;
}

function parseInlineStyles(styleStr) {
  const styles = {
    backgroundColor: null,
    color: null,
    borderColor: null,
    borderWidth: 0,
    fontFamily: null,
    fontSize: 14,
    fontWeight: 400,
    textAlign: "left",
    opacity: 1,
    borderRadius: 0,
    boxShadow: "",
    gradient: "",
  };

  if (!styleStr) return styles;

  const declarations = styleStr.split(";");
  declarations.forEach((decl) => {
    const [prop, value] = decl.split(":").map((s) => s.trim());
    if (!prop || !value) return;

    switch (prop.toLowerCase()) {
      case "background-color":
        styles.backgroundColor = normalizeColor(value);
        break;
      case "color":
        styles.color = normalizeColor(value);
        break;
      case "border-color":
        styles.borderColor = normalizeColor(value);
        break;
      case "border-width":
        styles.borderWidth = parseInt(value) || 0;
        break;
      case "font-family":
        styles.fontFamily = value.replace(/['"]/g, "");
        break;
      case "font-size":
        styles.fontSize = parseInt(value) || 14;
        break;
      case "font-weight":
        styles.fontWeight = parseInt(value) || 400;
        break;
      case "text-align":
        styles.textAlign = value;
        break;
      case "opacity":
        styles.opacity = parseFloat(value) || 1;
        break;
      case "border-radius":
        styles.borderRadius = parseInt(value) || 0;
        break;
      case "box-shadow":
        styles.boxShadow = value;
        break;
      case "background":
        if (value.includes("gradient")) {
          styles.gradient = value;
        } else {
          styles.backgroundColor = normalizeColor(value);
        }
        break;
    }
  });

  return styles;
}

async function createWireframeData(
  url,
  viewports,
  colorMode = "plugin-colors"
) {
  const frames = [];

  for (const viewport of viewports) {
    try {
      const html = await renderWebsite(url, viewport);
      const elements = await extractWireframeElements(html, colorMode);

      frames.push({
        viewportWidth: viewport,
        viewportHeight: 1080,
        backgroundColor: "#ffffff",
        elements: elements,
      });
    } catch (error) {
      console.error(`Error processing viewport ${viewport}:`, error);
    }
  }

  return frames;
}

module.exports = {
  renderWebsite,
  extractWireframeElements,
  parseInlineStyles,
  createWireframeData,
};
