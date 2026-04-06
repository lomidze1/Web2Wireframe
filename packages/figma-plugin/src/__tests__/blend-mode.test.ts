/**
 * Tests for CSS mix-blend-mode → Figma BlendMode mapping
 */
import { describe, it, expect } from "vitest";
import { mapCSSBlendMode } from "../rendering/nodes";

describe("mapCSSBlendMode", () => {
  it("maps 'multiply' to 'MULTIPLY'", () => {
    expect(mapCSSBlendMode("multiply")).toBe("MULTIPLY");
  });

  it("maps 'screen' to 'SCREEN'", () => {
    expect(mapCSSBlendMode("screen")).toBe("SCREEN");
  });

  it("maps 'overlay' to 'OVERLAY'", () => {
    expect(mapCSSBlendMode("overlay")).toBe("OVERLAY");
  });

  it("maps 'darken' to 'DARKEN'", () => {
    expect(mapCSSBlendMode("darken")).toBe("DARKEN");
  });

  it("maps 'lighten' to 'LIGHTEN'", () => {
    expect(mapCSSBlendMode("lighten")).toBe("LIGHTEN");
  });

  it("maps 'color-dodge' to 'COLOR_DODGE'", () => {
    expect(mapCSSBlendMode("color-dodge")).toBe("COLOR_DODGE");
  });

  it("maps 'color-burn' to 'COLOR_BURN'", () => {
    expect(mapCSSBlendMode("color-burn")).toBe("COLOR_BURN");
  });

  it("maps 'hard-light' to 'HARD_LIGHT'", () => {
    expect(mapCSSBlendMode("hard-light")).toBe("HARD_LIGHT");
  });

  it("maps 'soft-light' to 'SOFT_LIGHT'", () => {
    expect(mapCSSBlendMode("soft-light")).toBe("SOFT_LIGHT");
  });

  it("maps 'difference' to 'DIFFERENCE'", () => {
    expect(mapCSSBlendMode("difference")).toBe("DIFFERENCE");
  });

  it("maps 'exclusion' to 'EXCLUSION'", () => {
    expect(mapCSSBlendMode("exclusion")).toBe("EXCLUSION");
  });

  it("maps 'hue' to 'HUE'", () => {
    expect(mapCSSBlendMode("hue")).toBe("HUE");
  });

  it("maps 'saturation' to 'SATURATION'", () => {
    expect(mapCSSBlendMode("saturation")).toBe("SATURATION");
  });

  it("maps 'color' to 'COLOR'", () => {
    expect(mapCSSBlendMode("color")).toBe("COLOR");
  });

  it("maps 'luminosity' to 'LUMINOSITY'", () => {
    expect(mapCSSBlendMode("luminosity")).toBe("LUMINOSITY");
  });

  it("returns undefined for unknown blend mode", () => {
    expect(mapCSSBlendMode("unknown-mode")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(mapCSSBlendMode(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(mapCSSBlendMode("")).toBeUndefined();
  });
});
