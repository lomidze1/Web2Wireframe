/**
 * Unit tests for the list-marker counter engine.
 *
 * The counter engine is a pure function that — given a list-style-type, a
 * 0-based index, an `<ol start="N">` value, `<ol reversed>` flag, total item
 * count, and optional `<li value="N">` override — returns the exact marker
 * string the browser would render (e.g. "1.", "iv.", "a.", "•", "").
 *
 * These tests define the spec for `formatListMarker` and `computeListMarkers`,
 * to be implemented in `packages/shared/src/list-markers.ts`.
 *
 * Reference: https://drafts.csswg.org/css-counter-styles-3/
 *            https://html.spec.whatwg.org/multipage/grouping-content.html#the-ol-element
 */

import { describe, it, expect } from "vitest";
import {
  formatListMarker,
  computeListMarkers,
  type ListContainerSpec,
} from "../list-markers";

// ============================================================================
// formatListMarker — bullet styles
// ============================================================================

describe("formatListMarker — bullet styles", () => {
  it("disc → •", () => {
    expect(formatListMarker({ listStyleType: "disc", index: 0 })).toBe("•");
    expect(formatListMarker({ listStyleType: "disc", index: 42 })).toBe("•");
  });

  it("circle → ○", () => {
    expect(formatListMarker({ listStyleType: "circle", index: 0 })).toBe("○");
  });

  it("square → ▪ (U+25AA, matches browser rendering)", () => {
    // Browsers render CSS `square` as U+25AA BLACK SMALL SQUARE, not U+25A0.
    expect(formatListMarker({ listStyleType: "square", index: 0 })).toBe("▪");
  });

  it("none → empty string (no marker at all)", () => {
    expect(formatListMarker({ listStyleType: "none", index: 0 })).toBe("");
    expect(formatListMarker({ listStyleType: "none", index: 99 })).toBe("");
  });

  it("unknown style falls back to disc", () => {
    expect(formatListMarker({ listStyleType: "not-a-real-style", index: 0 })).toBe("•");
    expect(formatListMarker({ listStyleType: "", index: 0 })).toBe("•");
  });
});

// ============================================================================
// formatListMarker — decimal + decimal-leading-zero
// ============================================================================

describe("formatListMarker — decimal", () => {
  it("index 0 → '1.'", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0 })).toBe("1.");
  });

  it("index 9 → '10.'", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 9 })).toBe("10.");
  });

  it("index 99 → '100.'", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 99 })).toBe("100.");
  });

  it("honors start=5 (index 0 → '5.')", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0, start: 5 })).toBe("5.");
    expect(formatListMarker({ listStyleType: "decimal", index: 2, start: 5 })).toBe("7.");
  });

  it("honors negative start (index 0, start=-2 → '-2.')", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0, start: -2 })).toBe("-2.");
    expect(formatListMarker({ listStyleType: "decimal", index: 3, start: -2 })).toBe("1.");
  });

  it("reversed + total=3: index 0 → '3.', index 2 → '1.'", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0, reversed: true, total: 3 })).toBe("3.");
    expect(formatListMarker({ listStyleType: "decimal", index: 1, reversed: true, total: 3 })).toBe("2.");
    expect(formatListMarker({ listStyleType: "decimal", index: 2, reversed: true, total: 3 })).toBe("1.");
  });

  it("reversed with explicit start=10 counts down from 10", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0, reversed: true, start: 10, total: 4 })).toBe("10.");
    expect(formatListMarker({ listStyleType: "decimal", index: 3, reversed: true, start: 10, total: 4 })).toBe("7.");
  });

  it("valueOverride resets the counter at this index", () => {
    // valueOverride behaves like <li value="20">: this item is "20.", next is "21."
    expect(formatListMarker({ listStyleType: "decimal", index: 0, valueOverride: 20 })).toBe("20.");
  });

  it("decimal-leading-zero pads to match total width (single-digit total → 2 digits)", () => {
    // Per spec, padding width is based on total count's digit width, minimum 2.
    expect(formatListMarker({ listStyleType: "decimal-leading-zero", index: 0, total: 5 })).toBe("01.");
    expect(formatListMarker({ listStyleType: "decimal-leading-zero", index: 8, total: 9 })).toBe("09.");
  });

  it("decimal-leading-zero with 10-99 total pads to 2 digits", () => {
    expect(formatListMarker({ listStyleType: "decimal-leading-zero", index: 0, total: 12 })).toBe("01.");
    expect(formatListMarker({ listStyleType: "decimal-leading-zero", index: 11, total: 12 })).toBe("12.");
  });

  it("decimal-leading-zero with 100+ total pads to 3 digits", () => {
    expect(formatListMarker({ listStyleType: "decimal-leading-zero", index: 0, total: 100 })).toBe("001.");
    expect(formatListMarker({ listStyleType: "decimal-leading-zero", index: 99, total: 100 })).toBe("100.");
  });
});

