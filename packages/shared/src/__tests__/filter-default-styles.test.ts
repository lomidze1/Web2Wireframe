/**
 * filterDefaultStyles Unit Tests
 *
 * Tests for CSS default value filtering that keeps JSON compact
 */

import { describe, it, expect } from "vitest";
import { filterDefaultStyles } from "../tree-builder";

describe("filterDefaultStyles", () => {
  it("should return empty object for empty input", () => {
    expect(filterDefaultStyles({})).toEqual({});
  });

  it("should filter out CSS default values", () => {
    const result = filterDefaultStyles({
      "position": "static",
      "opacity": "1",
      "visibility": "visible",
      "overflow": "visible",
      "z-index": "auto",
      "text-decoration": "none",
      "text-transform": "none",
      "font-style": "normal",
      "transform": "none",
      "filter": "none",
      "box-shadow": "none",
    });
    expect(result).toEqual({});
  });

  it("should keep non-default values", () => {
    const result = filterDefaultStyles({
      "position": "absolute",
      "opacity": "0.5",
      "display": "flex",
      "text-decoration": "underline",
    });
    expect(result).toEqual({
      "position": "absolute",
      "opacity": "0.5",
      "display": "flex",
      "text-decoration": "underline",
    });
  });

  it("should filter zero-value dimensional properties", () => {
    const result = filterDefaultStyles({
      "padding-top": "0px",
      "margin-left": "0",
      "border-width": "0px",
      "gap": "0px 0px",
    });
    expect(result).toEqual({});
  });

  it("should keep typography zero values (letter-spacing, line-height)", () => {
    const result = filterDefaultStyles({
      "letter-spacing": "normal",
      "line-height": "normal",
    });
    expect(result).toEqual({
      "letter-spacing": "normal",
      "line-height": "normal",
    });
  });

  it("should filter transparent colors for backgrounds and borders", () => {
    const result = filterDefaultStyles({
      "background-color": "rgba(0, 0, 0, 0)",
      "border-color": "transparent",
    });
    expect(result).toEqual({});
  });

  it("should keep transparent for non-background/border properties (e.g. color)", () => {
    const result = filterDefaultStyles({
      "color": "rgba(0, 0, 0, 0)",
    });
    expect(result).toEqual({
      "color": "rgba(0, 0, 0, 0)",
    });
  });

  it("should filter text-decoration with full computed format", () => {
    const result = filterDefaultStyles({
      "text-decoration": "none solid rgb(0, 0, 0)",
    });
    expect(result).toEqual({});
  });

  it("should keep text-decoration: underline with full computed format", () => {
    const result = filterDefaultStyles({
      "text-decoration": "underline solid rgb(0, 0, 0)",
    });
    expect(result).toEqual({
      "text-decoration": "underline solid rgb(0, 0, 0)",
    });
  });

  it("should filter empty string values", () => {
    const result = filterDefaultStyles({
      "color": "",
      "font-size": "",
    });
    expect(result).toEqual({});
  });

  it("should filter flex-related defaults", () => {
    const result = filterDefaultStyles({
      "flex-grow": "0",
      "flex-shrink": "1",
      "flex-basis": "auto",
      "flex-direction": "row",
      "flex-wrap": "nowrap",
      "justify-content": "normal",
      "align-items": "normal",
      "align-self": "auto",
    });
    expect(result).toEqual({});
  });

  it("should keep non-default flex values", () => {
    const result = filterDefaultStyles({
      "flex-direction": "column",
      "flex-wrap": "wrap",
      "justify-content": "center",
      "align-items": "flex-start",
    });
    expect(result).toEqual({
      "flex-direction": "column",
      "flex-wrap": "wrap",
      "justify-content": "center",
      "align-items": "flex-start",
    });
  });

  it("should handle realistic element styles (link with underline)", () => {
    const input = {
      "display": "inline",
      "position": "static",
      "color": "rgb(59, 130, 246)",
      "font-size": "16px",
      "font-weight": "400",
      "font-family": "Inter, sans-serif",
      "line-height": "24px",
      "text-decoration": "underline",
      "text-transform": "none",
      "opacity": "1",
      "visibility": "visible",
      "overflow": "visible",
      "background-color": "rgba(0, 0, 0, 0)",
      "border-width": "0px",
      "border-style": "none",
      "border-color": "transparent",
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
    };
    const result = filterDefaultStyles(input);

    // Should keep only meaningful, non-default values
    expect(result["text-decoration"]).toBe("underline");
    expect(result["color"]).toBe("rgb(59, 130, 246)");
    expect(result["font-size"]).toBe("16px");
    expect(result["font-family"]).toBe("Inter, sans-serif");
    expect(result["line-height"]).toBe("24px");

    // Should NOT contain defaults
    expect(result["position"]).toBeUndefined();
    expect(result["opacity"]).toBeUndefined();
    expect(result["text-transform"]).toBeUndefined();
    expect(result["background-color"]).toBeUndefined();
    expect(result["border-style"]).toBeUndefined();
    expect(result["border-color"]).toBeUndefined();
    expect(result["padding-top"]).toBeUndefined();
  });

  it("should handle realistic element styles (flex container)", () => {
    const input = {
      "display": "flex",
      "flex-direction": "column",
      "gap": "16px",
      "padding-top": "24px",
      "padding-right": "32px",
      "padding-bottom": "24px",
      "padding-left": "32px",
      "background-color": "rgb(255, 255, 255)",
      "border-radius": "8px",
      "box-shadow": "0px 1px 3px rgba(0, 0, 0, 0.1)",
      "position": "static",
      "opacity": "1",
      "overflow": "visible",
    };
    const result = filterDefaultStyles(input);

    expect(result["display"]).toBe("flex");
    expect(result["flex-direction"]).toBe("column");
    expect(result["gap"]).toBe("16px");
    expect(result["padding-top"]).toBe("24px");
    expect(result["background-color"]).toBe("rgb(255, 255, 255)");
    expect(result["border-radius"]).toBe("8px");
    expect(result["box-shadow"]).toBe("0px 1px 3px rgba(0, 0, 0, 0.1)");

    expect(result["position"]).toBeUndefined();
    expect(result["opacity"]).toBeUndefined();
    expect(result["overflow"]).toBeUndefined();
  });
});
