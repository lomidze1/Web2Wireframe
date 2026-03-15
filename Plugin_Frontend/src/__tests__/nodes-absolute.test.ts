/**
 * Test the useAutoLayout logic for absolute mode.
 * Verifies that nodes with their own layoutMode (e.g. card with VERTICAL)
 * still get auto-layout treatment even when the global context is "absolute".
 */
import { describe, it, expect } from "vitest";
import { shouldUseAutoLayout } from "../rendering/nodes";

describe("shouldUseAutoLayout", () => {
  it("should be true for nodes with own layoutMode even in absolute context", () => {
    // Card with VERTICAL layout in absolute mode — should still auto-layout internally
    expect(shouldUseAutoLayout("absolute", "VERTICAL")).toBe(true);
    expect(shouldUseAutoLayout("absolute", "HORIZONTAL")).toBe(true);
  });

  it("should be false for nodes with NONE layoutMode in absolute context", () => {
    expect(shouldUseAutoLayout("absolute", "NONE")).toBe(false);
    expect(shouldUseAutoLayout("absolute", undefined)).toBe(false);
  });

  it("should be true for any node in autoLayout context", () => {
    expect(shouldUseAutoLayout("autoLayout", "NONE")).toBe(true);
    expect(shouldUseAutoLayout("autoLayout", "VERTICAL")).toBe(true);
    expect(shouldUseAutoLayout("autoLayout", undefined)).toBe(true);
  });
});
