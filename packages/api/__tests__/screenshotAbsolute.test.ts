import { describe, it, expect } from "vitest";
import {
  SCREENSHOT_ABSOLUTE_PROMPT,
  buildScreenshotAbsoluteUserPrompt,
  validateAbsoluteFormat,
  postProcessAbsoluteResult,
  VALID_ELEMENT_TYPES,
} from "../src/lib/aiGenerator.js";
import {
  convertAbsoluteToWireframeTree,
} from "../src/lib/wireframeConverter.js";

// ============================================================================
// SCREENSHOT_ABSOLUTE_PROMPT content checks
// ============================================================================

describe("SCREENSHOT_ABSOLUTE_PROMPT", () => {
  it("should contain bounding box fields (x, y, width, height)", () => {
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain('"x"');
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain('"y"');
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain('"width"');
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain('"height"');
  });

  it("should document section-bg element type", () => {
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("section-bg");
  });

  it("should instruct page-relative coordinates", () => {
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toMatch(/page-relative|top-left/i);
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("0, 0");
  });
});

// ============================================================================
// buildScreenshotAbsoluteUserPrompt
// ============================================================================

describe("buildScreenshotAbsoluteUserPrompt", () => {
  it("should include bounding box estimation instructions", () => {
    const prompt = buildScreenshotAbsoluteUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 3000,
      textMode: "website",
    });

    expect(prompt).toMatch(/bounding box|position|x.*y.*width.*height/i);
  });

  it("should handle textMode variations (website/lorem/semantic)", () => {
    const websitePrompt = buildScreenshotAbsoluteUserPrompt({
      viewportWidth: 1440, imageWidth: 1440, imageHeight: 3000, textMode: "website",
    });
    expect(websitePrompt).toMatch(/preserve|actual|visible/i);

    const loremPrompt = buildScreenshotAbsoluteUserPrompt({
      viewportWidth: 1440, imageWidth: 1440, imageHeight: 3000, textMode: "lorem",
    });
    expect(loremPrompt).toMatch(/lorem/i);

    const semanticPrompt = buildScreenshotAbsoluteUserPrompt({
      viewportWidth: 1440, imageWidth: 1440, imageHeight: 3000, textMode: "semantic",
    });
    expect(semanticPrompt).toMatch(/semantic|label/i);
  });

  it("should include imageHeight for proportional calculation", () => {
    const prompt = buildScreenshotAbsoluteUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 5000,
      textMode: "website",
    });
    expect(prompt).toContain("5000");
  });
});

// ============================================================================
// validateAbsoluteFormat
// ============================================================================

