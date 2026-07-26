/**
 * Font CSS Parser Tests
 *
 * Tests parseFontFaceRules, deduplicateFonts, and resolveRelativeUrl
 * from the shared font-css-parser module.
 */

import { describe, it, expect } from "vitest";
import {
  parseFontFaceRules,
  deduplicateFonts,
  resolveRelativeUrl,
} from "../font-css-parser";

// ============================================================================
// resolveRelativeUrl
// ============================================================================

describe("resolveRelativeUrl", () => {
  it("resolves relative path against base URL", () => {
    expect(resolveRelativeUrl("../fonts/x.woff2", "https://example.com/css/style.css"))
      .toBe("https://example.com/fonts/x.woff2");
  });

  it("returns absolute URLs unchanged", () => {
    expect(resolveRelativeUrl("https://cdn.example.com/font.woff2", "https://example.com/"))
      .toBe("https://cdn.example.com/font.woff2");
  });

  it("returns data URIs unchanged", () => {
    const dataUri = "data:font/woff2;base64,AAAA";
    expect(resolveRelativeUrl(dataUri, "https://example.com/")).toBe(dataUri);
  });

  it("returns empty input unchanged", () => {
    expect(resolveRelativeUrl("", "https://example.com/")).toBe("");
  });
});

// ============================================================================
// parseFontFaceRules
// ============================================================================

describe("parseFontFaceRules", () => {
  it("parses basic @font-face (family, weight, style, src)", () => {
    const css = `
      @font-face {
        font-family: "Roboto";
        font-weight: 400;
        font-style: normal;
        src: url(https://example.com/roboto.woff2) format('woff2');
      }
    `;
    const result = parseFontFaceRules(css, "https://example.com/style.css");
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe("Roboto");
    expect(result[0].weight).toBe("400");
    expect(result[0].style).toBe("normal");
    expect(result[0].src).toContain("roboto.woff2");
    expect(result[0].format).toBe("woff2");
    expect(result[0].isGoogleFont).toBe(false);
    expect(result[0].sourceURL).toBe("https://example.com/style.css");
  });

  it("parses multiple @font-face blocks in one CSS", () => {
    const css = `
      @font-face {
        font-family: "Roboto";
        font-weight: 400;
        src: url(roboto-regular.woff2);
      }
      @font-face {
        font-family: "Roboto";
        font-weight: 700;
        src: url(roboto-bold.woff2);
      }
      @font-face {
        font-family: "Open Sans";
        font-weight: 400;
        src: url(opensans.woff2);
      }
    `;
    const result = parseFontFaceRules(css, "https://example.com/css/fonts.css");
    expect(result).toHaveLength(3);
    expect(result[0].family).toBe("Roboto");
    expect(result[0].weight).toBe("400");
    expect(result[1].family).toBe("Roboto");
    expect(result[1].weight).toBe("700");
    expect(result[2].family).toBe("Open Sans");
  });

  it("resolves relative URLs with baseUrl", () => {
    const css = `
      @font-face {
        font-family: "MyFont";
        src: url(../fonts/myfont.woff2);
      }
    `;
    const result = parseFontFaceRules(css, "https://example.com/css/style.css");
    expect(result[0].src).toContain("https://example.com/fonts/myfont.woff2");
  });

  it("detects Google Font from fonts.gstatic.com", () => {
    const css = `
      @font-face {
        font-family: "Roboto";
        src: url(https://fonts.gstatic.com/s/roboto/v30/roboto.woff2);
      }
    `;
    const result = parseFontFaceRules(css, "");
    expect(result[0].isGoogleFont).toBe(true);
  });

  it("reads the LAST src declaration (bulletproof @font-face)", () => {
    // apple.com declares SF Pro Text Regular — and only Regular — with the
    // legacy "bulletproof" pattern: an IE-only EOT src first, the real
    // formats second. CSS applies the last declaration; reading the first
    // left the face with a dead EOT URL, so Regular never reached the font
    // download while every single-src cut did.
    const css = `
      @font-face {
        font-family: 'SF Pro Text';
        font-style: normal;
        font-weight: 400;
        src: url('/wss/fonts/SF-Pro-Text/v3/sf-pro-text_regular.eot');
        src: local('☺'), url("/wss/fonts/SF-Pro-Text/v3/sf-pro-text_regular.woff2") format("woff2"), url("/wss/fonts/SF-Pro-Text/v3/sf-pro-text_regular.ttf") format("truetype");
      }
    `;
    const result = parseFontFaceRules(css, "https://www.apple.com/wss/fonts");

    expect(result).toHaveLength(1);
    expect(result[0].src).toContain("sf-pro-text_regular.woff2");
    expect(result[0].src).toContain("sf-pro-text_regular.ttf");
    expect(result[0].src).not.toContain(".eot");
    expect(result[0].format).toBe("woff2");
  });

  it("still reads a single src declaration unchanged", () => {
    const css = `
      @font-face {
        font-family: 'SF Pro Text';
        font-weight: 300;
        src: local('☺'), url("/fonts/sf-pro-text_light.woff2") format("woff2");
      }
    `;
    const result = parseFontFaceRules(css, "https://www.apple.com/");
    expect(result[0].src).toContain("sf-pro-text_light.woff2");
  });

  it("preserves data URI in src", () => {
    const dataUri = "data:font/woff2;base64,d09GRgABAAAA";
    const css = `
      @font-face {
        font-family: "InlineFont";
        src: url(${dataUri});
      }
    `;
    const result = parseFontFaceRules(css, "https://example.com/");
    expect(result[0].src).toContain(dataUri);
  });

  it("returns empty array for empty/malformed CSS", () => {
    expect(parseFontFaceRules("", "")).toEqual([]);
    expect(parseFontFaceRules("body { color: red; }", "")).toEqual([]);
    expect(parseFontFaceRules("@font-face { }", "")).toEqual([]); // no font-family
  });
});

// ============================================================================
// deduplicateFonts
// ============================================================================

describe("deduplicateFonts", () => {
  it("removes true duplicates by family+weight+style", () => {
    const fonts = [
      { family: "Roboto", weight: "400", style: "normal", src: "a.woff2", format: "woff2", isGoogleFont: false },
      { family: "Roboto", weight: "400", style: "normal", src: "b.woff2", format: "woff2", isGoogleFont: false },
    ];
    const result = deduplicateFonts(fonts);
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe("a.woff2"); // first-seen wins
  });

  it("preserves different weights of the same family", () => {
    const fonts = [
      { family: "Roboto", weight: "400", style: "normal", src: "a.woff2", format: "woff2", isGoogleFont: false },
      { family: "Roboto", weight: "700", style: "normal", src: "b.woff2", format: "woff2", isGoogleFont: false },
    ];
    const result = deduplicateFonts(fonts);
    expect(result).toHaveLength(2);
  });

  it("preserves different styles of the same family+weight", () => {
    const fonts = [
      { family: "Roboto", weight: "400", style: "normal", src: "a.woff2", format: "woff2", isGoogleFont: false },
      { family: "Roboto", weight: "400", style: "italic", src: "b.woff2", format: "woff2", isGoogleFont: false },
    ];
    const result = deduplicateFonts(fonts);
    expect(result).toHaveLength(2);
  });

  it("is case-insensitive on family name", () => {
    const fonts = [
      { family: "Roboto", weight: "400", style: "normal", src: "a.woff2", format: "woff2", isGoogleFont: false },
      { family: "roboto", weight: "400", style: "normal", src: "b.woff2", format: "woff2", isGoogleFont: false },
    ];
    const result = deduplicateFonts(fonts);
    expect(result).toHaveLength(1);
  });
});
