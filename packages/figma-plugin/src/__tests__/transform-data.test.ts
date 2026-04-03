/**
 * Unit tests for text transformation utilities (transformData.ts)
 * Tests Lorem Ipsum generation, symbol preservation, width estimation,
 * pseudo-element handling, and end-to-end frame transformation.
 */
import { describe, it, expect } from "vitest";
import {
  generateLoremPreservingSymbols,
  estimateTextWidth,
  transformFrameData,
  trimLoremToFitWidth,
} from "../ui/shared/transformData";

// ============================================================================
// Helper: create a minimal text element for frame tests
// ============================================================================

function makeTextElement(
  textContent: string,
  tag = "span",
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "el-1",
    type: "text" as const,
    tag,
    textContent,
    children: [],
    ...overrides,
  };
}

function makeFrame(tree: ReturnType<typeof makeTextElement>) {
  return {
    viewport: { width: 1440, height: 900 },
    tree: tree as any,
  };
}

// ============================================================================
// generateLoremPreservingSymbols — symbol preservation
// ============================================================================

describe("generateLoremPreservingSymbols", () => {
  describe("symbol preservation", () => {
    it("preserves text with no alphabetic characters at all", () => {
      expect(generateLoremPreservingSymbols("$99")).toBe("$99");
      expect(generateLoremPreservingSymbols("100%")).toBe("100%");
      expect(generateLoremPreservingSymbols("!@#$%^&*")).toBe("!@#$%^&*");
      expect(generateLoremPreservingSymbols("123.45")).toBe("123.45");
      expect(generateLoremPreservingSymbols("•")).toBe("•");
      expect(generateLoremPreservingSymbols("©")).toBe("©");
    });

    it("preserves $ symbol in price-like text", () => {
      const result = generateLoremPreservingSymbols("$12 /month");
      expect(result).toMatch(/^\$12 \//); // $12 / preserved
      expect(result).not.toBe("$12 /month"); // text part replaced
    });

    it("preserves / slash character", () => {
      const result = generateLoremPreservingSymbols("/forever");
      expect(result.startsWith("/")).toBe(true);
      expect(result).not.toBe("/forever");
    });

    it("preserves comma and exclamation", () => {
      const result = generateLoremPreservingSymbols("Hello, World!");
      expect(result).toContain(",");
      expect(result).toContain("!");
      expect(result).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]+!$/);
    });

    it("preserves colon in text", () => {
      const result = generateLoremPreservingSymbols("Name: John");
      expect(result).toContain(": ");
    });

    it("preserves brackets and braces", () => {
      const result = generateLoremPreservingSymbols("[Test]");
      expect(result.startsWith("[")).toBe(true);
      expect(result.endsWith("]")).toBe(true);
    });

    it("preserves angle brackets", () => {
      const result = generateLoremPreservingSymbols("<div>");
      expect(result.startsWith("<")).toBe(true);
      expect(result.endsWith(">")).toBe(true);
    });

    it("preserves question mark", () => {
      const result = generateLoremPreservingSymbols("Ready?");
      expect(result.endsWith("?")).toBe(true);
    });

    it("preserves dots/periods", () => {
      const result = generateLoremPreservingSymbols("e.g.");
      expect(result).toMatch(/^.\..\.$/);
    });

    it("preserves single quote / apostrophe", () => {
      const result = generateLoremPreservingSymbols("it's");
      expect(result).toContain("'");
    });

    it("preserves numbers mixed with text", () => {
      const result = generateLoremPreservingSymbols("Item 42 here");
      expect(result).toContain(" 42 ");
    });
  });

  // ============================================================================
  // generateLoremPreservingSymbols — basic Lorem generation
  // ============================================================================

  describe("basic Lorem generation", () => {
    it("returns empty string for empty input", () => {
      expect(generateLoremPreservingSymbols("")).toBe("");
    });

    it("replaces purely alphabetic text with Lorem", () => {
      const result = generateLoremPreservingSymbols("Hello");
      expect(result).not.toBe("Hello");
      expect(/^[a-zA-Z]+$/.test(result)).toBe(true);
    });

    it("replaces multi-word text, preserving spaces", () => {
      const result = generateLoremPreservingSymbols("Hello World Test");
      // Spaces should be preserved in their original positions
      const parts = result.split(" ");
      expect(parts.length).toBe(3);
    });

    it("capitalizes replacement when original starts with uppercase", () => {
      const result = generateLoremPreservingSymbols("Pricing");
      expect(result[0]).toBe(result[0].toUpperCase());
    });

    it("keeps lowercase when original starts with lowercase", () => {
      const result = generateLoremPreservingSymbols("pricing");
      expect(result[0]).toBe(result[0].toLowerCase());
    });

    it("generates deterministic output for same input", () => {
      const a = generateLoremPreservingSymbols("Hello World");
      const b = generateLoremPreservingSymbols("Hello World");
      expect(a).toBe(b);
    });
  });

  // ============================================================================
  // generateLoremPreservingSymbols — width-based trimming
  // ============================================================================

  describe("character count matching", () => {
    it("always produces exact char count for each word", () => {
      const result = generateLoremPreservingSymbols("Pricing");
      expect(result.length).toBe("Pricing".length);
    });

    it("does not trim even when Lorem replacement would be wider", () => {
      // "Pricing" → "Loremip" (7 chars), 'm' is wide but no per-word trimming
      const result = generateLoremPreservingSymbols("Pricing");
      expect(result.length).toBe(7);
      expect(result).toBe("Loremip");
    });

    it("exact char count for all test words", () => {
      const testWords = [
        "Pricing", "Contact", "Features", "Settings", "Dashboard",
        "Subscribe", "Download", "About", "Title", "Submit",
      ];
      for (const word of testWords) {
        const result = generateLoremPreservingSymbols(word);
        expect(result.length).toBe(word.length);
      }
    });

    it("single character always preserved", () => {
      const result = generateLoremPreservingSymbols("I");
      expect(result.length).toBe(1);
    });
  });
});

