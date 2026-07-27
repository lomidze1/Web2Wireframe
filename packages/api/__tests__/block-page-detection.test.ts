import { describe, it, expect } from "vitest";
import { looksLikeBlockPage } from "../src/utils/blockPageDetection.js";

/** Wraps text values into the frame shape /import-url returns. */
function framesWithText(values: string[]) {
  return [
    {
      viewportWidth: 1440,
      viewportHeight: 900,
      tree: {
        type: "FRAME",
        children: values.map((value) => ({ type: "TEXT", value })),
      },
    },
  ];
}

describe("looksLikeBlockPage", () => {
  it("flags a small bot-protection page", () => {
    expect(
      looksLikeBlockPage(
        framesWithText([
          "Access Denied",
          "You don't have permission to access this resource.",
          "Reference #18.abcd",
        ]),
      ),
    ).toBe(true);
  });

  it("matches regardless of casing and surrounding whitespace", () => {
    expect(
      looksLikeBlockPage(framesWithText(["  PARDON   OUR\n INTERRUPTION  "])),
    ).toBe(true);
  });

  it("finds the phrase in deeply nested children", () => {
    const frames = [
      {
        tree: {
          type: "FRAME",
          children: [
            {
              type: "FRAME",
              children: [
                { type: "FRAME", children: [{ type: "TEXT", value: "Just a moment..." }] },
              ],
            },
          ],
        },
      },
    ];
    expect(looksLikeBlockPage(frames)).toBe(true);
  });

  it("does NOT flag a real page that merely mentions the phrase", () => {
    // 40 text nodes — above the size guard, so a blog post about HTTP errors
    // never costs the user their wireframe.
    const values = Array.from({ length: 39 }, (_, i) => `paragraph ${i}`);
    values.push("What to do when a server returns Access Denied");
    expect(looksLikeBlockPage(framesWithText(values))).toBe(false);
  });

  it("does NOT flag a small ordinary page", () => {
    expect(looksLikeBlockPage(framesWithText(["Welcome", "Buy now"]))).toBe(false);
  });

  it("returns false for empty, textless or malformed input", () => {
    expect(looksLikeBlockPage(undefined)).toBe(false);
    expect(looksLikeBlockPage([])).toBe(false);
    expect(looksLikeBlockPage([{}])).toBe(false);
    expect(looksLikeBlockPage(framesWithText([]))).toBe(false);
    expect(looksLikeBlockPage(framesWithText(["   "]))).toBe(false);
  });

  it("only inspects the first frame (block page is identical across viewports)", () => {
    const frames = [
      ...framesWithText(["Welcome", "Buy now"]),
      ...framesWithText(["Access Denied"]),
    ];
    expect(looksLikeBlockPage(frames)).toBe(false);
  });
});
