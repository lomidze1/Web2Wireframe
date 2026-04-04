/**
 * Tests for CSS Grid rendering helpers.
 * Tests sortGridChildren, getGridSpan, and shouldUseAutoLayout for GRID.
 */
import { describe, it, expect } from "vitest";
import { shouldUseAutoLayout } from "../rendering/nodes";

// Import helpers once they're exported (will be created in implementation)
// For now, test through shouldUseAutoLayout which is already exported

describe("shouldUseAutoLayout — GRID handling", () => {
  it("returns false for GRID nodes in autoLayout context", () => {
    expect(shouldUseAutoLayout("autoLayout", "GRID")).toBe(false);
  });

  it("returns false for GRID nodes in absolute context", () => {
    expect(shouldUseAutoLayout("absolute", "GRID")).toBe(false);
  });

  it("returns false for GRID nodes with undefined context", () => {
    expect(shouldUseAutoLayout(undefined, "GRID")).toBe(false);
  });

  // Existing behavior preserved
  it("still returns true for HORIZONTAL in autoLayout context", () => {
    expect(shouldUseAutoLayout("autoLayout", "HORIZONTAL")).toBe(true);
  });

  it("still returns true for VERTICAL in autoLayout context", () => {
    expect(shouldUseAutoLayout("autoLayout", "VERTICAL")).toBe(true);
  });

  it("still returns false for everything in absolute context", () => {
    expect(shouldUseAutoLayout("absolute", "HORIZONTAL")).toBe(false);
    expect(shouldUseAutoLayout("absolute", "VERTICAL")).toBe(false);
    expect(shouldUseAutoLayout("absolute", "NONE")).toBe(false);
  });
});
