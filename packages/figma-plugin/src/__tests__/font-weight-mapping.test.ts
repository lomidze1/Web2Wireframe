/**
 * Font weight → Figma style name mapping.
 *
 * CSS font-weight uses a 9-step scale (100…900). Figma uses named styles
 * (Thin/ExtraLight/Light/Regular/Medium/Semibold/Bold/ExtraBold/Black).
 *
 * Bug being fixed: previously `fontWeightToStyle(600)` returned "Bold",
 * causing semibold web text (very common — most navs/buttons use 600) to
 * render too heavy in Figma. The CSS standard for 600 is **SemiBold**.
 */
import { describe, it, expect } from "vitest";
import {
  fontWeightToStyle,
  fontWeightToStyleCandidates,
  fontStyleCandidates,
  isItalicStyle,
} from "../rendering/styles";

describe("isItalicStyle", () => {
  it("detects italic / oblique (case-insensitive), ignores upright", () => {
    expect(isItalicStyle("italic")).toBe(true);
    expect(isItalicStyle("Italic")).toBe(true);
    expect(isItalicStyle("oblique")).toBe(true);
    expect(isItalicStyle("normal")).toBe(false);
    expect(isItalicStyle(undefined)).toBe(false);
    expect(isItalicStyle(null)).toBe(false);
    expect(isItalicStyle("")).toBe(false);
  });
});

describe("fontStyleCandidates", () => {
  it("returns the plain weight candidates when not italic", () => {
    expect(fontStyleCandidates(400, false)).toEqual(
      fontWeightToStyleCandidates(400),
    );
  });

  it("tries 'Italic' first for a regular-weight italic run (Newsreader case)", () => {
    const c = fontStyleCandidates(400, true);
    expect(c[0]).toBe("Italic");
    // Upright cuts are kept only as a last resort.
    expect(c.indexOf("Italic")).toBeLessThan(c.indexOf("Regular"));
  });

  it("produces weight+Italic forms for heavier italic runs", () => {
    const c = fontStyleCandidates(700, true);
    expect(c).toContain("Bold Italic");
    expect(c).toContain("Italic");
    // Falls back to upright Bold if no italic cut exists.
    expect(c).toContain("Bold");
  });

  it("never returns duplicates", () => {
    const c = fontStyleCandidates(400, true);
    expect(new Set(c).size).toBe(c.length);
  });
});

describe("fontWeightToStyle — CSS 9-step mapping", () => {
  it("100 → Thin", () => expect(fontWeightToStyle(100)).toBe("Thin"));
  it("200 → ExtraLight", () => expect(fontWeightToStyle(200)).toBe("ExtraLight"));
  it("300 → Light", () => expect(fontWeightToStyle(300)).toBe("Light"));
  it("400 → Regular", () => expect(fontWeightToStyle(400)).toBe("Regular"));
  it("500 → Medium", () => expect(fontWeightToStyle(500)).toBe("Medium"));
  it("600 → Semibold (the bug)", () => expect(fontWeightToStyle(600)).toBe("Semibold"));
  it("700 → Bold", () => expect(fontWeightToStyle(700)).toBe("Bold"));
  it("800 → ExtraBold", () => expect(fontWeightToStyle(800)).toBe("ExtraBold"));
  it("900 → Black", () => expect(fontWeightToStyle(900)).toBe("Black"));
});

describe("fontWeightToStyleCandidates — fallback chain", () => {
  it("returns preferred style first", () => {
    expect(fontWeightToStyleCandidates(600)[0]).toBe("Semibold");
    expect(fontWeightToStyleCandidates(700)[0]).toBe("Bold");
    expect(fontWeightToStyleCandidates(400)[0]).toBe("Regular");
  });

  it("600 includes alternative Semibold spellings before any neighbour weight", () => {
    const c = fontWeightToStyleCandidates(600);
    expect(c).toContain("Semibold");
    expect(c).toContain("SemiBold");
    expect(c).toContain("Semi Bold");
    // All Semibold spellings must come before Medium and Bold
    const lastSemibold = Math.max(
      c.indexOf("Semibold"),
      c.indexOf("SemiBold"),
      c.indexOf("Semi Bold"),
      c.indexOf("DemiBold"),
      c.indexOf("Demi Bold"),
    );
    expect(lastSemibold).toBeLessThan(c.indexOf("Medium"));
    expect(lastSemibold).toBeLessThan(c.indexOf("Bold"));
  });

  it("600 prefers Medium over Bold when no Semibold variant available", () => {
    // Perceptual closeness: lighter neighbour beats heavier neighbour.
    // Going heavier (Bold) overshoots; Medium reads truer to the source.
    const c = fontWeightToStyleCandidates(600);
    expect(c.indexOf("Medium")).toBeLessThan(c.indexOf("Bold"));
  });

  it("700 falls back to Semibold (with spellings) before ExtraBold", () => {
    const c = fontWeightToStyleCandidates(700);
    expect(c[0]).toBe("Bold");
    expect(c).toContain("Semibold");
    expect(c).toContain("SemiBold");
    expect(c.indexOf("Semibold")).toBeLessThan(c.indexOf("ExtraBold"));
  });

  it("400 (Regular) includes Normal/Book aliases", () => {
    const c = fontWeightToStyleCandidates(400);
    expect(c[0]).toBe("Regular");
    expect(c).toContain("Normal");
    expect(c).toContain("Book");
  });

  it("300 (Light) falls back to ExtraLight or Regular", () => {
    const c = fontWeightToStyleCandidates(300);
    expect(c[0]).toBe("Light");
    expect(c).toContain("Regular");
    expect(c).toContain("ExtraLight");
    expect(c).toContain("Extra Light");
  });

  it("200 (ExtraLight) prefers Thin over Light when ExtraLight missing", () => {
    // Perceptual closeness: lighter neighbour (Thin 100) beats heavier (Light 300).
    // Same rule as 600 — don't overshoot by falling to a heavier weight.
    const c = fontWeightToStyleCandidates(200);
    expect(c[0]).toBe("ExtraLight");
    expect(c).toContain("Extra Light");
    expect(c).toContain("Thin");
    expect(c).toContain("Light");
    expect(c.indexOf("Thin")).toBeLessThan(c.indexOf("Light"));
  });

  it("800 (ExtraBold) includes Extra Bold and UltraBold spellings", () => {
    const c = fontWeightToStyleCandidates(800);
    expect(c[0]).toBe("ExtraBold");
    expect(c).toContain("Extra Bold");
    expect(c).toContain("UltraBold");
    expect(c).toContain("Bold");
  });

  it("900 (Black) falls back to ExtraBold or Bold; includes Heavy alias", () => {
    const c = fontWeightToStyleCandidates(900);
    expect(c[0]).toBe("Black");
    expect(c).toContain("Heavy");
    expect(c).toContain("Bold");
  });

  it("never returns an empty list", () => {
    for (let w = 100; w <= 900; w += 50) {
      expect(fontWeightToStyleCandidates(w).length).toBeGreaterThan(0);
    }
  });
});

describe("fontWeightToStyle — boundary values", () => {
  // Boundaries should bucket conservatively (lean toward the lighter side)
  it("550 → Medium (boundary)", () => expect(fontWeightToStyle(550)).toBe("Medium"));
  it("551 → Semibold", () => expect(fontWeightToStyle(551)).toBe("Semibold"));
  it("650 → Semibold (boundary)", () => expect(fontWeightToStyle(650)).toBe("Semibold"));
  it("651 → Bold", () => expect(fontWeightToStyle(651)).toBe("Bold"));
});
