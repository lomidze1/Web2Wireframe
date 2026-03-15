import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SCREENSHOT_SYSTEM_PROMPT,
  buildScreenshotUserPrompt,
  postProcessScreenshotResult,
  validateSimplifiedFormat,
  analyzeScreenshot,
  _setClient,
} from "../lib/aiGenerator.js";

// ============================================================================
// SCREENSHOT_SYSTEM_PROMPT content checks
// ============================================================================

describe("SCREENSHOT_SYSTEM_PROMPT", () => {
  it("should contain column assignment instructions", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("column");
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/["']left["']/);
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/["']right["']/);
  });

  it("should document grid and accordion element types", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("grid");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("accordion");
  });

  it("should list all 6 layout types", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("center-stacked");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("two-column");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("three-column-grid");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("four-column-grid");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("sidebar-left");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("sidebar-right");
  });

  it("should include extractedColors in the main schema", () => {
    // extractedColors should be part of the output schema, not a separate section at the end
    const schemaIdx = SCREENSHOT_SYSTEM_PROMPT.indexOf("extractedColors");
    expect(schemaIdx).toBeGreaterThan(-1);
  });

  it("should include card detection guidance", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/card/i);
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/shadow|boundary|border/i);
  });

  it("should include height estimation guidance", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/height/i);
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/proportion|fraction|percent/i);
  });

  it("should include heading hierarchy guidance", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("h1");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("h2");
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("h3");
  });

  it("should include grid card consistency instructions", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("GRID CARD CONSISTENCY");
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/same element structure/i);
  });

  it("should include text atomicity rules", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("TEXT ATOMICITY");
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/compound text/i);
  });

  it("should recommend stat type for pricing", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toMatch(/stat.*pricing|pricing.*stat/is);
  });
});

// ============================================================================
// buildScreenshotUserPrompt
// ============================================================================

describe("buildScreenshotUserPrompt", () => {
  it("should handle 'website' textMode (preserve actual text)", () => {
    const prompt = buildScreenshotUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 3000,
      textMode: "website",
    });

    expect(prompt).toContain("1440");
    expect(prompt).toContain("3000");
    expect(prompt).toMatch(/preserve|actual|visible/i);
  });

  it("should handle 'lorem' textMode", () => {
    const prompt = buildScreenshotUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 3000,
      textMode: "lorem",
    });

    expect(prompt).toMatch(/lorem/i);
  });

  it("should handle 'semantic' textMode", () => {
    const prompt = buildScreenshotUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 3000,
      textMode: "semantic",
    });

    expect(prompt).toMatch(/semantic|label/i);
  });

  it("should include imageHeight for proportional scaling", () => {
    const prompt = buildScreenshotUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 5000,
      textMode: "website",
    });

    expect(prompt).toContain("5000");
  });

  it("should include column assignment reminder", () => {
    const prompt = buildScreenshotUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 3000,
      textMode: "website",
    });

    expect(prompt).toMatch(/column/i);
  });

  it("should include extractedColors reminder", () => {
    const prompt = buildScreenshotUserPrompt({
      viewportWidth: 1440,
      imageWidth: 1440,
      imageHeight: 3000,
      textMode: "website",
    });

    expect(prompt).toMatch(/extractedColors/);
  });
});

// ============================================================================
// postProcessScreenshotResult
// ============================================================================

