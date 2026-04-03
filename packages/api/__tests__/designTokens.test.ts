import { describe, it, expect } from "vitest";
import { DESIGN_TOKENS, getBreakpoint, getToken } from "../src/lib/designTokens.js";

describe("DESIGN_TOKENS structure", () => {
  it("has all fontSize keys", () => {
    const expected = [
      "h1", "h2", "h3", "h4", "subheading", "paragraph", "small",
      "badge", "nav", "stat_value", "stat_label", "button",
      "input_label", "input_placeholder",
    ];
    for (const key of expected) {
      expect(DESIGN_TOKENS.fontSize).toHaveProperty(key);
    }
  });

  it("has all fontWeight keys", () => {
    const expected = ["h1", "h2", "h3", "h4", "subheading", "paragraph", "badge", "nav", "button"];
    for (const key of expected) {
      expect(DESIGN_TOKENS.fontWeight).toHaveProperty(key);
    }
  });

  it("has button sizing for sm, md, lg", () => {
    for (const size of ["sm", "md", "lg"] as const) {
      const t = DESIGN_TOKENS.button[size];
      expect(t).toHaveProperty("paddingH");
      expect(t).toHaveProperty("paddingV");
      expect(t).toHaveProperty("borderRadius");
      expect(t).toHaveProperty("height");
    }
  });

  it("has imagePlaceholder aspect ratios", () => {
    expect(DESIGN_TOKENS.imagePlaceholder.aspectRatios["16:9"]).toBe(0.5625);
    expect(DESIGN_TOKENS.imagePlaceholder.aspectRatios["1:1"]).toBe(1);
  });

  it("has card defaults", () => {
    expect(DESIGN_TOKENS.card.borderRadius).toBe(12);
    expect(DESIGN_TOKENS.card.padding).toBe(24);
    expect(DESIGN_TOKENS.card.borderWidth).toBe(1);
  });

  it("has input defaults", () => {
    expect(DESIGN_TOKENS.input.height).toBe(44);
    expect(DESIGN_TOKENS.input.padding).toEqual({ top: 10, right: 12, bottom: 10, left: 12 });
  });

  it("has avatar sizes", () => {
    expect(DESIGN_TOKENS.avatar.sm).toBe(32);
    expect(DESIGN_TOKENS.avatar.md).toBe(48);
    expect(DESIGN_TOKENS.avatar.lg).toBe(64);
  });

  it("has icon sizes", () => {
    expect(DESIGN_TOKENS.icon.sm).toBe(20);
    expect(DESIGN_TOKENS.icon.md).toBe(24);
    expect(DESIGN_TOKENS.icon.lg).toBe(48);
  });

  it("has logo sizes", () => {
    expect(DESIGN_TOKENS.logo.md).toEqual({ width: 120, height: 32 });
  });

  it("fontSize breakpoint-responsive tokens have all 3 breakpoints", () => {
    const breakpointTokens = ["h1", "h2", "h3", "h4", "subheading", "paragraph", "small", "badge", "nav", "stat_value", "stat_label"];
    for (const key of breakpointTokens) {
      const val = (DESIGN_TOKENS.fontSize as any)[key];
      expect(val).toHaveProperty("desktop");
      expect(val).toHaveProperty("tablet");
      expect(val).toHaveProperty("mobile");
    }
  });

  it("button fontSize uses size keys (sm, md, lg)", () => {
    expect(DESIGN_TOKENS.fontSize.button).toHaveProperty("sm");
    expect(DESIGN_TOKENS.fontSize.button).toHaveProperty("md");
    expect(DESIGN_TOKENS.fontSize.button).toHaveProperty("lg");
  });
});

describe("getBreakpoint", () => {
  it("returns desktop for >= 1024", () => {
    expect(getBreakpoint(1440)).toBe("desktop");
    expect(getBreakpoint(1920)).toBe("desktop");
    expect(getBreakpoint(1024)).toBe("desktop");
  });

  it("returns tablet for >= 768 and < 1024", () => {
    expect(getBreakpoint(768)).toBe("tablet");
    expect(getBreakpoint(1023)).toBe("tablet");
    expect(getBreakpoint(800)).toBe("tablet");
  });

  it("returns mobile for < 768", () => {
    expect(getBreakpoint(375)).toBe("mobile");
    expect(getBreakpoint(320)).toBe("mobile");
    expect(getBreakpoint(767)).toBe("mobile");
  });
});

describe("getToken", () => {
  it("returns value for the given breakpoint", () => {
    const token = { desktop: 48, tablet: 40, mobile: 32 };
    expect(getToken(token, "desktop")).toBe(48);
    expect(getToken(token, "tablet")).toBe(40);
    expect(getToken(token, "mobile")).toBe(32);
  });

  it("returns number as-is if token is a plain number", () => {
    expect(getToken(42, "desktop")).toBe(42);
  });

  it("returns 0 for null/undefined token", () => {
    expect(getToken(null, "desktop")).toBe(0);
    expect(getToken(undefined, "desktop")).toBe(0);
  });

  it("falls back to desktop if breakpoint key missing", () => {
    const token = { desktop: 48 };
    expect(getToken(token, "tablet")).toBe(48);
  });
});
