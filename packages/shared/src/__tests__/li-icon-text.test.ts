/**
 * Tests for <li> elements with icon font children + text content.
 * Bug: Icon font glyphs (Unicode Private Use Area) were treated as "text content"
 * by hasChildrenWithText check, preventing synthetic text child creation.
 */
import { describe, it, expect } from "vitest";
import { isIconGlyph } from "../tree-builder";

describe("isIconGlyph", () => {
  // Font Awesome glyphs (Private Use Area U+E000–U+F8FF)
  it("detects Font Awesome glyph \\uF5FD (fa-layer-group)", () => {
    expect(isIconGlyph("\uF5FD")).toBe(true);
  });

  it("detects Font Awesome glyph \\uF03E (fa-image)", () => {
    expect(isIconGlyph("\uF03E")).toBe(true);
  });

  it("detects Font Awesome glyph \\uF86D (fa-icons)", () => {
    expect(isIconGlyph("\uF86D")).toBe(true);
  });

  it("detects start of PUA range \\uE000", () => {
    expect(isIconGlyph("\uE000")).toBe(true);
  });

  it("detects end of PUA range \\uF8FF", () => {
    expect(isIconGlyph("\uF8FF")).toBe(true);
  });

  // Supplementary PUA (U+F0000–U+FFFFD, U+100000–U+10FFFD)
  it("detects Supplementary PUA-A glyph", () => {
    expect(isIconGlyph(String.fromCodePoint(0xF0001))).toBe(true);
  });

  // Non-icon text
  it("rejects normal text '6 Sections'", () => {
    expect(isIconGlyph("6 Sections")).toBe(false);
  });

  it("rejects single letter 'A'", () => {
    expect(isIconGlyph("A")).toBe(false);
  });

  it("rejects number '1'", () => {
    expect(isIconGlyph("1")).toBe(false);
  });

  it("rejects emoji '😀'", () => {
    expect(isIconGlyph("😀")).toBe(false);
  });

  // Edge cases
  it("rejects empty string", () => {
    expect(isIconGlyph("")).toBe(false);
  });

  it("rejects multi-character string with icon glyph", () => {
    // "icon + text" should NOT be treated as icon glyph
    expect(isIconGlyph("\uF5FD Some text")).toBe(false);
  });
});