describe("postProcessScreenshotResult", () => {
  it("should correct 'centered' layout to 'center-stacked'", () => {
    const input = {
      totalHeight: 1000,
      sections: [{ name: "Hero", layout: "centered", height: 500, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].layout).toBe("center-stacked");
  });

  it("should correct 'two-columns' layout to 'two-column'", () => {
    const input = {
      totalHeight: 1000,
      sections: [{ name: "About", layout: "two-columns", height: 400, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].layout).toBe("two-column");
  });

  it("should correct 'center' layout to 'center-stacked'", () => {
    const input = {
      totalHeight: 1000,
      sections: [{ name: "CTA", layout: "center", height: 300, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].layout).toBe("center-stacked");
  });

  it("should convert padding number to object", () => {
    const input = {
      totalHeight: 1000,
      sections: [{ name: "Hero", padding: 40, height: 500, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].padding).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
  });

  it("should convert gap string to number", () => {
    const input = {
      totalHeight: 1000,
      sections: [{ name: "Hero", gap: "24", height: 500, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].gap).toBe(24);
  });

  it("should clamp height above 2000 to 800", () => {
    const input = {
      totalHeight: 3000,
      sections: [{ name: "Hero", height: 2500, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].height).toBe(800);
  });

  it("should clamp height below 30 to 200", () => {
    const input = {
      totalHeight: 500,
      sections: [{ name: "Divider", height: 10, elements: [] }],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].height).toBe(200);
  });

  it("should pass valid input unchanged", () => {
    const input = {
      totalHeight: 1200,
      sections: [
        {
          name: "Hero",
          layout: "center-stacked",
          height: 500,
          padding: { top: 64, right: 80, bottom: 64, left: 80 },
          gap: 24,
          elements: [{ type: "heading", text: "Hello" }],
        },
      ],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.sections[0].layout).toBe("center-stacked");
    expect(result.sections[0].height).toBe(500);
    expect(result.sections[0].padding).toEqual({ top: 64, right: 80, bottom: 64, left: 80 });
    expect(result.sections[0].gap).toBe(24);
  });

  it("should recalculate totalHeight from sections", () => {
    const input = {
      totalHeight: 9999,
      sections: [
        { name: "Hero", height: 500, elements: [] },
        { name: "Features", height: 400, elements: [] },
      ],
    };
    const result = postProcessScreenshotResult(input);
    expect(result.totalHeight).toBe(900);
  });
});

// ============================================================================
// analyzeScreenshot — mock tests
// ============================================================================

describe("analyzeScreenshot", () => {
  afterEach(() => {
    _setClient(null);
  });

  it("should use temperature 0.2", async () => {
    const mockResponse = JSON.stringify({
      totalHeight: 1000,
      sections: [{ name: "Hero", sectionType: "hero", height: 500, elements: [{ type: "heading", text: "Test" }] }],
    });
    // The response will be prepended with "{", so the mock returns text without leading "{"
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: mockResponse.slice(1) }],
        }),
      },
    };
    _setClient(mockClient);

    await analyzeScreenshot({
      imageBase64: "data:image/png;base64,iVBOR",
      imageWidth: 1440,
      imageHeight: 3000,
      viewportWidth: 1440,
      textMode: "website",
    });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.2);
  });

  it("should use max_tokens 12000", async () => {
    const mockResponse = JSON.stringify({
      totalHeight: 1000,
      sections: [{ name: "Hero", sectionType: "hero", height: 500, elements: [{ type: "heading", text: "Test" }] }],
    });
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: mockResponse.slice(1) }],
        }),
      },
    };
    _setClient(mockClient);

    await analyzeScreenshot({
      imageBase64: "data:image/png;base64,iVBOR",
      imageWidth: 1440,
      imageHeight: 3000,
      viewportWidth: 1440,
      textMode: "website",
    });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(12000);
  });

  it("should include assistant prefill message", async () => {
    const mockResponse = JSON.stringify({
      totalHeight: 1000,
      sections: [{ name: "Hero", sectionType: "hero", height: 500, elements: [{ type: "heading", text: "Test" }] }],
    });
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: mockResponse.slice(1) }],
        }),
      },
    };
    _setClient(mockClient);

    await analyzeScreenshot({
      imageBase64: "data:image/png;base64,iVBOR",
      imageWidth: 1440,
      imageHeight: 3000,
      viewportWidth: 1440,
      textMode: "website",
    });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    const messages = callArgs.messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("{");
  });

  it("should prepend '{' to response text for parsing", async () => {
    // If Claude returns '"totalHeight":1000,...}' (without leading {),
    // the prefill logic prepends "{" to make valid JSON
    const innerJSON = {
      totalHeight: 1000,
      sections: [{ name: "Hero", sectionType: "hero", height: 500, elements: [{ type: "heading", text: "Test" }] }],
    };
    const fullStr = JSON.stringify(innerJSON);
    // Claude's response will be everything after the first "{"
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: fullStr.slice(1) }],
        }),
      },
    };
    _setClient(mockClient);

    const result = await analyzeScreenshot({
      imageBase64: "data:image/png;base64,iVBOR",
      imageWidth: 1440,
      imageHeight: 3000,
      viewportWidth: 1440,
      textMode: "website",
    });

    // totalHeight is recalculated by postProcessScreenshotResult from section heights
    expect(result.totalHeight).toBe(500);
    expect(result.sections[0].name).toBe("Hero");
  });
});

// ============================================================================
// validateSimplifiedFormat — new layout/background checks
// ============================================================================

describe("validateSimplifiedFormat — layout and background", () => {
  it("should warn on invalid layout value", () => {
    const input = {
      totalHeight: 1000,
      sections: [{
        name: "Hero",
        layout: "crazy-layout",
        elements: [{ type: "heading" }],
      }],
    };
    const result = validateSimplifiedFormat(input);
    expect(result.errors.some(e => e.includes("layout"))).toBe(true);
  });

  it("should accept valid layout values", () => {
    const validLayouts = ["center-stacked", "two-column", "three-column-grid", "four-column-grid", "sidebar-left", "sidebar-right"];
    for (const layout of validLayouts) {
      const result = validateSimplifiedFormat({
        totalHeight: 1000,
        sections: [{ name: "Test", layout, elements: [{ type: "heading" }] }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("should auto-correct invalid background to 'background'", () => {
    const input = {
      totalHeight: 1000,
      sections: [{
        name: "Hero",
        background: "dark-blue",
        elements: [{ type: "heading" }],
      }],
    };
    const result = validateSimplifiedFormat(input);
    // Should not fail — auto-corrects
    expect(result.success).toBe(true);
    expect(input.sections[0].background).toBe("background");
  });

  it("should keep valid background values unchanged", () => {
    const validBackgrounds = ["background", "surface", "accent", "transparent"];
    for (const bg of validBackgrounds) {
      const section = { name: "Test", background: bg, elements: [{ type: "heading" }] };
      const input = { totalHeight: 1000, sections: [section] };
      validateSimplifiedFormat(input);
      expect(section.background).toBe(bg);
    }
  });
});
