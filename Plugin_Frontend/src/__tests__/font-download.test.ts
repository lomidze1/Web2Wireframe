/**
 * Font Download Utils Tests (Phase 4)
 *
 * Tests for parsing font URLs from CSS @font-face src declarations
 * and building download info for missing fonts.
 */

import { describe, it, expect } from "vitest";
import { parseFontSrcUrls } from "../utils/fontUtils";

describe("parseFontSrcUrls", () => {
  it("should extract URLs from CSS src with single url()", () => {
    const src = "url('https://fonts.example.com/font.woff2') format('woff2')";
    const urls = parseFontSrcUrls(src);
    expect(urls).toEqual(["https://fonts.example.com/font.woff2"]);
  });

  it("should extract multiple URLs from CSS src", () => {
    const src =
      "url('https://fonts.example.com/font.woff2') format('woff2'), " +
      "url('https://fonts.example.com/font.woff') format('woff')";
    const urls = parseFontSrcUrls(src);
    expect(urls).toEqual([
      "https://fonts.example.com/font.woff2",
      "https://fonts.example.com/font.woff",
    ]);
  });

  it("should handle URLs without quotes", () => {
    const src = "url(https://fonts.example.com/font.woff2) format('woff2')";
    const urls = parseFontSrcUrls(src);
    expect(urls).toEqual(["https://fonts.example.com/font.woff2"]);
  });

  it("should handle URLs with double quotes", () => {
    const src = 'url("https://fonts.example.com/font.woff2") format("woff2")';
    const urls = parseFontSrcUrls(src);
    expect(urls).toEqual(["https://fonts.example.com/font.woff2"]);
  });

  it("should ignore data URIs", () => {
    const src =
      "url(data:font/woff2;base64,d09GMg...) format('woff2'), " +
      "url('https://fonts.example.com/font.woff') format('woff')";
    const urls = parseFontSrcUrls(src);
    expect(urls).toEqual(["https://fonts.example.com/font.woff"]);
  });

  it("should return empty array for empty src", () => {
    expect(parseFontSrcUrls("")).toEqual([]);
  });

  it("should return empty array for src with only data URIs", () => {
    const src = "url(data:font/woff2;base64,abc123) format('woff2')";
    expect(parseFontSrcUrls(src)).toEqual([]);
  });

  it("should handle Google Fonts CDN URLs", () => {
    const src = "url(https://fonts.gstatic.com/s/inter/v13/UcCO3Fwrk3iLTcviYwY.woff2) format('woff2')";
    const urls = parseFontSrcUrls(src);
    expect(urls).toEqual(["https://fonts.gstatic.com/s/inter/v13/UcCO3Fwrk3iLTcviYwY.woff2"]);
  });
});
