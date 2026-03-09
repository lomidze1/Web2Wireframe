/**
 * getLayoutSizing Unit Tests
 *
 * Tests FILL/FIXED/HUG detection for auto layout children.
 * Reference: html.to.design behavior — default is FIXED (computed size preserved).
 */

import { describe, it, expect } from "vitest";
import { getLayoutSizing } from "../utils";

describe("getLayoutSizing", () => {
  // =========================================================================
  // Hero card scenario: block element in VERTICAL parent
  // div._heroCard_wflxa_12 inside div.container (vertical auto layout)
  // Expected: FILL horizontal (stretches to parent width), FIXED vertical (computed height)
  // =========================================================================
  it("block element in vertical parent with default stretch → FILL × FIXED", () => {
    const result = getLayoutSizing(
      { display: "block", width: "1180px", height: "185.094px" },
      0,
      "auto",
      { direction: "VERTICAL" }
    );
    expect(result.horizontal).toBe("FILL");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // Same but child is a flex container itself (display: flex column)
  // The element's OWN flex-direction should NOT affect its sizing in parent
  // =========================================================================
  it("flex column container in vertical parent → FILL × FIXED", () => {
    const result = getLayoutSizing(
      { display: "flex", "flex-direction": "column", width: "1180px", height: "185px" },
      0,
      "auto",
      { direction: "VERTICAL" }
    );
    expect(result.horizontal).toBe("FILL");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // Section label: element with align-self overriding stretch
  // Parent has align-items: flex-start (items-start in Figma)
  // Section label should be FIXED × FIXED (computed content size)
  // =========================================================================
  it("element with align-self: flex-start in vertical parent → FIXED × FIXED", () => {
    const result = getLayoutSizing(
      { display: "flex", width: "82px", height: "42px" },
      0,
      "flex-start",
      { direction: "VERTICAL", alignItems: "flex-start" }
    );
    expect(result.horizontal).toBe("FIXED");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // Parent itself has align-items: flex-start → cross axis NOT stretch
  // =========================================================================
  it("parent with align-items: flex-start → FIXED on cross axis", () => {
    const result = getLayoutSizing(
      { display: "block", width: "200px", height: "50px" },
      0,
      "auto",
      { direction: "VERTICAL", alignItems: "flex-start" }
    );
    expect(result.horizontal).toBe("FIXED");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // Flex-grow > 0 in HORIZONTAL parent → FILL main axis, FILL cross axis
  // =========================================================================
  it("flex-grow in horizontal parent → FILL × FILL", () => {
    const result = getLayoutSizing(
      { display: "block", width: "500px", height: "300px" },
      1,
      "auto",
      { direction: "HORIZONTAL", alignItems: "stretch" }
    );
    expect(result.horizontal).toBe("FILL");
    expect(result.vertical).toBe("FILL");
  });

  // =========================================================================
  // Flex-grow > 0 in VERTICAL parent → FILL cross (stretch), FILL main (grow)
  // =========================================================================
  it("flex-grow in vertical parent → FILL × FILL", () => {
    const result = getLayoutSizing(
      { display: "block", width: "300px", height: "200px" },
      1,
      "auto",
      { direction: "VERTICAL" }
    );
    expect(result.horizontal).toBe("FILL");
    expect(result.vertical).toBe("FILL");
  });

  // =========================================================================
  // align-self: center overrides stretch on cross axis
  // =========================================================================
  it("align-self: center in horizontal parent → FIXED × FIXED", () => {
    const result = getLayoutSizing(
      { display: "block", width: "200px", height: "50px" },
      0,
      "center",
      { direction: "HORIZONTAL" }
    );
    expect(result.horizontal).toBe("FIXED");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // No parent context → undefined (backward compat / root elements)
  // =========================================================================
  it("no parent context → undefined × undefined", () => {
    const result = getLayoutSizing(
      { display: "block", width: "1440px", height: "900px" },
      0,
      undefined
    );
    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
  });

  // =========================================================================
  // Parent direction is NONE → no auto layout, undefined
  // =========================================================================
  it("parent direction NONE → undefined × undefined", () => {
    const result = getLayoutSizing(
      { display: "flex", width: "300px", height: "200px" },
      0,
      "auto",
      { direction: "NONE" }
    );
    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
  });

  // =========================================================================
  // HORIZONTAL parent default (no explicit alignItems → stretch)
  // No flex-grow → FIXED main axis, FILL cross axis
  // =========================================================================
  it("element in horizontal parent default → FIXED × FILL", () => {
    const result = getLayoutSizing(
      { display: "block", width: "200px", height: "50px" },
      0,
      "auto",
      { direction: "HORIZONTAL" }
    );
    expect(result.horizontal).toBe("FIXED");
    expect(result.vertical).toBe("FILL");
  });

  // =========================================================================
  // align-self: stretch explicitly in vertical parent → FILL cross axis
  // =========================================================================
  it("align-self: stretch in vertical parent → FILL horizontal", () => {
    const result = getLayoutSizing(
      { display: "flex", width: "500px", height: "200px" },
      0,
      "stretch",
      { direction: "VERTICAL", alignItems: "flex-start" }
    );
    expect(result.horizontal).toBe("FILL");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // Block parent fallback: display:block parent passes direction "VERTICAL"
  // (extraction now defaults to "VERTICAL" instead of "NONE" for non-flex parents)
  // align-items: "normal" (CSS computed value for block) → normalized to "stretch"
  // =========================================================================
  it("block parent with align-items: normal → FILL × FIXED (fallback scenario)", () => {
    const result = getLayoutSizing(
      { display: "block", width: "1180px", height: "186px" },
      0,
      "auto",
      { direction: "VERTICAL", alignItems: "normal" }
    );
    expect(result.horizontal).toBe("FILL");
    expect(result.vertical).toBe("FIXED");
  });

  // =========================================================================
  // Block parent with align-items: center (rare but possible)
  // Cross axis should NOT stretch
  // =========================================================================
  it("block parent with align-items: center → FIXED × FIXED", () => {
    const result = getLayoutSizing(
      { display: "block", width: "200px", height: "50px" },
      0,
      "auto",
      { direction: "VERTICAL", alignItems: "center" }
    );
    expect(result.horizontal).toBe("FIXED");
    expect(result.vertical).toBe("FIXED");
  });
});
