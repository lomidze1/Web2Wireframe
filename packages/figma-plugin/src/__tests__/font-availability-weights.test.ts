/**
 * Font availability + missing-font partition/choice helpers.
 *
 * Availability must mirror what the RENDERER actually does. Since text.ts
 * Step 3.5 (same-family installed-style rescue) keeps a partially-installed
 * family on its nearest installed cut, a family with ANY installed cut is
 * available — the renderer will never lose it to Inter.
 *
 * The earlier weight-aware rule (every requested weight needs its own cut)
 * was reverted: it produced a permanent modal loop on apple.com, where
 * SF Pro Text is installed but a few cuts refuse to install (Font Book
 * validation warnings). Re-downloading the identical ZIP could never satisfy
 * it, and the render was already correct via the same-family rescue.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkFontsAvailability,
  partitionMissingFonts,
  buildChoiceRenderPlan,
} from "../utils/fontUtils";

let installedFonts: Map<string, string[]> = new Map();

beforeEach(() => {
  installedFonts = new Map();

  (globalThis as Record<string, unknown>).figma = {
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      const styles = installedFonts.get(font.family);
      if (!styles || !styles.includes(font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
    }),
    listAvailableFontsAsync: vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        styles.map((style) => ({ fontName: { family, style } })),
      ),
    ),
  };
});

describe("checkFontsAvailability", () => {
  it("family with only a Regular cut is AVAILABLE (same-family rescue covers other weights)", async () => {
    installedFonts.set("SF Pro Display", ["Regular"]);

    const { missing, available } = await checkFontsAvailability(new Set(["SF Pro Display"]));

    expect(available).toContain("SF Pro Display");
    expect(missing).toHaveLength(0);
  });

  it("family installed only under a non-standard cut name is AVAILABLE (Söhne 'Buch')", async () => {
    installedFonts.set("Copyright Klim Type Foundry", ["Buch"]);

    const { available } = await checkFontsAvailability(
      new Set(["Copyright Klim Type Foundry"]),
    );

    expect(available).toContain("Copyright Klim Type Foundry");
  });

  it("completely uninstalled family is MISSING", async () => {
    const { missing } = await checkFontsAvailability(new Set(["Ghost Font"]));

    expect(missing).toContain("Ghost Font");
  });

  it("icon font with only a Solid cut is available", async () => {
    installedFonts.set("Font Awesome 6 Brands", ["Solid"]);

    const { available } = await checkFontsAvailability(new Set(["Font Awesome 6 Brands"]));

    expect(available).toContain("Font Awesome 6 Brands");
  });

  it("CSS generic keywords are skipped entirely", async () => {
    const { available, missing } = await checkFontsAvailability(
      new Set(["sans-serif", "monospace"]),
    );

    expect(available).toHaveLength(0);
    expect(missing).toHaveLength(0);
  });

  it("splits a mixed set into available and missing", async () => {
    installedFonts.set("SF Pro Text", ["Regular"]);

    const { available, missing } = await checkFontsAvailability(
      new Set(["SF Pro Text", "SF Pro Icons"]),
    );

    expect(available).toEqual(["SF Pro Text"]);
    expect(missing).toEqual(["SF Pro Icons"]);
  });
});

describe("partitionMissingFonts", () => {
  it("splits auto-resolvable (installed under real name) from still-missing", () => {
    const { autoOriginal, stillMissing } = partitionMissingFonts(
      ["PSC", "Ghost Font"],
      { "PSC": "PPCirka-Light" },
      new Set(["PPCirka-Light", "Inter"]),
    );

    expect(autoOriginal).toEqual({ "PSC": "PPCirka-Light" });
    expect(stillMissing).toEqual(["Ghost Font"]);
  });

  it("identity real-name entries are not auto-resolved", () => {
    const { autoOriginal, stillMissing } = partitionMissingFonts(
      ["PSC"],
      { "PSC": "PSC" },
      new Set(["PSC"]),
    );

    expect(autoOriginal).toEqual({});
    expect(stillMissing).toEqual(["PSC"]);
  });
});

describe("buildChoiceRenderPlan", () => {
  it("continue: everything renders Inter, markers carry both modal and auto fonts", () => {
    const plan = buildChoiceRenderPlan(
      "continue",
      { "Ghost Font": "Ghost Font" },
      { "PSC": "PPCirka-Light" },
    );

    expect(plan.primaryFont).toBe("Inter");
    expect(plan.renderMapping).toEqual({ "Ghost Font": "Inter", "PSC": "Inter" });
    expect(plan.originalFontNames).toEqual({ "Ghost Font": "Ghost Font", "PSC": "PPCirka-Light" });
  });

  it("fallback: modal mapping kept, auto-resolved fonts still render Inter + marker", () => {
    const plan = buildChoiceRenderPlan(
      "fallback",
      { "Ghost Font": "Georgia" },
      { "PSC": "PPCirka-Light" },
    );

    expect(plan.primaryFont).toBe("Georgia");
    expect(plan.renderMapping).toEqual({ "Ghost Font": "Georgia", "PSC": "Inter" });
    expect(plan.originalFontNames).toEqual({ "PSC": "PPCirka-Light" });
  });

  it("no auto-resolved fonts → plan matches legacy behavior exactly", () => {
    const plan = buildChoiceRenderPlan("plugin", { "Ghost Font": "Montserrat" }, {});

    expect(plan.primaryFont).toBe("Montserrat");
    expect(plan.renderMapping).toEqual({ "Ghost Font": "Montserrat" });
    expect(plan.originalFontNames).toBeUndefined();
  });
});
