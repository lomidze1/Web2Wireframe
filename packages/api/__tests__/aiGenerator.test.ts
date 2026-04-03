import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  WIREFRAME_SYSTEM_PROMPT,
  VALID_ELEMENT_TYPES,
  VALID_PAGE_TYPES,
  VALID_BLOCK_TYPES,
  buildUserPrompt,
  validateSimplifiedFormat,
  parseJSONFromResponse,
  generateWireframeStructure,
  generateWithRetry,
  _setClient,
} from "../src/lib/aiGenerator.js";

// ============================================================================
// Test data
// ============================================================================

const VALID_SIMPLIFIED_JSON = {
  totalHeight: 2400,
  sections: [
    {
      name: "Hero",
      sectionType: "hero",
      height: 600,
      background: "background",
      layout: "center-stacked",
      padding: { top: 64, right: 80, bottom: 64, left: 80 },
      gap: 24,
      elements: [
        { type: "heading", text: "Welcome to Our Platform", level: 1, align: "center" },
        { type: "subheading", text: "Build something amazing", align: "center" },
        { type: "button", text: "Get Started", variant: "primary", size: "lg" },
      ],
    },
    {
      name: "Features",
      sectionType: "features",
      height: 500,
      background: "surface",
      layout: "three-column-grid",
      padding: { top: 64, right: 80, bottom: 64, left: 80 },
      gap: 24,
      elements: [
        { type: "card", elements: [{ type: "icon", size: "lg" }, { type: "heading", text: "Fast", level: 3 }], padding: 24, rounded: true, shadow: true, background: "background" },
        { type: "card", elements: [{ type: "icon", size: "lg" }, { type: "heading", text: "Secure", level: 3 }], padding: 24, rounded: true, shadow: true, background: "background" },
        { type: "card", elements: [{ type: "icon", size: "lg" }, { type: "heading", text: "Scalable", level: 3 }], padding: 24, rounded: true, shadow: true, background: "background" },
      ],
    },
  ],
};

// ============================================================================
// Mock Anthropic client
// ============================================================================

function createMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  };
}

// ============================================================================
// WIREFRAME_SYSTEM_PROMPT
// ============================================================================

