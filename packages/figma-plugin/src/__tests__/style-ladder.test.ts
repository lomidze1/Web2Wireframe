import { describe, it, expect } from "vitest";
import { STYLE_LADDER, matchStyle, nextStyle } from "../ui/shared/styleLadder";

const ORIGINAL = {
  colorMode: "website" as const,
  fontMode: "website" as const,
  textMode: "website" as const,
  assetMode: "realAssets" as const,
};

describe("style ladder", () => {
  it("climbs wireframe → low-fi sketch → smart placeholder text", () => {
    expect(STYLE_LADDER.map((s) => s.id)).toEqual(["wireframe", "sketch", "smartText"]);
    expect(STYLE_LADDER.map((s) => s.label)).toEqual([
      "✏️ Try wireframe style",
      "📐 Try low-fi sketch",
      "🔤 Try smart placeholder text",
    ]);
  });

  it("does not count the original website style as a ladder step", () => {
    expect(matchStyle(ORIGINAL)).toBeNull();
  });

  it("recognises each step from the settings it imported with", () => {
    for (const style of STYLE_LADDER) {
      expect(matchStyle({ ...ORIGINAL, ...style.settings })).toBe(style.id);
    }
  });

  it("offers the first step not tried yet", () => {
    expect(nextStyle([])?.id).toBe("wireframe");
    expect(nextStyle(["wireframe"])?.id).toBe("sketch");
    expect(nextStyle(["wireframe", "sketch"])?.id).toBe("smartText");
    // A user whose own settings already produced the sketch still gets the rest.
    expect(nextStyle(["sketch"])?.id).toBe("wireframe");
  });

  it("offers nothing once every step was tried", () => {
    expect(nextStyle(["wireframe", "sketch", "smartText"])).toBeNull();
  });
});