// ============================================================================
// formatListMarker — alpha
// ============================================================================

describe("formatListMarker — lower-alpha / lower-latin", () => {
  it("index 0 → 'a.'", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 0 })).toBe("a.");
    expect(formatListMarker({ listStyleType: "lower-latin", index: 0 })).toBe("a.");
  });

  it("index 25 → 'z.'", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 25 })).toBe("z.");
  });

  it("index 26 → 'aa.' (wraps like spreadsheet column names)", () => {
    // Per CSS counter-styles spec, alphabetic systems use bijective base-26.
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 26 })).toBe("aa.");
  });

  it("index 27 → 'ab.'", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 27 })).toBe("ab.");
  });

  it("index 51 → 'az.'", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 51 })).toBe("az.");
  });

  it("index 52 → 'ba.'", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 52 })).toBe("ba.");
  });

  it("index 701 → 'zz.' (last 2-letter)", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 701 })).toBe("zz.");
  });

  it("index 702 → 'aaa.' (first 3-letter)", () => {
    expect(formatListMarker({ listStyleType: "lower-alpha", index: 702 })).toBe("aaa.");
  });
});

describe("formatListMarker — upper-alpha / upper-latin", () => {
  it("index 0 → 'A.'", () => {
    expect(formatListMarker({ listStyleType: "upper-alpha", index: 0 })).toBe("A.");
    expect(formatListMarker({ listStyleType: "upper-latin", index: 0 })).toBe("A.");
  });

  it("index 25 → 'Z.'", () => {
    expect(formatListMarker({ listStyleType: "upper-alpha", index: 25 })).toBe("Z.");
  });

  it("index 26 → 'AA.'", () => {
    expect(formatListMarker({ listStyleType: "upper-alpha", index: 26 })).toBe("AA.");
  });
});

// ============================================================================
// formatListMarker — roman
// ============================================================================

describe("formatListMarker — lower-roman", () => {
  it.each([
    [0, "i."],
    [1, "ii."],
    [2, "iii."],
    [3, "iv."],
    [4, "v."],
    [5, "vi."],
    [6, "vii."],
    [7, "viii."],
    [8, "ix."],
    [9, "x."],
    [13, "xiv."],
    [38, "xxxix."],
    [39, "xl."],
    [48, "xlix."],
    [49, "l."],
    [88, "lxxxix."],
    [89, "xc."],
    [98, "xcix."],
    [99, "c."],
    [498, "cdxcix."],
    [499, "d."],
    [898, "dcccxcix."],
    [899, "cm."],  // n=900 → CM
    [998, "cmxcix."], // n=999
    [3998, "mmmcmxcix."],
  ])("index %d → %s", (index, expected) => {
    expect(formatListMarker({ listStyleType: "lower-roman", index })).toBe(expected);
  });
});

describe("formatListMarker — upper-roman", () => {
  it("matches lower-roman but uppercase", () => {
    expect(formatListMarker({ listStyleType: "upper-roman", index: 0 })).toBe("I.");
    expect(formatListMarker({ listStyleType: "upper-roman", index: 3 })).toBe("IV.");
    expect(formatListMarker({ listStyleType: "upper-roman", index: 8 })).toBe("IX.");
    expect(formatListMarker({ listStyleType: "upper-roman", index: 48 })).toBe("XLIX.");
  });

  it("honors start=10 (index 0 → 'X.')", () => {
    expect(formatListMarker({ listStyleType: "upper-roman", index: 0, start: 10 })).toBe("X.");
  });

  it("reversed roman", () => {
    expect(formatListMarker({ listStyleType: "upper-roman", index: 0, reversed: true, total: 5 })).toBe("V.");
    expect(formatListMarker({ listStyleType: "upper-roman", index: 4, reversed: true, total: 5 })).toBe("I.");
  });
});

// ============================================================================
// formatListMarker — extended counter styles
// ============================================================================

describe("formatListMarker — lower-greek", () => {
  it("index 0 → 'α.'", () => {
    expect(formatListMarker({ listStyleType: "lower-greek", index: 0 })).toBe("α.");
  });

  it("index 1 → 'β.'", () => {
    expect(formatListMarker({ listStyleType: "lower-greek", index: 1 })).toBe("β.");
  });

  it("index 23 → 'ω.' (last letter, σ is used, not ς)", () => {
    // Greek alphabet has 24 letters for counting (σ not ς at end).
    expect(formatListMarker({ listStyleType: "lower-greek", index: 23 })).toBe("ω.");
  });

  it("index 24 wraps to 'αα.'", () => {
    expect(formatListMarker({ listStyleType: "lower-greek", index: 24 })).toBe("αα.");
  });
});

