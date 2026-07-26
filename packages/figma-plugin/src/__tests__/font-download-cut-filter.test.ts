/**
 * The ZIP must carry only the cuts the user is actually missing.
 *
 * Before: one absent cut flagged the whole family, and the download shipped
 * every @font-face file the page declared (18 SF Pro Text files to install a
 * single Light cut). Now the missing-cut list narrows the bundle.
 *
 * Safety net: if the cut filter matches nothing for a family (unparseable or
 * mismatched @font-face metadata), that family falls back to shipping all of
 * its entries — an over-complete ZIP beats an empty one.
 */
import { describe, it, expect } from "vitest";
import { buildFontDownloads, filterExtractedFontsToCuts } from "../utils/fontDownload";

const font = (
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  file: string,
) => ({
  fontFamily,
  fontWeight,
  fontStyle,
  src: `url(https://apple.com/${file}) format('woff2')`,
});

const SF_TEXT = [
  font("SF Pro Text", "300", "normal", "sf-text-light.woff2"),
  font("SF Pro Text", "400", "normal", "sf-text-regular.woff2"),
  font("SF Pro Text", "600", "normal", "sf-text-semibold.woff2"),
  font("SF Pro Text", "400", "italic", "sf-text-italic.woff2"),
];

describe("filterExtractedFontsToCuts", () => {
  it("keeps only the entries matching the missing cuts", () => {
    const out = filterExtractedFontsToCuts(SF_TEXT, {
      "SF Pro Text": [{ weight: 300, italic: false }],
    });

    expect(out).toHaveLength(1);
    expect((out[0] as { src: string }).src).toContain("sf-text-light");
  });

  it("keeps an italic entry only for an italic cut", () => {
    const out = filterExtractedFontsToCuts(SF_TEXT, {
      "SF Pro Text": [{ weight: 400, italic: true }],
    });

    expect(out).toHaveLength(1);
    expect((out[0] as { src: string }).src).toContain("sf-text-italic");
  });

  it("keeps every entry of a family that has no missing-cut list (fully missing family)", () => {
    const out = filterExtractedFontsToCuts(SF_TEXT, {});
    expect(out).toHaveLength(4);
  });

  it("a variable-font range entry covers any weight inside it", () => {
    const variable = [font("SF Pro Text", "100 900", "normal", "sf-text-var.woff2")];
    const out = filterExtractedFontsToCuts(variable, {
      "SF Pro Text": [{ weight: 300, italic: false }],
    });
    expect(out).toHaveLength(1);
  });

  it("'normal'/'bold' keywords resolve to 400/700", () => {
    const kw = [
      font("Test", "normal", "normal", "regular.woff2"),
      font("Test", "bold", "normal", "bold.woff2"),
    ];
    expect(filterExtractedFontsToCuts(kw, { Test: [{ weight: 400, italic: false }] })).toHaveLength(1);
    expect(filterExtractedFontsToCuts(kw, { Test: [{ weight: 700, italic: false }] })[0]).toEqual(kw[1]);
  });

  it("falls back to the family's full set when nothing matches", () => {
    // The page needs weight 500 but declares no 500 face — ship what we have
    // rather than an empty ZIP.
    const out = filterExtractedFontsToCuts(SF_TEXT, {
      "SF Pro Text": [{ weight: 500, italic: false }],
    });
    expect(out).toHaveLength(4);
  });

  it("filters each family independently", () => {
    const mixed = [...SF_TEXT, font("Newsreader", "400", "italic", "news-italic.woff2")];
    const out = filterExtractedFontsToCuts(mixed, {
      "SF Pro Text": [{ weight: 600, italic: false }],
    });

    // SF Pro Text narrowed to its Semibold; Newsreader untouched (no cut list).
    expect(out).toHaveLength(2);
    expect((out[0] as { src: string }).src).toContain("sf-text-semibold");
    expect((out[1] as { src: string }).src).toContain("news-italic");
  });
});

describe("buildFontDownloads with missingCuts", () => {
  it("narrows the download URLs to the missing cut", () => {
    const downloads = buildFontDownloads(["SF Pro Text"], SF_TEXT, {
      "SF Pro Text": [{ weight: 300, italic: false }],
    });

    expect(downloads).toHaveLength(1);
    expect(downloads![0].family).toBe("SF Pro Text");
    expect(downloads![0].urls).toHaveLength(1);
    expect(downloads![0].urls[0]).toContain("sf-text-light");
  });

  it("without missingCuts, keeps the existing whole-family behavior", () => {
    const downloads = buildFontDownloads(["SF Pro Text"], SF_TEXT);

    expect(downloads).toHaveLength(1);
    expect(downloads![0].urls).toHaveLength(4);
  });
});
