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

// ============================================================================
// გაფუჭებული `name` ცხრილი — საავტორო ტექსტი ოჯახის სახელის ველში
// ============================================================================

/**
 * ზოგიერთ ფონტს `name` ცხრილში ოჯახის ველი (ID 1) საავტორო სტრიქონით აქვს
 * შევსებული. Chromium მას პატიოსნად აბრუნებს, ჩვენ კი ფონტის სახელად
 * ვასაღებდით — მომხმარებელს „Fonts Not Available" სიაში ეწერა:
 *
 *   Copyright Klim Type Foundry
 *
 * გაზომილი stripe.com-ზე:
 *   familyName="Copyright Klim Type Foundry"  postScript="SohneVF-Buch"
 *   isCustomFont=true  glyphs=2751
 *
 * ასეთი სახელი უნდა უარვყოთ, რომ CSS-ში დეკლარირებულ სახელზე (`sohne-var`)
 * გადავიდეთ.
 */
describe("isObfuscatedFont — საავტორო ტექსტი ოჯახის სახელად", () => {
  it("იჭერს stripe.com-ის რეალურ შემთხვევას", () => {
    expect(
      isObfuscatedFont(makeFont("Copyright Klim Type Foundry", "SohneVF-Buch", true, 2751)),
    ).toBe(true);
  });

  it("იჭერს © სიმბოლოს ოჯახის სახელში", () => {
    expect(isObfuscatedFont(makeFont("© 2024 Some Foundry", "Some-Regular"))).toBe(true);
  });

  it("იჭერს (c) ფორმას", () => {
    expect(isObfuscatedFont(makeFont("(c) Type Company", "Type-Regular"))).toBe(true);
  });

  it("იჭერს all rights reserved-ს", () => {
    expect(
      isObfuscatedFont(makeFont("Acme Type. All Rights Reserved.", "Acme-Regular")),
    ).toBe(true);
  });

  // ⬇️ ცრუ დადებითის დაცვა: ესენი ნამდვილი ფონტების სახელებია და უნდა გაიაროს
  it("არ იჭერს ნამდვილ ოჯახს, სადაც სიტყვა Foundry გვხვდება", () => {
    // "Foundry Sterling" — The Foundry-ს რეალური გარნიტურაა
    expect(isObfuscatedFont(makeFont("Foundry Sterling", "FoundrySterling-Book"))).toBe(false);
  });

  it("არ იჭერს ნამდვილ ოჯახს სიტყვა Type-ით", () => {
    expect(isObfuscatedFont(makeFont("Klim Type Sohne", "SohneVF-Buch"))).toBe(false);
  });

  it("არ იჭერს ოჯახს, რომელიც უბრალოდ ასო c-ით იწყება", () => {
    expect(isObfuscatedFont(makeFont("Cormorant Garamond", "Cormorant-Regular"))).toBe(false);
  });
});
