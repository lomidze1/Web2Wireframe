/**
 * Obfuscated Font Detection Tests
 *
 * Some sites use font obfuscation where familyName contains non-printable
 * characters or postScriptName is a hex pattern like "font0000000012345678".
 * These fonts should be detected and handled gracefully.
 */

import { describe, it, expect } from "vitest";
import { isObfuscatedFont } from "../font-utils";
import type { PlatformFontInfo } from "../types";

function makeFont(
  familyName: string,
  postScriptName: string,
  isCustomFont = true,
  glyphCount = 10
): PlatformFontInfo {
  return { familyName, postScriptName, isCustomFont, glyphCount };
}

describe("isObfuscatedFont", () => {
  it("detects non-printable chars in familyName", () => {
    expect(isObfuscatedFont(makeFont(".\x7F", "font000000002f7045b0"))).toBe(true);
  });

  it("returns false for normal font", () => {
    expect(isObfuscatedFont(makeFont("Roboto", "Roboto-Regular"))).toBe(false);
  });

  it("detects empty familyName with hex postScriptName", () => {
    expect(isObfuscatedFont(makeFont("", "font0000000012345678"))).toBe(true);
  });

  it("returns false for short but printable familyName", () => {
    // Single printable char with normal postScriptName
    expect(isObfuscatedFont(makeFont("A", "A"))).toBe(false);
  });

  it("detects hex-pattern postScriptName: font + 16 hex chars", () => {
    expect(isObfuscatedFont(makeFont("SomeFamily", "font000000002f7045b0"))).toBe(true);
  });

  it("returns false for postScriptName that starts with 'font' but isn't hex pattern", () => {
    expect(isObfuscatedFont(makeFont("FontAwesome", "FontAwesome5Free-Regular"))).toBe(false);
  });

  it("detects control characters (< 0x20) in familyName", () => {
    expect(isObfuscatedFont(makeFont("abc\x01def", "someFont"))).toBe(true);
  });

  it("detects DEL character (0x7F) in familyName", () => {
    expect(isObfuscatedFont(makeFont("font\x7F", "someFont"))).toBe(true);
  });

  it("detects whitespace-only familyName", () => {
    expect(isObfuscatedFont(makeFont("   ", "someFont"))).toBe(true);
  });

  it("returns false for normal custom web font", () => {
    expect(isObfuscatedFont(makeFont("PP Fragment Glare Medium", "PPFragmentGlare-Medium"))).toBe(false);
  });

  it("returns false for system fonts", () => {
    expect(isObfuscatedFont(makeFont("Arial", "ArialMT", false))).toBe(false);
  });
});
