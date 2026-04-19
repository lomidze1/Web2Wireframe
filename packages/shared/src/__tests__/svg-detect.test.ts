/**
 * svg-detect utilities — unit tests
 * Written BEFORE implementation (TDD).
 */

import { describe, it, expect } from "vitest";
import { isSvgUrl, isSvgMime, isSvgMarkup } from "../svg-detect";

describe("isSvgUrl", () => {
  it("matches .svg extension", () => {
    expect(isSvgUrl("/logo.svg")).toBe(true);
    expect(isSvgUrl("https://example.com/icons/check.svg")).toBe(true);
  });

  it("matches .svg with query string", () => {
    expect(isSvgUrl("/logo.svg?v=1")).toBe(true);
    expect(isSvgUrl("/logo.svg?hash=abc123&w=64")).toBe(true);
  });

  it("matches .svg with hash fragment", () => {
    expect(isSvgUrl("/sprite.svg#icon-home")).toBe(true);
  });

  it("matches data:image/svg+xml URIs", () => {
    expect(isSvgUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBe(true);
    expect(isSvgUrl("data:image/svg+xml;utf8,<svg/>")).toBe(true);
  });

  it("rejects non-svg extensions", () => {
    expect(isSvgUrl("/pic.png")).toBe(false);
    expect(isSvgUrl("/photo.jpg")).toBe(false);
    expect(isSvgUrl("/video.mp4")).toBe(false);
  });

  it("rejects non-svg data URIs", () => {
    expect(isSvgUrl("data:image/png;base64,iVBOR")).toBe(false);
  });

  it("is case-insensitive for extension", () => {
    expect(isSvgUrl("/Logo.SVG")).toBe(true);
    expect(isSvgUrl("/PIC.Svg?x=1")).toBe(true);
  });

  it("handles empty or invalid input", () => {
    expect(isSvgUrl("")).toBe(false);
    expect(isSvgUrl(undefined)).toBe(false);
    expect(isSvgUrl(null as unknown as string)).toBe(false);
  });
});

describe("isSvgMime", () => {
  it("matches image/svg+xml exactly", () => {
    expect(isSvgMime("image/svg+xml")).toBe(true);
  });

  it("matches image/svg+xml with charset", () => {
    expect(isSvgMime("image/svg+xml; charset=utf-8")).toBe(true);
    expect(isSvgMime("image/svg+xml;charset=UTF-8")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSvgMime("Image/SVG+XML")).toBe(true);
  });

  it("rejects other mime types", () => {
    expect(isSvgMime("image/png")).toBe(false);
    expect(isSvgMime("image/jpeg")).toBe(false);
    expect(isSvgMime("text/xml")).toBe(false);
  });

  it("handles empty or invalid input", () => {
    expect(isSvgMime("")).toBe(false);
    expect(isSvgMime(undefined)).toBe(false);
  });
});

describe("isSvgMarkup", () => {
  it("detects <svg> opening tag", () => {
    expect(isSvgMarkup("<svg xmlns='http://www.w3.org/2000/svg'/>")).toBe(true);
    expect(isSvgMarkup("<svg width='24' height='24'><path/></svg>")).toBe(true);
  });

  it("detects xml prolog + svg", () => {
    expect(isSvgMarkup('<?xml version="1.0"?><svg/>')).toBe(true);
  });

  it("tolerates leading whitespace", () => {
    expect(isSvgMarkup("   <svg/>")).toBe(true);
    expect(isSvgMarkup("\n\t<svg/>")).toBe(true);
  });

  it("rejects non-SVG markup", () => {
    expect(isSvgMarkup("<div>hello</div>")).toBe(false);
    expect(isSvgMarkup("<html><body/></html>")).toBe(false);
    expect(isSvgMarkup("plain text")).toBe(false);
  });

  it("rejects data URIs (URL-like strings)", () => {
    expect(isSvgMarkup("data:image/svg+xml;base64,PHN2Zy8+")).toBe(false);
  });

  it("handles empty or invalid input", () => {
    expect(isSvgMarkup("")).toBe(false);
    expect(isSvgMarkup(undefined)).toBe(false);
  });
});