// ============================================================================
// estimateTextWidth
// ============================================================================

describe("estimateTextWidth", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTextWidth("")).toBe(0);
  });

  it("narrow chars (i, l, f, t) are less than 0.4", () => {
    const narrowWidth = estimateTextWidth("i");
    expect(narrowWidth).toBeLessThan(0.4);
  });

  it("wide chars (m, w) are more than 0.7", () => {
    const mWidth = estimateTextWidth("m");
    const wWidth = estimateTextWidth("w");
    expect(mWidth).toBeGreaterThan(0.7);
    expect(wWidth).toBeGreaterThan(0.7);
  });

  it("'m' is wider than 'i'", () => {
    expect(estimateTextWidth("m")).toBeGreaterThan(estimateTextWidth("i"));
  });

  it("uppercase M is wider than lowercase a", () => {
    expect(estimateTextWidth("M")).toBeGreaterThan(estimateTextWidth("a"));
  });

  it("unknown characters default to 0.50", () => {
    // Non-Latin character
    expect(estimateTextWidth("你")).toBeCloseTo(0.50);
  });

  it("'Loremip' is wider than 'Pricing'", () => {
    // This is the exact case that motivated the trimming logic
    expect(estimateTextWidth("Loremip")).toBeGreaterThan(
      estimateTextWidth("Pricing")
    );
  });
});

// ============================================================================
// transformFrameData — lorem mode integration
// ============================================================================