describe("WIREFRAME_SYSTEM_PROMPT", () => {
  it("should be a non-empty string", () => {
    expect(typeof WIREFRAME_SYSTEM_PROMPT).toBe("string");
    expect(WIREFRAME_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("should mention JSON output format", () => {
    expect(WIREFRAME_SYSTEM_PROMPT).toContain("JSON");
    expect(WIREFRAME_SYSTEM_PROMPT).toContain("sections");
    expect(WIREFRAME_SYSTEM_PROMPT).toContain("totalHeight");
  });

  it("should list all element types", () => {
    for (const type of ["heading", "subheading", "paragraph", "button", "card", "image", "divider"]) {
      expect(WIREFRAME_SYSTEM_PROMPT).toContain(type);
    }
  });
});

// ============================================================================
// buildUserPrompt
// ============================================================================

describe("buildUserPrompt", () => {
  it("should build a page prompt with sections", () => {
    const prompt = buildUserPrompt({
      type: "page",
      pageType: "home",
      sections: ["Hero", "Features", "Footer"],
      density: "balanced",
      viewportWidth: 1440,
    });

    expect(prompt).toContain('"home"');
    expect(prompt).toContain("1440px");
    expect(prompt).toContain("balanced");
    expect(prompt).toContain("Hero, Features, Footer");
    expect(prompt).toContain("Return the complete JSON structure.");
  });

  it("should build a page prompt without sections", () => {
    const prompt = buildUserPrompt({
      type: "page",
      pageType: "pricing",
      density: "detailed",
      viewportWidth: 768,
    });

    expect(prompt).toContain('"pricing"');
    expect(prompt).toContain("768px");
    expect(prompt).toContain("detailed");
    expect(prompt).not.toContain("Sections to include");
  });

  it("should include notes when provided", () => {
    const prompt = buildUserPrompt({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
      notes: "Use dark theme, minimal style",
    });

    expect(prompt).toContain("Special requirements: Use dark theme, minimal style");
  });

  it("should build a block prompt", () => {
    const prompt = buildUserPrompt({
      type: "block",
      blockType: "hero",
      density: "balanced",
      viewportWidth: 1440,
    });

    expect(prompt).toContain('"hero"');
    expect(prompt).toContain("single");
    expect(prompt).toContain("block/section");
    expect(prompt).toContain("1440px");
  });

  it("should build a block prompt with notes", () => {
    const prompt = buildUserPrompt({
      type: "block",
      blockType: "pricing",
      density: "detailed",
      viewportWidth: 375,
      notes: "3 tiers",
    });

    expect(prompt).toContain('"pricing"');
    expect(prompt).toContain("375px");
    expect(prompt).toContain("Special requirements: 3 tiers");
  });

  it("should throw on invalid type", () => {
    expect(() => buildUserPrompt({
      type: "unknown",
      density: "balanced",
      viewportWidth: 1440,
    } as any)).toThrow("Invalid type");
  });
});

// ============================================================================
// validateSimplifiedFormat
// ============================================================================

describe("validateSimplifiedFormat", () => {
  it("should pass valid input", () => {
    const result = validateSimplifiedFormat(VALID_SIMPLIFIED_JSON);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail on null input", () => {
    const result = validateSimplifiedFormat(null);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("not a valid object");
  });

  it("should fail on non-object input", () => {
    const result = validateSimplifiedFormat("string");
    expect(result.success).toBe(false);
  });

  it("should fail when sections is missing", () => {
    const result = validateSimplifiedFormat({ totalHeight: 1000 });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("sections");
  });

  it("should fail when sections is not an array", () => {
    const result = validateSimplifiedFormat({ sections: "not an array" });
    expect(result.success).toBe(false);
  });

  it("should warn on empty sections array", () => {
    const result = validateSimplifiedFormat({ sections: [] });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("'sections' array is empty");
  });

  it("should fail on section missing name", () => {
    const result = validateSimplifiedFormat({
      sections: [{ elements: [{ type: "heading" }] }],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("missing 'name'"))).toBe(true);
  });

  it("should fail on section missing elements", () => {
    const result = validateSimplifiedFormat({
      sections: [{ name: "Hero" }],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("missing or invalid 'elements'"))).toBe(true);
  });

  it("should fail on element missing type", () => {
    const result = validateSimplifiedFormat({
      sections: [{ name: "Hero", elements: [{ text: "Hello" }] }],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("missing 'type'"))).toBe(true);
  });

  it("should fail on unknown element type", () => {
    const result = validateSimplifiedFormat({
      sections: [{ name: "Hero", elements: [{ type: "mega-widget" }] }],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("unknown type 'mega-widget'"))).toBe(true);
  });

  it("should fail on negative totalHeight", () => {
    const result = validateSimplifiedFormat({
      totalHeight: -100,
      sections: [{ name: "Hero", elements: [{ type: "heading" }] }],
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes("totalHeight"))).toBe(true);
  });

  it("should accept all valid element types", () => {
    const elements = VALID_ELEMENT_TYPES.map((type: string) => ({ type }));
    const result = validateSimplifiedFormat({
      totalHeight: 1000,
      sections: [{ name: "Test", elements }],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// parseJSONFromResponse
// ============================================================================

describe("parseJSONFromResponse", () => {
  it("should parse raw JSON", () => {
    const json = JSON.stringify(VALID_SIMPLIFIED_JSON);
    const result = parseJSONFromResponse(json);
    expect(result).toEqual(VALID_SIMPLIFIED_JSON);
  });

  it("should parse ```json fenced block", () => {
    const text = "Here is the wireframe:\n```json\n" + JSON.stringify(VALID_SIMPLIFIED_JSON) + "\n```\n";
    const result = parseJSONFromResponse(text);
    expect(result).toEqual(VALID_SIMPLIFIED_JSON);
  });

  it("should parse ``` fenced block without json tag", () => {
    const text = "```\n" + JSON.stringify({ sections: [] }) + "\n```";
    const result = parseJSONFromResponse(text);
    expect(result).toEqual({ sections: [] });
  });

  it("should throw on invalid JSON", () => {
    expect(() => parseJSONFromResponse("not json at all")).toThrow();
  });
});

// ============================================================================
// generateWireframeStructure (mocked)
// ============================================================================

describe("generateWireframeStructure", () => {
  afterEach(() => {
    _setClient(null);
  });

  it("should call Anthropic API with correct parameters", async () => {
    const mockClient = createMockClient(JSON.stringify(VALID_SIMPLIFIED_JSON));
    _setClient(mockClient);

    const result = await generateWireframeStructure({
      type: "page",
      pageType: "home",
      sections: ["Hero"],
      density: "balanced",
      viewportWidth: 1440,
    });

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.system).toBe(WIREFRAME_SYSTEM_PROMPT);
    expect(callArgs.max_tokens).toBe(8000); // page = 8000
    expect(callArgs.messages[0].role).toBe("user");
    expect(callArgs.messages[0].content).toContain("home");
  });

  it("should use 4000 max_tokens for blocks", async () => {
    const mockClient = createMockClient(JSON.stringify({
      totalHeight: 600,
      sections: [{ name: "Hero", sectionType: "hero", elements: [{ type: "heading", text: "Hi" }] }],
    }));
    _setClient(mockClient);

    await generateWireframeStructure({
      type: "block",
      blockType: "hero",
      density: "balanced",
      viewportWidth: 1440,
    });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(4000);
  });

  it("should parse JSON from fenced response", async () => {
    const responseText = "```json\n" + JSON.stringify(VALID_SIMPLIFIED_JSON) + "\n```";
    const mockClient = createMockClient(responseText);
    _setClient(mockClient);

    const result = await generateWireframeStructure({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    });

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].name).toBe("Hero");
  });

  it("should propagate API errors", async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("API rate limited")),
      },
    };
    _setClient(mockClient);

    await expect(generateWireframeStructure({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    })).rejects.toThrow("API rate limited");
  });
});

// ============================================================================
// generateWithRetry (mocked)
// ============================================================================

describe("generateWithRetry", () => {
  afterEach(() => {
    _setClient(null);
  });

  it("should succeed on first attempt if valid", async () => {
    const mockClient = createMockClient(JSON.stringify(VALID_SIMPLIFIED_JSON));
    _setClient(mockClient);

    const result = await generateWithRetry({
      type: "page",
      pageType: "home",
      sections: ["Hero", "Features"],
      density: "balanced",
      viewportWidth: 1440,
    });

    expect(result.sections).toHaveLength(2);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });

  it("should retry on validation failure and succeed", async () => {
    const invalidJSON = { sections: [] }; // empty sections = fails validation
    const mockClient = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify(invalidJSON) }],
          })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify(VALID_SIMPLIFIED_JSON) }],
          }),
      },
    };
    _setClient(mockClient);

    const result = await generateWithRetry({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    }, 1);

    expect(result.sections).toHaveLength(2);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("should retry on API error and succeed", async () => {
    const mockClient = {
      messages: {
        create: vi.fn()
          .mockRejectedValueOnce(new Error("Temporary failure"))
          .mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify(VALID_SIMPLIFIED_JSON) }],
          }),
      },
    };
    _setClient(mockClient);

    const result = await generateWithRetry({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    }, 1);

    expect(result.sections).toHaveLength(2);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("should throw after all retries exhausted", async () => {
    const invalidJSON = { sections: [] };
    const mockClient = createMockClient(JSON.stringify(invalidJSON));
    _setClient(mockClient);

    await expect(generateWithRetry({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    }, 1)).rejects.toThrow("Validation failed");

    expect(mockClient.messages.create).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it("should not retry on auth errors (401)", async () => {
    const authError = new Error("Unauthorized") as Error & { status?: number };
    authError.status = 401;
    const mockClient = {
      messages: {
        create: vi.fn().mockRejectedValue(authError),
      },
    };
    _setClient(mockClient);

    await expect(generateWithRetry({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    }, 2)).rejects.toThrow("Unauthorized");

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1); // No retry
  });

  it("should not retry on 403 errors", async () => {
    const forbiddenError = new Error("Forbidden") as Error & { status?: number };
    forbiddenError.status = 403;
    const mockClient = {
      messages: {
        create: vi.fn().mockRejectedValue(forbiddenError),
      },
    };
    _setClient(mockClient);

    await expect(generateWithRetry({
      type: "page",
      pageType: "home",
      density: "balanced",
      viewportWidth: 1440,
    }, 2)).rejects.toThrow("Forbidden");

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Constants
// ============================================================================

describe("constants", () => {
  it("VALID_PAGE_TYPES should include common page types", () => {
    expect(VALID_PAGE_TYPES).toContain("home");
    expect(VALID_PAGE_TYPES).toContain("pricing");
    expect(VALID_PAGE_TYPES).toContain("contact");
    expect(VALID_PAGE_TYPES).toContain("faq");
  });

  it("VALID_BLOCK_TYPES should include common block types", () => {
    expect(VALID_BLOCK_TYPES).toContain("hero");
    expect(VALID_BLOCK_TYPES).toContain("features");
    expect(VALID_BLOCK_TYPES).toContain("footer");
    expect(VALID_BLOCK_TYPES).toContain("cta");
  });

  it("VALID_ELEMENT_TYPES should include all wireframe element types", () => {
    expect(VALID_ELEMENT_TYPES).toContain("heading");
    expect(VALID_ELEMENT_TYPES).toContain("button");
    expect(VALID_ELEMENT_TYPES).toContain("card");
    expect(VALID_ELEMENT_TYPES).toContain("image");
    expect(VALID_ELEMENT_TYPES).toContain("divider");
    expect(VALID_ELEMENT_TYPES).toContain("stat");
    expect(VALID_ELEMENT_TYPES).toContain("avatar");
  });
});
