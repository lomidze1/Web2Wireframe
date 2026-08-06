/**
 * B2: geometry-derived Figma constraints on absolutely-positioned children.
 * Previously every absolute child was pinned top-left (Figma default), so
 * right-anchored close buttons and full-bleed backdrops broke on resize.
 */
import { describe, it, expect } from "vitest";
import { inferAxisConstraint } from "../rendering/layout";

describe("inferAxisConstraint", () => {
  it("MAX for a right/bottom-anchored element (close button)", () => {
    // x=460, w=24 in 500 → farGap 16 < nearGap 460
    expect(inferAxisConstraint(460, 24, 500)).toBe("MAX");
  });

  it("MIN for a left-anchored element", () => {
    expect(inferAxisConstraint(16, 24, 500)).toBe("MIN");
  });

  it("CENTER for an equidistant element (centered modal)", () => {
    expect(inferAxisConstraint(150, 200, 500)).toBe("CENTER");
  });

  it("STRETCH for a full-bleed element (inset: 0 backdrop)", () => {
    expect(inferAxisConstraint(0, 500, 500)).toBe("STRETCH");
    expect(inferAxisConstraint(10, 480, 500)).toBe("STRETCH");
  });

  it("MIN for degenerate sizes", () => {
    expect(inferAxisConstraint(0, 0, 500)).toBe("MIN");
    expect(inferAxisConstraint(0, 100, 0)).toBe("MIN");
  });
});
