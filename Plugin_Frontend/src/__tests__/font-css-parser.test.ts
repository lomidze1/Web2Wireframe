import { describe, it, expect } from "vitest";
import {
  parseFontFaceRules,
  resolveRelativeUrl,
  deduplicateFonts,
  type ParsedFontFace,
} from "../utils/fontCssParser";

// ============================================================================
// resolveRelativeUrl
// ============================================================================

describe("resolveRelativeUrl", () => {
  it("resolves relative path against base URL", () => {
    expect(
      resolveRelativeUrl("../fonts/file.woff2", "https://example.com/css/styles.css")
    ).toBe("https://example.com/fonts/file.woff2");
  });

  it("resolves same-directory relative path", () => {
    expect(
      resolveRelativeUrl("./font.woff2", "https://example.com/css/styles.css")
    ).toBe("https://example.com/css/font.woff2");
  });

  it("returns absolute URL unchanged", () => {
    expect(
      resolveRelativeUrl("https://cdn.example.com/font.woff2", "https://example.com/css/styles.css")
    ).toBe("https://cdn.example.com/font.woff2");
  });

  it("returns data URI unchanged", () => {
    const dataUri = "data:font/woff2;base64,AAAA";
    expect(resolveRelativeUrl(dataUri, "https://example.com/styles.css")).toBe(dataUri);
  });

  it("handles empty inputs gracefully", () => {
    expect(resolveRelativeUrl("", "https://example.com/")).toBe("");
    expect(resolveRelativeUrl("font.woff2", "")).toBe("font.woff2");
  });
});

// ============================================================================
// parseFontFaceRules — single block
// ============================================================================

