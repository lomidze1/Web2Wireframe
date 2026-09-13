/**
 * stripe.com regression: a text node must never render MORE lines than the
 * browser measured.
 *
 * `section.stats-section`'s heading wraps to 2 lines in the browser
 * ("The backbone" / "of global commerce" — the nbsp is what forces the
 * break there). It is a genuine soft wrap, so the converter joins the rows
 * with a space and leaves the wrapping to Figma — which wraps with whatever
 * font resolved. "Söhne VF" was unavailable, the node came out
 * `fontName: MIXED`, the substituted glyphs measured wider, and 2 browser
 * lines became 3 Figma lines: the box grew 115.34px → 176px and shoved the
 * stats row 54px into the chart image below it.
 *
 * `enforceMeasuredLineCount` re-bakes the measured rows as hard `\n` breaks
 * when — and only when — the rendered line count actually diverges. The
 * rewrite is same-length (one separator character each), so styled-range
 * indices survive it untouched.
 */
import { describe, it, expect } from "vitest";

import { enforceMeasuredLineCount } from "../rendering/textLineGuard";
import type { WireframeNode } from "../types";

interface MockText {
  type: "TEXT";
  characters: string;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: { unit: "PIXELS"; value: number };
  textAutoResize: string;
  /** px per character at the original font size. */
  charWidth: number;
  resize(width: number, height: number): void;
}

/**
 * A text node that measures the way Figma does, on a monospace metric:
 * hugging reports the widest `\n`-delimited line, a fixed width greedily
 * soft-wraps inside it, and only U+0020 is a break opportunity (U+00A0 stays
 * glued to its neighbours, exactly as in the browser).
 */
function makeText(
  characters: string,
  opts: { charWidth: number; lineHeightPx: number; boxWidth: number; fontSize?: number },
): MockText {
  const baseFontSize = opts.fontSize ?? 56;
  const node: MockText = {
    type: "TEXT",
    characters,
    width: opts.boxWidth,
    height: 0,
    fontSize: baseFontSize,
    lineHeight: { unit: "PIXELS", value: opts.lineHeightPx },
    textAutoResize: "HEIGHT",
    charWidth: opts.charWidth,
    resize(width, height) {
      this.width = width;
      this.height = height;
    },
  };

  const perChar = (): number => node.charWidth * (node.fontSize / baseFontSize);

  /** Greedy word wrap of one hard line → soft line count. */
  const softLineCount = (line: string, width: number): number => {
    const c = perChar();
    let count = 1;
    let used = 0;
    for (const word of line.split(" ")) {
      const w = word.length * c;
      if (used === 0) used = w;
      else if (used + c + w <= width) used += c + w;
      else {
        count++;
        used = w;
      }
    }
    return count;
  };

  const measure = (): void => {
    const hard = node.characters.split("\n");
    if (node.textAutoResize === "WIDTH_AND_HEIGHT") {
      node.width = Math.max(...hard.map((l) => l.length * perChar()));
      node.height = hard.length * opts.lineHeightPx;
    } else if (node.textAutoResize === "HEIGHT") {
      node.height =
        hard.reduce((n, l) => n + softLineCount(l, node.width), 0) * opts.lineHeightPx;
    }
  };

  measure();

  return new Proxy(node, {
    set(target, prop, value) {
      Reflect.set(target, prop, value);
      if (prop === "characters" || prop === "fontSize" || prop === "textAutoResize") measure();
      return true;
    },
  }) as MockText;
}

function makeWireframeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "h2",
    name: "h2.hds-heading",
    type: "text",
    tag: "h2",
    x: 0,
    y: 0,
    width: 489.22,
    height: 115.34,
    ...overrides,
  } as WireframeNode;
}

const NBSP = " ";
const HEADING = `The backbone of${NBSP}global commerce`;
const LINES = ["The backbone", `of${NBSP}global commerce`];
const LH = 57.68;

