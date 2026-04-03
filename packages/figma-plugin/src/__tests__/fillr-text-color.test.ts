/**
 * FILLR Text Color Tests
 *
 * When fontMode === "lines" (FILLR font), text color must respect colorMode:
 * - colorMode "website" → use the node's original textColor from the website
 * - colorMode "plugin"  → use pluginColors.text
 *
 * Pure-function tests for the color determination logic extracted from text.ts.
 */

import { describe, it, expect } from "vitest";
import { determineFillrTextColor } from "../rendering/text";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FILLR text color — determineFillrTextColor", () => {
  describe("website colorMode", () => {
    it("returns node.textColor when available", () => {
      expect(
        determineFillrTextColor(
          { textColor: "#FFFFFF" },
          [{ color: "#999999" }],
          "website",
          { text: "#11151A" }
        )
      ).toBe("#FFFFFF");
    });

    it("falls back to first segment color when textColor is missing", () => {
      expect(
        determineFillrTextColor(
          {},
          [{ color: "#FF0000" }, { color: "#00FF00" }],
          "website",
          { text: "#11151A" }
        )
      ).toBe("#FF0000");
    });

    it("falls back to #333333 when no color info exists", () => {
      expect(
        determineFillrTextColor(
          {},
          [],
          "website",
          { text: "#11151A" }
        )
      ).toBe("#333333");
    });

    it("returns white text color from website", () => {
      expect(
        determineFillrTextColor(
          { textColor: "#FFFFFF" },
          [],
          "website",
          { text: "#11151A" }
        )
      ).toBe("#FFFFFF");
    });
  });

  describe("plugin colorMode", () => {
    it("returns pluginColors.text", () => {
      expect(
        determineFillrTextColor(
          { textColor: "#FF0000" },
          [{ color: "#00FF00" }],
          "plugin",
          { text: "#11151A" }
        )
      ).toBe("#11151A");
    });

    it("returns plugin color even when node has textColor", () => {
      expect(
        determineFillrTextColor(
          { textColor: "#FFFFFF" },
          [],
          "plugin",
          { text: "#333333" }
        )
      ).toBe("#333333");
    });

    it("returns custom plugin text color", () => {
      expect(
        determineFillrTextColor(
          {},
          [],
          "plugin",
          { text: "#AABBCC" }
        )
      ).toBe("#AABBCC");
    });
  });
});
