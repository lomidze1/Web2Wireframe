/**
 * Icon-run detection must cover every code-point range html.to.design treats
 * as icon-like, not just the BMP Private Use Area.
 *
 * h2d's detector (`FC`, app.js:23184) accepts runs drawn entirely from:
 *   U+0000-U+001F     (C0 controls)
 *   U+007F-U+009F     (DEL + C1 controls)
 *   U+E000-U+F8FF     (BMP PUA)
 *   U+F0000-U+FFFFD   (Supplementary PUA-A)
 *   U+100000-U+10FFFD (Supplementary PUA-B)
 *
 * We only covered the BMP range, so icon fonts that map their glyphs into the
 * supplementary planes (common for large icon sets) were not recognised as
 * icons and were allowed to fall back to a text font — mojibake.
 */
import { describe, it, expect } from "vitest";
import { isPuaOnlyText } from "../utils/fontUtils";

describe("isPuaOnlyText — h2d code-point ranges", () => {
  it("accepts BMP PUA (U+E000-U+F8FF) boundaries", () => {
    expect(isPuaOnlyText("\u{E000}")).toBe(true);
    expect(isPuaOnlyText("\u{F8FF}")).toBe(true);
  });

  it("accepts Supplementary PUA-A (U+F0000-U+FFFFD)", () => {
    expect(isPuaOnlyText("\u{F0000}")).toBe(true);
    expect(isPuaOnlyText("\u{F0123}")).toBe(true);
    expect(isPuaOnlyText("\u{FFFFD}")).toBe(true);
  });

  it("accepts Supplementary PUA-B (U+100000-U+10FFFD)", () => {
    expect(isPuaOnlyText("\u{100000}")).toBe(true);
    expect(isPuaOnlyText("\u{10FFFD}")).toBe(true);
  });

  it("accepts C0 and C1 control ranges", () => {
    expect(isPuaOnlyText("\u{0001}")).toBe(true);
    expect(isPuaOnlyText("\u{001F}")).toBe(true);
    expect(isPuaOnlyText("\u{007F}")).toBe(true);
    expect(isPuaOnlyText("\u{009F}")).toBe(true);
  });

  it("accepts a mix of the accepted ranges, ignoring whitespace", () => {
    expect(isPuaOnlyText(" \u{E600} \u{F0001} \u{100001} ")).toBe(true);
  });

  it("rejects code points just outside every accepted range", () => {
    expect(isPuaOnlyText("\u{F900}")).toBe(false);   // just past BMP PUA
    expect(isPuaOnlyText("\u{DFFF}")).toBe(false);   // lone surrogate
    expect(isPuaOnlyText("\u{EFFFF}")).toBe(false);  // just below PUA-A
    expect(isPuaOnlyText("\u{FFFFE}")).toBe(false);  // just past PUA-A
    expect(isPuaOnlyText("\u{10FFFE}")).toBe(false); // just past PUA-B
    expect(isPuaOnlyText("\u{00A1}")).toBe(false);   // just past C1
  });

  it("keeps existing semantics: whitespace-only and empty are not icon runs", () => {
    expect(isPuaOnlyText("")).toBe(false);
    expect(isPuaOnlyText("   ")).toBe(false);
    expect(isPuaOnlyText("\t\n")).toBe(false);
    expect(isPuaOnlyText("\u{F0001} search")).toBe(false);
  });
});
