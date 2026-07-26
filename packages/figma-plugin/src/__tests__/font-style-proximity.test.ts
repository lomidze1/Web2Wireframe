/**
 * Choosing a substitute CUT within the right family: closest weight wins.
 *
 * apple.com regression ("90% of the site is Black Italic"): the user's
 * SF Pro Display installs as [Black Italic, Light, Light Italic, Thin,
 * Thin Italic, Ultralight, Ultralight Italic] — no Regular. Every weight-400
 * node fell to the same-family rescue, which ranked every non-candidate style
 * EQUALLY and then relied on a stable sort — i.e. Figma's alphabetical order.
 * "Black Italic" sorts first, so a 400 upright paragraph rendered 900 italic.
 *
 * The fix reads the installed style NAMES back into numbers and picks the
 * nearest weight, with a penalty for flipping upright↔italic.
 */
import { describe, it, expect } from "vitest";
import { parseStyleName, orderStylesByProximity } from "../rendering/styles";

/** Exactly what Figma reports for the user's SF Pro Display (alphabetical). */
const SF_PRO_DISPLAY = [
  "Black Italic",
  "Light",
  "Light Italic",
  "Thin",
  "Thin Italic",
  "Ultralight",
  "Ultralight Italic",
];

describe("parseStyleName", () => {
  it("reads weight and slant out of a style name", () => {
    expect(parseStyleName("Regular")).toEqual({ weight: 400, italic: false });
    expect(parseStyleName("Black Italic")).toEqual({ weight: 900, italic: true });
    expect(parseStyleName("Light")).toEqual({ weight: 300, italic: false });
    expect(parseStyleName("Ultralight Italic")).toEqual({ weight: 200, italic: true });
    expect(parseStyleName("Thin")).toEqual({ weight: 100, italic: false });
    expect(parseStyleName("Medium")).toEqual({ weight: 500, italic: false });
  });

  it("prefers the compound token over its suffix", () => {
    // "Semibold"/"Extrabold" must not be read as plain "Bold" (700),
    // nor "Ultralight" as plain "Light" (300).
    expect(parseStyleName("Semibold").weight).toBe(600);
    expect(parseStyleName("Semi Bold").weight).toBe(600);
    expect(parseStyleName("DemiBold").weight).toBe(600);
    expect(parseStyleName("Extra Bold").weight).toBe(800);
    expect(parseStyleName("UltraLight").weight).toBe(200);
  });

  it("treats foundry-specific default cuts as regular", () => {
    expect(parseStyleName("Buch")).toEqual({ weight: 400, italic: false });
    expect(parseStyleName("Roman")).toEqual({ weight: 400, italic: false });
    expect(parseStyleName("Book")).toEqual({ weight: 400, italic: false });
  });

  it("recognises oblique as italic", () => {
    expect(parseStyleName("Oblique").italic).toBe(true);
    expect(parseStyleName("Bold Oblique")).toEqual({ weight: 700, italic: true });
  });

  it("falls back to Regular for names it can't read", () => {
    expect(parseStyleName("Kursiv Halbfett")).toEqual({ weight: 400, italic: false });
    expect(parseStyleName("")).toEqual({ weight: 400, italic: false });
  });
});

describe("orderStylesByProximity", () => {
  it("a 400 upright request picks Light, never Black Italic", () => {
    const ordered = orderStylesByProximity(SF_PRO_DISPLAY, 400, false);
    expect(ordered[0]).toBe("Light");
    expect(ordered[ordered.length - 1]).toBe("Black Italic");
  });

  it("an italic request prefers the italic cut at the same weight", () => {
    const ordered = orderStylesByProximity(SF_PRO_DISPLAY, 300, true);
    expect(ordered[0]).toBe("Light Italic");
  });

  it("an exact match always wins", () => {
    const ordered = orderStylesByProximity(["Black Italic", "Regular", "Light"], 400, false);
    expect(ordered[0]).toBe("Regular");
  });

  it("weight distance orders the upright cuts", () => {
    const ordered = orderStylesByProximity(["Ultralight", "Thin", "Light"], 400, false);
    expect(ordered).toEqual(["Light", "Ultralight", "Thin"]);
  });

  it("a heavy request keeps the heavy cut even when only its italic exists", () => {
    // 900 upright: Black Italic is the right mass with the wrong slant;
    // Ultralight would be a far bigger visual error.
    const ordered = orderStylesByProximity(SF_PRO_DISPLAY, 900, false);
    expect(ordered[0]).toBe("Black Italic");
  });

  it("slant only outranks weight when the weights are comparably close", () => {
    // 400 upright: Light (300, upright) beats Regular Italic (400, italic) —
    // one weight step is cheaper than flipping to italic.
    const ordered = orderStylesByProximity(["Regular Italic", "Light"], 400, false);
    expect(ordered[0]).toBe("Light");
  });

  it("keeps every style (ordering only, never dropping)", () => {
    const ordered = orderStylesByProximity(SF_PRO_DISPLAY, 400, false);
    expect(ordered.slice().sort()).toEqual(SF_PRO_DISPLAY.slice().sort());
  });

  it("is stable for equally-scored styles", () => {
    const ordered = orderStylesByProximity(["Normal", "Regular"], 400, false);
    expect(ordered).toEqual(["Normal", "Regular"]);
  });
});