describe("validateAbsoluteFormat", () => {
  it("should pass valid absolute format", () => {
    const result = validateAbsoluteFormat({
      pageWidth: 1440,
      pageHeight: 3000,
      elements: [
        { type: "heading", text: "Hello", x: 100, y: 100, width: 400, height: 56 },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail on missing elements array", () => {
    const result = validateAbsoluteFormat({ pageWidth: 1440 });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("elements"))).toBe(true);
  });

  it("should fail on elements without x/y/width/height", () => {
    const result = validateAbsoluteFormat({
      pageWidth: 1440,
      elements: [
        { type: "heading", text: "Hello" }, // missing x, y, width, height
      ],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("x"))).toBe(true);
    expect(result.errors.some((e: string) => e.includes("y"))).toBe(true);
    expect(result.errors.some((e: string) => e.includes("width"))).toBe(true);
    expect(result.errors.some((e: string) => e.includes("height"))).toBe(true);
  });

  it("should accept section-bg type", () => {
    const result = validateAbsoluteFormat({
      pageWidth: 1440,
      elements: [
        { type: "section-bg", name: "Hero", x: 0, y: 0, width: 1440, height: 600, background: "accent" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should fail on invalid element type", () => {
    const result = validateAbsoluteFormat({
      pageWidth: 1440,
      elements: [
        { type: "unknown-widget", x: 0, y: 0, width: 100, height: 100 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("unknown type"))).toBe(true);
  });
});

// ============================================================================
// postProcessAbsoluteResult
// ============================================================================

describe("postProcessAbsoluteResult", () => {
  it("should clamp negative coordinates to 0", () => {
    const result = postProcessAbsoluteResult({
      pageWidth: 1440,
      pageHeight: 1000,
      elements: [
        { type: "heading", x: -50, y: -20, width: 400, height: 56 },
      ],
    });
    expect(result.elements[0].x).toBe(0);
    expect(result.elements[0].y).toBe(0);
  });

  it("should clamp elements beyond pageWidth", () => {
    const result = postProcessAbsoluteResult({
      pageWidth: 1440,
      pageHeight: 1000,
      elements: [
        { type: "heading", x: 1400, y: 100, width: 200, height: 56 },
      ],
    });
    // x + width should not exceed pageWidth
    expect(result.elements[0].x + result.elements[0].width).toBeLessThanOrEqual(1440);
  });

  it("should recalculate pageHeight from elements", () => {
    const result = postProcessAbsoluteResult({
      pageWidth: 1440,
      pageHeight: 500, // too small
      elements: [
        { type: "heading", x: 0, y: 0, width: 400, height: 56 },
        { type: "paragraph", x: 0, y: 900, width: 400, height: 100 },
      ],
    });
    // pageHeight should be max(y + height) = 900 + 100 = 1000
    expect(result.pageHeight).toBe(1000);
  });

  it("should sort elements by y coordinate", () => {
    const result = postProcessAbsoluteResult({
      pageWidth: 1440,
      pageHeight: 1000,
      elements: [
        { type: "button", x: 0, y: 500, width: 200, height: 48 },
        { type: "heading", x: 0, y: 100, width: 400, height: 56 },
        { type: "paragraph", x: 0, y: 300, width: 400, height: 80 },
      ],
    });
    expect(result.elements[0].y).toBe(100);
    expect(result.elements[1].y).toBe(300);
    expect(result.elements[2].y).toBe(500);
  });
});

// ============================================================================
// convertAbsoluteToWireframeTree
// ============================================================================

describe("convertAbsoluteToWireframeTree", () => {
  const pluginColors = {
    text: "#1A1A2E",
    background: "#F0F0F5",
    secondary: "#B0B0C0",
    surface: "#E8E8F0",
    accent: "#D4E4FF",
  };
  const pluginFont = "Inter";

  it("should create root with layoutMode NONE", () => {
    const tree = convertAbsoluteToWireframeTree(
      { pageWidth: 1440, pageHeight: 1000, elements: [] },
      1440,
      pluginColors,
      pluginFont
    );
    expect(tree.layoutMode).toBe("NONE");
    expect(tree.width).toBe(1440);
    expect(tree.height).toBe(1000);
  });

  it("should position children with absolute x/y", () => {
    const tree = convertAbsoluteToWireframeTree(
      {
        pageWidth: 1440,
        pageHeight: 1000,
        elements: [
          { type: "heading", text: "Hello", level: 1, x: 200, y: 120, width: 1040, height: 56 },
        ],
      },
      1440,
      pluginColors,
      pluginFont
    );
    expect(tree.children).toHaveLength(1);
    const child = tree.children[0];
    expect(child.x).toBe(200);
    expect(child.y).toBe(120);
    expect(child.width).toBe(1040);
    expect(child.height).toBe(56);
    expect(child.layoutSizingHorizontal).toBe("FIXED");
    expect(child.layoutSizingVertical).toBe("FIXED");
  });

  it("should create section-bg as colored rectangle", () => {
    const tree = convertAbsoluteToWireframeTree(
      {
        pageWidth: 1440,
        pageHeight: 1000,
        elements: [
          { type: "section-bg", name: "Hero", x: 0, y: 0, width: 1440, height: 600, background: "accent" },
        ],
      },
      1440,
      pluginColors,
      pluginFont
    );
    const bg = tree.children[0];
    expect(bg.name).toBe("Hero");
    expect(bg.x).toBe(0);
    expect(bg.y).toBe(0);
    expect(bg.width).toBe(1440);
    expect(bg.height).toBe(600);
    expect(bg.backgroundColor).toBe(pluginColors.accent);
  });

  it("should preserve card internal auto-layout (VERTICAL)", () => {
    const tree = convertAbsoluteToWireframeTree(
      {
        pageWidth: 1440,
        pageHeight: 1000,
        elements: [
          {
            type: "card",
            x: 80,
            y: 200,
            width: 400,
            height: 300,
            background: "surface",
            shadow: true,
            elements: [
              { type: "heading", text: "Card Title", level: 3 },
              { type: "paragraph", text: "Card description" },
            ],
          },
        ],
      },
      1440,
      pluginColors,
      pluginFont
    );
    const card = tree.children[0];
    expect(card.x).toBe(80);
    expect(card.y).toBe(200);
    expect(card.layoutMode).toBe("VERTICAL"); // internal auto-layout preserved
    expect(card.children.length).toBeGreaterThan(0);
  });
});
