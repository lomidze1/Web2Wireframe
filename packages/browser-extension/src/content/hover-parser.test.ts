import { describe, it, expect } from "vitest";
import {
  parseHoverSelectorsFromCssText,
  splitHoverSelector,
} from "./hover-parser";

describe("parseHoverSelectorsFromCssText", () => {
  it("returns selectors that contain :hover", () => {
    expect(parseHoverSelectorsFromCssText(".btn:hover")).toEqual([".btn:hover"]);
  });

  it("returns multiple selectors from a comma-separated list", () => {
    expect(
      parseHoverSelectorsFromCssText(".btn:hover, .link:hover, .static"),
    ).toEqual([".btn:hover", ".link:hover"]);
  });

  it("ignores selectors with no :hover", () => {
    expect(parseHoverSelectorsFromCssText(".btn, .link")).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(parseHoverSelectorsFromCssText("")).toEqual([]);
  });

  it("preserves :hover combined with pseudo-elements (::before, ::after)", () => {
    expect(parseHoverSelectorsFromCssText(".btn:hover::before")).toEqual([
      ".btn:hover::before",
    ]);
  });

  it("handles descendant selectors with :hover at non-leaf position", () => {
    expect(parseHoverSelectorsFromCssText(".nav:hover .icon")).toEqual([
      ".nav:hover .icon",
    ]);
  });

  it("does not split inside parentheses (e.g. :is(.a, .b):hover)", () => {
    // Comma inside :is() must not split the selector
    const out = parseHoverSelectorsFromCssText(":is(.a, .b):hover");
    expect(out).toEqual([":is(.a, .b):hover"]);
  });

  it("trims whitespace around each selector", () => {
    expect(parseHoverSelectorsFromCssText("  .btn:hover  ,  .x:hover  ")).toEqual([
      ".btn:hover",
      ".x:hover",
    ]);
  });
});

describe("splitHoverSelector", () => {
  it("produces same trigger/target when :hover is at the leaf", () => {
    expect(splitHoverSelector(".btn:hover")).toEqual({
      trigger: ".btn",
      target: ".btn",
    });
  });

  it("trigger = element with :hover, target = full selector with :hover removed", () => {
    expect(splitHoverSelector(".nav:hover .icon")).toEqual({
      trigger: ".nav",
      target: ".nav .icon",
    });
  });

  it("strips pseudo-element from trigger but preserves it on target", () => {
    expect(splitHoverSelector(".btn:hover::before")).toEqual({
      trigger: ".btn",
      target: ".btn::before",
    });
  });

  it("handles pseudo-element preceding :hover", () => {
    expect(splitHoverSelector(".foo::before:hover")).toEqual({
      trigger: ".foo",
      target: ".foo::before",
    });
  });

  it("returns null for a selector without :hover", () => {
    expect(splitHoverSelector(".btn")).toBeNull();
  });
});