describe("transformFrameData — lorem mode", () => {
  const loremOpts = { colorMode: "website" as const, fontMode: "website" as const, textMode: "lorem" as const };
  const websiteOpts = { colorMode: "website" as const, fontMode: "website" as const, textMode: "website" as const };

  it("website mode returns text unchanged", () => {
    const frame = makeFrame(makeTextElement("Hello World"));
    const result = transformFrameData(frame, websiteOpts);
    expect(result.tree.textContent).toBe("Hello World");
  });

  it("lorem mode replaces alphabetic text", () => {
    const frame = makeFrame(makeTextElement("Hello World"));
    const result = transformFrameData(frame, loremOpts);
    expect(result.tree.textContent).not.toBe("Hello World");
    expect(result.tree.textContent).toContain(" "); // space preserved
  });

  it("lorem mode preserves pure symbol text", () => {
    const frame = makeFrame(makeTextElement("$99"));
    const result = transformFrameData(frame, loremOpts);
    expect(result.tree.textContent).toBe("$99");
  });

  it("lorem mode preserves symbols within mixed text", () => {
    const frame = makeFrame(makeTextElement("$12 /month"));
    const result = transformFrameData(frame, loremOpts);
    expect(result.tree.textContent).toMatch(/^\$12 \//);
  });

  it("lorem mode preserves special chars: ! @ # $ % ^ & *", () => {
    const frame = makeFrame(makeTextElement("!@#$%^&*"));
    const result = transformFrameData(frame, loremOpts);
    expect(result.tree.textContent).toBe("!@#$%^&*");
  });

  it("does not transform frame/placeholder type elements", () => {
    const el = {
      id: "el-1",
      type: "frame" as const,
      tag: "div",
      textContent: "Should not change",
      children: [],
    };
    const frame = makeFrame(el as any);
    const result = transformFrameData(frame, loremOpts);
    expect(result.tree.textContent).toBe("Should not change");
  });

  // ============================================================================
  // Pseudo-element (::before / ::after / ::marker) styledSegments
  // ============================================================================

  describe("pseudo-element styledSegments", () => {
    it("preserves single-char ::marker bullet in styledSegments", () => {
      const el = makeTextElement("•  List item text", "span", {
        styledSegments: [
          { text: "•  ", tag: "::marker" },
          { text: "List item text", tag: "li" },
        ],
      });
      const frame = makeFrame(el);
      const result = transformFrameData(frame, loremOpts);
      const segs = result.tree.styledSegments as any[];
      expect(segs[0].text).toBe("•  "); // bullet preserved
      expect(segs[1].text).not.toBe("List item text"); // text replaced
    });

    it("preserves single-char ::before content", () => {
      const el = makeTextElement("→ Click here", "span", {
        styledSegments: [
          { text: "→", tag: "::before" },
          { text: " Click here", tag: "span" },
        ],
      });
      const frame = makeFrame(el);
      const result = transformFrameData(frame, loremOpts);
      const segs = result.tree.styledSegments as any[];
      expect(segs[0].text).toBe("→"); // pseudo preserved
    });

    it("preserves single-char ::after content", () => {
      const el = makeTextElement("Text ›", "span", {
        styledSegments: [
          { text: "Text ", tag: "span" },
          { text: "›", tag: "::after" },
        ],
      });
      const frame = makeFrame(el);
      const result = transformFrameData(frame, loremOpts);
      const segs = result.tree.styledSegments as any[];
      expect(segs[1].text).toBe("›"); // pseudo preserved
    });

    it("replaces multi-char ::before content", () => {
      const el = makeTextElement("Step 1: Hello", "span", {
        styledSegments: [
          { text: "Step ", tag: "::before" },
          { text: "Hello", tag: "span" },
        ],
      });
      const frame = makeFrame(el);
      const result = transformFrameData(frame, loremOpts);
      const segs = result.tree.styledSegments as any[];
      // "Step " has 4 alpha chars — should be replaced
      expect(segs[0].text).not.toBe("Step ");
    });

    it("preserves symbol-only styledSegments (no pseudo tag needed)", () => {
      const el = makeTextElement("$100", "span", {
        styledSegments: [
          { text: "$", tag: "span" },
          { text: "100", tag: "span" },
        ],
      });
      const frame = makeFrame(el);
      const result = transformFrameData(frame, loremOpts);
      const segs = result.tree.styledSegments as any[];
      expect(segs[0].text).toBe("$");  // no letters → preserved
      expect(segs[1].text).toBe("100"); // no letters → preserved
    });
  });

  // ============================================================================
  // Recursive children transformation
  // ============================================================================

  describe("recursive children", () => {
    it("transforms text in nested children", () => {
      const tree = {
        id: "root",
        type: "frame" as const,
        tag: "div",
        textContent: "",
        children: [
          makeTextElement("Original text", "p"),
          makeTextElement("$50", "span"),
        ],
      };
      const frame = makeFrame(tree as any);
      const result = transformFrameData(frame, loremOpts);
      const children = result.tree.children as any[];
      expect(children[0].textContent).not.toBe("Original text");
      expect(children[1].textContent).toBe("$50"); // symbol preserved
    });
  });
});

// ============================================================================
// transformFrameData — semantic mode integration
// ============================================================================

describe("transformFrameData — semantic mode", () => {
  const semanticOpts = { colorMode: "website" as const, fontMode: "website" as const, textMode: "semantic" as const };

  it("replaces heading text with semantic placeholder", () => {
    const frame = makeFrame(makeTextElement("Welcome to our site", "h1"));
    const result = transformFrameData(frame, semanticOpts);
    expect(result.tree.textContent).toBe("Page Title");
  });

  it("preserves symbols in semantic mode (≤2 chars)", () => {
    const frame = makeFrame(makeTextElement("©", "span"));
    const result = transformFrameData(frame, semanticOpts);
    expect(result.tree.textContent).toBe("©");
  });

  it("preserves pure-symbol text in semantic mode", () => {
    const frame = makeFrame(makeTextElement("→", "span"));
    const result = transformFrameData(frame, semanticOpts);
    expect(result.tree.textContent).toBe("→");
  });

  it("converts number-only text to price in semantic mode", () => {
    // "42" matches price pattern → "$price"
    const frame = makeFrame(makeTextElement("42", "span"));
    const result = transformFrameData(frame, semanticOpts);
    expect(result.tree.textContent).toBe("$price");
  });
});

// ============================================================================
// trimLoremToFitWidth
// ============================================================================

describe("trimLoremToFitWidth", () => {
  it("returns empty/falsy input unchanged", () => {
    expect(trimLoremToFitWidth("", "hello")).toBe("");
    expect(trimLoremToFitWidth("hello", "")).toBe("hello");
  });

  it("does not trim when lorem fits within original width", () => {
    // "WILL" is wide (W=0.88), lorem replacement should fit
    const lorem = generateLoremPreservingSymbols("WILL");
    const result = trimLoremToFitWidth(lorem, "WILL");
    expect(result).toBe(lorem);
  });

  it("trims when lorem is wider than original", () => {
    // "Pricing" → "Loremip" — 'm' makes it wider
    const lorem = generateLoremPreservingSymbols("Pricing");
    const result = trimLoremToFitWidth(lorem, "Pricing");
    expect(result.length).toBeLessThan(lorem.length);
    expect(estimateTextWidth(result)).toBeLessThanOrEqual(estimateTextWidth("Pricing"));
  });

  it("preserves trailing symbols when trimming", () => {
    // "Loremip!" is wider than "Pricing!" — trimming removes alpha chars, keeps "!"
    const result = trimLoremToFitWidth("Loremip!", "Pricing!");
    expect(result.endsWith("!")).toBe(true);
    expect(estimateTextWidth(result)).toBeLessThanOrEqual(estimateTextWidth("Pricing!"));
  });
});

// ============================================================================
// transformFrameData — fontMode behavior
// ============================================================================

describe("transformFrameData — fontMode behavior", () => {
  it("website font: no width trimming applied", () => {
    const frame = makeFrame(makeTextElement("Pricing"));
    const result = transformFrameData(frame, { colorMode: "website", fontMode: "website", textMode: "lorem" });
    // Exact char count, no trimming
    expect(result.tree.textContent.length).toBe("Pricing".length);
  });

  it("plugin font: whole-element width trimming", () => {
    const frame = makeFrame(makeTextElement("Pricing"));
    const result = transformFrameData(frame, { colorMode: "website", fontMode: "plugin", textMode: "lorem" });
    // Lorem replacement should be trimmed to fit original width
    expect(estimateTextWidth(result.tree.textContent)).toBeLessThanOrEqual(estimateTextWidth("Pricing"));
  });

  it("plugin font: no trim when already fits", () => {
    const frame = makeFrame(makeTextElement("WILL"));
    const result = transformFrameData(frame, { colorMode: "website", fontMode: "plugin", textMode: "lorem" });
    // WILL has wide chars, lorem replacement should fit without trimming
    expect(result.tree.textContent.length).toBe("WILL".length);
  });
});

// ============================================================================
// styledSegments + fontMode
// ============================================================================

describe("styledSegments + fontMode", () => {
  it("website font: exact char count in segments", () => {
    const el = makeTextElement("Hello World", "h2", {
      styledSegments: [
        { text: "Hello ", tag: "h2" },
        { text: "World", tag: "a" },
      ],
    });
    const frame = makeFrame(el);
    const result = transformFrameData(frame, { colorMode: "website", fontMode: "website", textMode: "lorem" });
    const segs = result.tree.styledSegments as any[];
    expect(segs[0].text.length).toBe("Hello ".length);
    expect(segs[1].text.length).toBe("World".length);
  });

  it("plugin font: total width fits original", () => {
    const el = makeTextElement("Pricing here", "h2", {
      styledSegments: [
        { text: "Pricing ", tag: "h2" },
        { text: "here", tag: "a" },
      ],
    });
    const frame = makeFrame(el);
    const result = transformFrameData(frame, { colorMode: "website", fontMode: "plugin", textMode: "lorem" });
    const segs = result.tree.styledSegments as any[];
    const totalLoremWidth = segs.reduce((w: number, s: any) => w + estimateTextWidth(s.text), 0);
    const totalOrigWidth = estimateTextWidth("Pricing ") + estimateTextWidth("here");
    expect(totalLoremWidth).toBeLessThanOrEqual(totalOrigWidth);
  });

  it("plugin font: pseudo-element segments are not trimmed", () => {
    const el = makeTextElement("• Pricing", "span", {
      styledSegments: [
        { text: "• ", tag: "::marker" },
        { text: "Pricing", tag: "span" },
      ],
    });
    const frame = makeFrame(el);
    const result = transformFrameData(frame, { colorMode: "website", fontMode: "plugin", textMode: "lorem" });
    const segs = result.tree.styledSegments as any[];
    expect(segs[0].text).toBe("• "); // pseudo preserved
  });
});