// ============================================================================
// formatListMarker — suffix customization
// ============================================================================

describe("formatListMarker — suffix", () => {
  it("numeric default suffix is '.'", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0 })).toBe("1.");
  });

  it("bullet styles have no suffix even if one is passed", () => {
    // Real browsers never append a suffix to disc/circle/square.
    expect(formatListMarker({ listStyleType: "disc", index: 0, suffix: ". " })).toBe("•");
  });

  it("custom suffix replaces default for numeric styles", () => {
    expect(formatListMarker({ listStyleType: "decimal", index: 0, suffix: ") " })).toBe("1) ");
    expect(formatListMarker({ listStyleType: "decimal", index: 0, suffix: "" })).toBe("1");
  });
});

// ============================================================================
// computeListMarkers — container-level scheduling
// ============================================================================

describe("computeListMarkers — simple ol/ul", () => {
  it("<ol> decimal with 3 items → ['1.','2.','3.']", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["1.", "2.", "3."]);
  });

  it("<ul> disc with 3 items → ['•','•','•']", () => {
    const spec: ListContainerSpec = {
      tag: "ul",
      listStyleType: "disc",
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["•", "•", "•"]);
  });

  it("empty list → []", () => {
    expect(computeListMarkers({ tag: "ol", listStyleType: "decimal", items: [] })).toEqual([]);
  });

  it("listStyleType: none → array of empty strings", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "none",
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["", "", ""]);
  });
});

describe("computeListMarkers — start attribute", () => {
  it("<ol start='5'> decimal with 3 items → ['5.','6.','7.']", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      startAttr: "5",
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["5.", "6.", "7."]);
  });

  it("<ol start='5'> upper-roman → ['V.','VI.','VII.']", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "upper-roman",
      startAttr: "5",
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["V.", "VI.", "VII."]);
  });

  it("start can be a number, not just string", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      startAttr: 3,
      items: [{}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["3.", "4."]);
  });

  it("invalid start attribute falls back to 1", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      startAttr: "abc",
      items: [{}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["1.", "2."]);
  });
});

describe("computeListMarkers — reversed attribute", () => {
  it("<ol reversed> 3 items → ['3.','2.','1.']", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      reversed: true,
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["3.", "2.", "1."]);
  });

  it("<ol reversed start='10'> 4 items → ['10.','9.','8.','7.']", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      reversed: true,
      startAttr: "10",
      items: [{}, {}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["10.", "9.", "8.", "7."]);
  });

  it("<ol reversed> with lower-alpha 3 items → ['c.','b.','a.']", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "lower-alpha",
      reversed: true,
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["c.", "b.", "a."]);
  });
});

describe("computeListMarkers — <li value='N'> override", () => {
  it("value at index 1 resets counter, subsequent items continue from it", () => {
    // <ol><li>1.</li><li value="20">20.</li><li>21.</li></ol>
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      items: [{}, { valueAttr: "20" }, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["1.", "20.", "21."]);
  });

  it("value at index 0 replaces start", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      startAttr: "100",
      items: [{ valueAttr: "7" }, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["7.", "8."]);
  });

  it("multiple value overrides chain correctly", () => {
    // <ol><li value="5">5</li><li>6</li><li value="50">50</li><li>51</li></ol>
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      items: [{ valueAttr: "5" }, {}, { valueAttr: "50" }, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["5.", "6.", "50.", "51."]);
  });

  it("value on reversed ol still resets (and next item continues -1 from that value)", () => {
    // Per HTML spec, <li value> overrides regardless of reversed.
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      reversed: true,
      items: [{}, { valueAttr: "10" }, {}],
    };
    // index 0 → 3 (reversed start), index 1 → value=10, index 2 → 9
    expect(computeListMarkers(spec)).toEqual(["3.", "10.", "9."]);
  });

  it("invalid value attribute is ignored", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal",
      items: [{ valueAttr: "abc" }, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["1.", "2."]);
  });
});

describe("computeListMarkers — decimal-leading-zero padding is based on total", () => {
  it("3 items → all 2-digit padded", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal-leading-zero",
      items: [{}, {}, {}],
    };
    expect(computeListMarkers(spec)).toEqual(["01.", "02.", "03."]);
  });

  it("100 items → all 3-digit padded (first is '001.', last '100.')", () => {
    const spec: ListContainerSpec = {
      tag: "ol",
      listStyleType: "decimal-leading-zero",
      items: Array.from({ length: 100 }, () => ({})),
    };
    const markers = computeListMarkers(spec);
    expect(markers[0]).toBe("001.");
    expect(markers[9]).toBe("010.");
    expect(markers[99]).toBe("100.");
  });
});
