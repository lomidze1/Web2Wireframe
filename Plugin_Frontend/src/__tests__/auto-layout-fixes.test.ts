import { describe, it, expect } from "vitest";
import { resolveMainAxisSizing } from "../rendering/layout";

describe("resolveMainAxisSizing", () => {
  it("FILL + parent FIXED → FILL", () => {
    const result = resolveMainAxisSizing("FILL", undefined, "FIXED", 400);
    expect(result).toEqual({ sizing: "FILL" });
  });

  it("FILL + parent HUG → HUG + minSize", () => {
    const result = resolveMainAxisSizing("FILL", undefined, "HUG", 400);
    expect(result).toEqual({ sizing: "HUG", minSize: 400 });
  });

  it("layoutGrow=1 + parent HUG → HUG + minSize", () => {
    const result = resolveMainAxisSizing(undefined, 1, "HUG", 300);
    expect(result).toEqual({ sizing: "HUG", minSize: 300 });
  });

  it("layoutGrow=1 + parent FIXED → FILL", () => {
    const result = resolveMainAxisSizing(undefined, 1, "FIXED", 300);
    expect(result).toEqual({ sizing: "FILL" });
  });

  it("HUG + no grow → HUG (unchanged)", () => {
    const result = resolveMainAxisSizing("HUG", undefined, "FIXED", 200);
    expect(result).toEqual({ sizing: "HUG" });
  });

  it("FILL + parent FILL → FILL", () => {
    const result = resolveMainAxisSizing("FILL", undefined, "FILL", 500);
    expect(result).toEqual({ sizing: "FILL" });
  });

  it("undefined sizing + no grow → HUG", () => {
    const result = resolveMainAxisSizing(undefined, undefined, "FIXED", 100);
    expect(result).toEqual({ sizing: "HUG" });
  });

  it("FIXED sizing + no grow → FIXED", () => {
    const result = resolveMainAxisSizing("FIXED", undefined, "HUG", 100);
    expect(result).toEqual({ sizing: "FIXED" });
  });
});
