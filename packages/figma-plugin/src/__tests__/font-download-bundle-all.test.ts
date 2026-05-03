/**
 * buildFontDownloads — "bundle all" behavior on naming mismatch.
 *
 * Background: in real-world captures (e.g. apple.com), the page CSS uses
 * abbreviated font-family chain heads ("PSA", "PS1", ".") while the page's
 * @font-face rules declare those families under verbose canonical names
 * ("Source Sans 3", "Averta Std", "PrivateSans Apple"). Sandbox's
 * `node.fontFamily` (cleaned chain head) does not match
 * `extractedFonts[i].family` (declared @font-face name), so the previous
 * exact-string match in `buildFontDownloads` returned 0 downloads — the
 * "Download fonts (.zip)" button never rendered.
 *
 * Fix policy: when the modal has already opened (missingFonts > 0) AND the
 * page exposes @font-face entries (extractedFonts > 0), bundle ALL
 * extracted fonts into the ZIP regardless of name match. The user
 * installs the actual page fonts; naming will sort itself out in Figma.
 */
import { describe, it, expect } from "vitest";
import {
  buildFontDownloads,
  buildFontDownloadEntries,
} from "../utils/fontDownload";

describe("buildFontDownloads — bundle-all on naming mismatch", () => {
  it("bundles ALL extractedFonts when none of the names match missingFonts", () => {
    // Real-world apple.com-style scenario: missing names abbreviated,
    // extractedFonts hold the canonical @font-face names.
    const missingFonts = ["PSA", "PS1", "PSC", ".", "SS3V", "SourceSans3VF", "Averta Std"];
    const extractedFonts = [
      { family: "PrivateSans Apple", src: 'url("https://example.com/a.woff2")', isGoogleFont: false },
      { family: "Source Sans 3", src: 'url("https://example.com/b.woff2")', isGoogleFont: false },
      { family: "Averta Std Pro", src: 'url("https://example.com/c.woff2")', isGoogleFont: false },
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toBeDefined();
    expect(result).toHaveLength(3);
    const families = result!.map((d) => d.family).sort();
    expect(families).toEqual(["Averta Std Pro", "PrivateSans Apple", "Source Sans 3"]);
  });

  it("returns undefined when extractedFonts is empty (nothing to bundle)", () => {
    const result = buildFontDownloads(["PSA"], []);
    expect(result).toBeUndefined();
  });

  it("returns undefined when extractedFonts is missing entirely", () => {
    const result = buildFontDownloads(["PSA"], undefined);
    expect(result).toBeUndefined();
  });

  it("aggregates URLs per family across multiple variants", () => {
    const missingFonts = ["AnyMissing"];
    const extractedFonts = [
      { family: "Inter", src: 'url("https://example.com/inter-regular.woff2")', isGoogleFont: false },
      { family: "Inter", src: 'url("https://example.com/inter-bold.woff2")', isGoogleFont: false },
      { family: "Inter", src: 'url("https://example.com/inter-italic.woff2")', isGoogleFont: false },
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toHaveLength(1);
    expect(result![0].family).toBe("Inter");
    expect(result![0].urls).toHaveLength(3);
  });

  it("includes Google Fonts even when src has no parseable URLs", () => {
    const missingFonts = ["AnyMissing"];
    const extractedFonts = [
      { family: "Roboto", src: "", isGoogleFont: true },
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toHaveLength(1);
    expect(result![0].family).toBe("Roboto");
    expect(result![0].isGoogleFont).toBe(true);
  });

  it("skips entries with neither URLs nor Google Font flag (nothing to download)", () => {
    const missingFonts = ["AnyMissing"];
    const extractedFonts = [
      { family: "ValidFont", src: 'url("https://example.com/valid.woff2")', isGoogleFont: false },
      { family: "EmptyFont", src: "", isGoogleFont: false }, // skipped
      { family: "", src: 'url("https://example.com/noname.woff2")', isGoogleFont: false }, // skipped (no family)
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toHaveLength(1);
    expect(result![0].family).toBe("ValidFont");
  });

  it("handles W2WFontEntry shape (fontFamily field, not family)", () => {
    // API W2W content-script flow returns W2WFontEntry[] with `fontFamily`.
    // Frontend buildFontDownloads must read both `family` (legacy) and
    // `fontFamily` (W2W) without requiring backend normalization.
    const missingFonts = ["AnyMissing"];
    const extractedFonts = [
      // No `family`, only `fontFamily` — current API response shape
      { fontFamily: "PrivateSans Apple", src: 'url("https://example.com/psa.woff2")' },
      { fontFamily: "Source Sans 3", src: 'url("https://example.com/ss3.woff2")' },
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toHaveLength(2);
    const families = result!.map((d) => d.family).sort();
    expect(families).toEqual(["PrivateSans Apple", "Source Sans 3"]);
  });

  it("detects Google Fonts from src URL when isGoogleFont flag is absent (W2W shape)", () => {
    // W2WFontEntry has no isGoogleFont field; recognize from CDN URL.
    const missingFonts = ["AnyMissing"];
    const extractedFonts = [
      // googleapis.com — CSS @import URL, no parseable woff2 in src
      { fontFamily: "Roboto", src: "https://fonts.googleapis.com/css2?family=Roboto" },
      // gstatic.com — direct font binary CDN
      { fontFamily: "Inter", src: 'url("https://fonts.gstatic.com/s/inter/v12/inter.woff2")' },
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toHaveLength(2);
    const robotoEntry = result!.find((d) => d.family === "Roboto");
    expect(robotoEntry?.isGoogleFont).toBe(true);
    const interEntry = result!.find((d) => d.family === "Inter");
    expect(interEntry?.isGoogleFont).toBe(true);
  });

  it("buildFontDownloadEntries does NOT throw on W2WFontEntry shape (regression)", () => {
    // Before the normalization fix, this threw `TypeError: Cannot read
    // property 'toLowerCase' of undefined` because the filter accessed
    // `ef.family.toLowerCase()` and W2WFontEntry has `fontFamily` instead.
    const downloads = [
      {
        family: "PrivateSans Apple",
        urls: ["https://example.com/psa.woff2"],
        isGoogleFont: false,
      },
    ];
    const extractedFonts = [
      // W2WFontEntry shape — only fontFamily/fontWeight/fontStyle
      {
        fontFamily: "PrivateSans Apple",
        fontWeight: "700",
        fontStyle: "normal",
        src: "https://example.com/psa.woff2",
      },
    ];

    expect(() => buildFontDownloadEntries(downloads, extractedFonts)).not.toThrow();

    const entries = buildFontDownloadEntries(downloads, extractedFonts);
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe("PrivateSans Apple");
    // weight should come from fontWeight via normalization (was hardcoded 400)
    expect(entries[0].fileName).toContain("700");
  });

  it("buildFontDownloadEntries skips extractedFont entries with no family in either shape", () => {
    const downloads = [
      {
        family: "Inter",
        urls: ["https://example.com/inter.woff2"],
        isGoogleFont: false,
      },
    ];
    const extractedFonts = [
      // No family / fontFamily — must not throw, just skip
      { src: "https://example.com/garbage.woff2" },
      { fontFamily: "Inter", fontWeight: "400", src: "https://example.com/inter.woff2" },
    ];

    const entries = buildFontDownloadEntries(downloads, extractedFonts);
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe("Inter");
  });

  it("works correctly when extractedFonts.family DOES match missingFonts (back-compat)", () => {
    // The new logic must not break the legacy happy path: when names DO
    // match, behavior is identical — bundle the matching fonts.
    const missingFonts = ["Inter"];
    const extractedFonts = [
      { family: "Inter", src: 'url("https://example.com/inter.woff2")', isGoogleFont: false },
    ];

    const result = buildFontDownloads(missingFonts, extractedFonts);

    expect(result).toHaveLength(1);
    expect(result![0].family).toBe("Inter");
  });
});
