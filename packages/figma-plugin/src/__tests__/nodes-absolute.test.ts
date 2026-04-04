/**
 * Test the useAutoLayout logic for absolute mode.
 * Absolute mode = always false (all frames use x/y positioning).
 */
import { describe, it, expect } from "vitest";
import { shouldUseAutoLayout } from "../rendering/nodes";

describe("shouldUseAutoLayout", () => {
  it("should always be false in absolute context", () => {
    expect(shouldUseAutoLayout("absolute", "VERTICAL")).toBe(false);
    expect(shouldUseAutoLayout("absolute", "HORIZONTAL")).toBe(false);
    expect(shouldUseAutoLayout("absolute", "NONE")).toBe(false);
    expect(shouldUseAutoLayout("absolute", undefined)).toBe(false);
  });

  it("should be true for any node in autoLayout context", () => {
    expect(shouldUseAutoLayout("autoLayout", "NONE")).toBe(true);
    expect(shouldUseAutoLayout("autoLayout", "VERTICAL")).toBe(true);
    expect(shouldUseAutoLayout("autoLayout", undefined)).toBe(true);
  });

  it("should use node layoutMode when context is undefined", () => {
    expect(shouldUseAutoLayout(undefined, "VERTICAL")).toBe(true);
    expect(shouldUseAutoLayout(undefined, "HORIZONTAL")).toBe(true);
    expect(shouldUseAutoLayout(undefined, "NONE")).toBe(false);
    expect(shouldUseAutoLayout(undefined, undefined)).toBe(false);
  });

  it("should always be false for GRID nodes (grid has its own rendering path)", () => {
    expect(shouldUseAutoLayout("autoLayout", "GRID")).toBe(false);
    expect(shouldUseAutoLayout("absolute", "GRID")).toBe(false);
    expect(shouldUseAutoLayout(undefined, "GRID")).toBe(false);
  });
});