describe("enforceMeasuredLineCount", () => {
  it("stripe.com heading: bakes the measured breaks when Figma renders an extra line", () => {
    // 30px/char: "The backbone of global" no longer fits 489px, so the
    // substituted font wraps into 3 lines where the browser used 2.
    const textNode = makeText(HEADING, {
      charWidth: 30,
      lineHeightPx: LH,
      boxWidth: 489.22,
    });
    expect(textNode.height).toBeCloseTo(3 * LH, 2);

    const before = textNode.characters.length;
    const changed = enforceMeasuredLineCount(
      textNode as never,
      makeWireframeNode({ measuredLines: LINES }),
    );

    expect(changed).toBe(true);
    expect(textNode.characters).toBe(`The backbone\nof${NBSP}global commerce`);
    // Same-length rewrite — styled-range indices stay valid.
    expect(textNode.characters.length).toBe(before);
    expect(textNode.textAutoResize).toBe("NONE");
    expect(textNode.height).toBeCloseTo(115.34, 2);
  });

  it("leaves the text alone when Figma already renders the measured line count", () => {
    // 20px/char: the whole heading fits 2 lines, just as the browser had it.
    const textNode = makeText(HEADING, {
      charWidth: 20,
      lineHeightPx: LH,
      boxWidth: 489.22,
    });
    expect(textNode.height).toBeCloseTo(2 * LH, 2);

    const changed = enforceMeasuredLineCount(
      textNode as never,
      makeWireframeNode({ measuredLines: LINES }),
    );

    expect(changed).toBe(false);
    expect(textNode.characters).toBe(HEADING);
    expect(textNode.characters).not.toContain("\n");
  });

  it("is a no-op without measuredLines", () => {
    const textNode = makeText(HEADING, {
      charWidth: 30,
      lineHeightPx: LH,
      boxWidth: 489.22,
    });

    expect(enforceMeasuredLineCount(textNode as never, makeWireframeNode())).toBe(false);
    expect(textNode.characters).toBe(HEADING);
  });

  it("is a no-op when the characters no longer match measuredLines", () => {
    // Lorem / semantic modes rewrite `characters` after the converter ran —
    // the guard must detect the mismatch and keep its hands off.
    const rewritten = "Lorem ipsum dolor sit amet consectetur";
    const textNode = makeText(rewritten, {
      charWidth: 30,
      lineHeightPx: LH,
      boxWidth: 489.22,
    });
    expect(textNode.height).toBeGreaterThan(2 * LH);

    const changed = enforceMeasuredLineCount(
      textNode as never,
      makeWireframeNode({ measuredLines: LINES }),
    );

    expect(changed).toBe(false);
    expect(textNode.characters).toBe(rewritten);
  });

  it("shrinks the font when a baked line is still wider than the captured box", () => {
    // Box narrowed to 300px: even "of global commerce" alone overflows it at
    // 56px, so the break has to be paired with the sizing ladder's bisection.
    const textNode = makeText(HEADING, {
      charWidth: 26,
      lineHeightPx: LH,
      boxWidth: 300,
    });

    const changed = enforceMeasuredLineCount(
      textNode as never,
      makeWireframeNode({ width: 300, measuredLines: LINES }),
    );

    expect(changed).toBe(true);
    expect(textNode.characters).toBe(`The backbone\nof${NBSP}global commerce`);
    expect(textNode.fontSize).toBeLessThan(56);
  });

  it("ignores a single measured line (nothing to enforce)", () => {
    const textNode = makeText("One line", {
      charWidth: 30,
      lineHeightPx: LH,
      boxWidth: 489.22,
    });

    expect(
      enforceMeasuredLineCount(
        textNode as never,
        makeWireframeNode({ measuredLines: ["One line"] }),
      ),
    ).toBe(false);
  });

  it("is a no-op when the node carries no pixel line height", () => {
    const textNode = makeText(HEADING, {
      charWidth: 30,
      lineHeightPx: LH,
      boxWidth: 489.22,
    });
    (textNode as unknown as { lineHeight: unknown }).lineHeight = { unit: "AUTO" };

    expect(
      enforceMeasuredLineCount(
        textNode as never,
        makeWireframeNode({ measuredLines: LINES }),
      ),
    ).toBe(false);
  });
});