describe("parseFontFaceRules", () => {
  const baseURL = "https://example.com/css/styles.css";

  it("extracts single @font-face with absolute URL", () => {
    const css = `
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTcviYwY.woff2) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe("Inter");
    expect(result[0].style).toBe("normal");
    expect(result[0].weight).toBe("400");
    expect(result[0].format).toBe("woff2");
    expect(result[0].isGoogleFont).toBe(true);
    expect(result[0].src).toContain("fonts.gstatic.com");
  });

  // ============================================================================
  // Multiple variants (same family, different weights)
  // ============================================================================

  it("extracts multiple variants of the same family", () => {
    const css = `
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/v13/400.woff2) format('woff2');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 700;
        src: url(https://fonts.gstatic.com/s/inter/v13/700.woff2) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBe("400");
    expect(result[1].weight).toBe("700");
    expect(result[0].family).toBe("Inter");
    expect(result[1].family).toBe("Inter");
  });

  // ============================================================================
  // Cross-origin CDN (Google Fonts)
  // ============================================================================

  it("marks Google Fonts as isGoogleFont", () => {
    const css = `
      @font-face {
        font-family: 'Roboto';
        src: url(https://fonts.gstatic.com/s/roboto/v30/roboto.woff2) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result[0].isGoogleFont).toBe(true);
  });

  it("marks non-Google fonts as isGoogleFont=false", () => {
    const css = `
      @font-face {
        font-family: 'CustomFont';
        src: url(https://cdn.example.com/fonts/custom.woff2) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result[0].isGoogleFont).toBe(false);
  });

  // ============================================================================
  // Relative URLs
  // ============================================================================

  it("resolves relative URLs against sourceURL", () => {
    const css = `
      @font-face {
        font-family: 'MyFont';
        src: url(../fonts/myfont.woff2) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, "https://example.com/css/styles.css");
    expect(result[0].src).toContain("https://example.com/fonts/myfont.woff2");
  });

  // ============================================================================
  // Multiple url() in single src
  // ============================================================================

  it("preserves multiple url() entries in src", () => {
    const css = `
      @font-face {
        font-family: 'MyFont';
        src: url(https://cdn.example.com/font.woff2) format('woff2'),
             url(https://cdn.example.com/font.woff) format('woff');
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result).toHaveLength(1);
    expect(result[0].src).toContain("font.woff2");
    expect(result[0].src).toContain("font.woff");
    expect(result[0].format).toBe("woff2"); // detects first format
  });

  // ============================================================================
  // Format detection
  // ============================================================================

  it("detects woff format", () => {
    const css = `
      @font-face {
        font-family: 'F';
        src: url(https://example.com/f.woff) format('woff');
      }
    `;
    expect(parseFontFaceRules(css, baseURL)[0].format).toBe("woff");
  });

  it("detects truetype (.ttf) format", () => {
    const css = `
      @font-face {
        font-family: 'F';
        src: url(https://example.com/f.ttf) format('truetype');
      }
    `;
    expect(parseFontFaceRules(css, baseURL)[0].format).toBe("truetype");
  });

  it("detects opentype (.otf) format", () => {
    const css = `
      @font-face {
        font-family: 'F';
        src: url(https://example.com/f.otf) format('opentype');
      }
    `;
    expect(parseFontFaceRules(css, baseURL)[0].format).toBe("opentype");
  });

  // ============================================================================
  // Missing weight/style defaults
  // ============================================================================

  it("defaults to weight=400, style=normal when missing", () => {
    const css = `
      @font-face {
        font-family: 'Simple';
        src: url(https://example.com/simple.woff2);
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result[0].weight).toBe("400");
    expect(result[0].style).toBe("normal");
  });

  // ============================================================================
  // Quoted and unquoted family names
  // ============================================================================

  it("handles double-quoted family name", () => {
    const css = `
      @font-face {
        font-family: "Averta Std Bold";
        src: url(https://example.com/averta.woff2);
      }
    `;
    expect(parseFontFaceRules(css, baseURL)[0].family).toBe("Averta Std Bold");
  });

  it("handles single-quoted family name", () => {
    const css = `
      @font-face {
        font-family: 'Averta Std Bold';
        src: url(https://example.com/averta.woff2);
      }
    `;
    expect(parseFontFaceRules(css, baseURL)[0].family).toBe("Averta Std Bold");
  });

  it("handles unquoted family name", () => {
    const css = `
      @font-face {
        font-family: AvertaStdBold;
        src: url(https://example.com/averta.woff2);
      }
    `;
    expect(parseFontFaceRules(css, baseURL)[0].family).toBe("AvertaStdBold");
  });

  // ============================================================================
  // Empty / no @font-face
  // ============================================================================

  it("returns empty array for empty CSS text", () => {
    expect(parseFontFaceRules("", baseURL)).toEqual([]);
  });

  it("returns empty array when no @font-face present", () => {
    const css = `
      body { font-family: Arial, sans-serif; }
      .container { display: flex; }
    `;
    expect(parseFontFaceRules(css, baseURL)).toEqual([]);
  });

  // ============================================================================
  // Data URI in src
  // ============================================================================

  it("preserves data URI in src as-is", () => {
    const css = `
      @font-face {
        font-family: 'InlineFont';
        src: url(data:font/woff2;base64,d09GMgABAAAA) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result[0].src).toContain("data:font/woff2;base64,d09GMgABAAAA");
  });

  // ============================================================================
  // Skips blocks without font-family
  // ============================================================================

  it("skips @font-face block without font-family", () => {
    const css = `
      @font-face {
        src: url(https://example.com/font.woff2);
      }
    `;
    expect(parseFontFaceRules(css, baseURL)).toEqual([]);
  });

  // ============================================================================
  // Realistic multi-font CSS (integration-style)
  // ============================================================================

  it("parses realistic Google Fonts CSS with unicode-range", () => {
    const css = `
      /* latin */
      @font-face {
        font-family: 'Source Sans 3';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/sourcesans3/v15/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EM.woff2) format('woff2');
        unicode-range: U+0000-00FF;
      }
      /* latin */
      @font-face {
        font-family: 'Source Sans 3';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/sourcesans3/v15/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EM-bold.woff2) format('woff2');
        unicode-range: U+0000-00FF;
      }
      /* cyrillic */
      @font-face {
        font-family: 'Source Sans 3';
        font-style: italic;
        font-weight: 400;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/sourcesans3/v15/cyrillic.woff2) format('woff2');
        unicode-range: U+0400-045F;
      }
    `;
    const result = parseFontFaceRules(css, baseURL);
    expect(result).toHaveLength(3);

    // All same family
    expect(result.every((f) => f.family === "Source Sans 3")).toBe(true);

    // Different variants
    expect(result[0]).toMatchObject({ weight: "400", style: "normal" });
    expect(result[1]).toMatchObject({ weight: "700", style: "normal" });
    expect(result[2]).toMatchObject({ weight: "400", style: "italic" });

    // All Google Fonts
    expect(result.every((f) => f.isGoogleFont)).toBe(true);
  });
});

// ============================================================================
// deduplicateFonts
// ============================================================================

describe("deduplicateFonts", () => {
  const makeFontFace = (
    family: string,
    weight = "400",
    style = "normal"
  ): ParsedFontFace => ({
    family,
    style,
    weight,
    src: `url(https://example.com/${family}-${weight}.woff2)`,
    format: "woff2",
    isGoogleFont: false,
  });

  it("removes true duplicates (same family+weight+style)", () => {
    const fonts = [
      makeFontFace("Inter", "400", "normal"),
      makeFontFace("Inter", "400", "normal"),
    ];
    expect(deduplicateFonts(fonts)).toHaveLength(1);
  });

  it("preserves different weights of same family", () => {
    const fonts = [
      makeFontFace("Inter", "400", "normal"),
      makeFontFace("Inter", "700", "normal"),
    ];
    expect(deduplicateFonts(fonts)).toHaveLength(2);
  });

  it("preserves different styles of same family", () => {
    const fonts = [
      makeFontFace("Inter", "400", "normal"),
      makeFontFace("Inter", "400", "italic"),
    ];
    expect(deduplicateFonts(fonts)).toHaveLength(2);
  });

  it("deduplicates case-insensitively on family name", () => {
    const fonts = [
      makeFontFace("Inter", "400", "normal"),
      makeFontFace("inter", "400", "normal"),
    ];
    expect(deduplicateFonts(fonts)).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateFonts([])).toEqual([]);
  });
});
