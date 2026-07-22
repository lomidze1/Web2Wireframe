/**
 * Fully-missing families must also narrow the download ZIP to the cuts the
 * page actually renders — not ship every declared @font-face weight.
 *
 * Regression: apple.com declares SF Pro Text at every weight 100–900, but the
 * page only renders 400/600. When SF Pro Text isn't installed in Figma it lands
 * in `missing` (whole family), never in `missingCuts` (partial families only),
 * so the download bypassed cut-narrowing and shipped the unused Light (300).
 *
 * Fix: `buildDownloadCuts` merges the absent cuts of partial families with the
 * *used* cuts (from `collectFontUsage`) of fully-missing families, so a single
 * cuts map narrows both. The existing safety net still restores a family's full
 * set when its filter matches nothing.
 */
import { describe, it, expect } from "vitest";
import { buildDownloadCuts, type FontCut } from "../utils/fontUtils";
import { buildFontDownloads } from "../utils/fontDownload";

const usage = (entries: Record<string, FontCut[]>): Map<string, FontCut[]> =>
  new Map(Object.entries(entries));

const font = (fontWeight: string, fontStyle: string, file: string) => ({
  fontFamily: "SF Pro Text",
  fontWeight,
  fontStyle,
  src: `url(https://apple.com/${file}) format('woff2')`,
});

const SF_TEXT_ALL = [
  font("300", "normal", "sf-text-light.woff2"),
  font("400", "normal", "sf-text-regular.woff2"),
  font("600", "normal", "sf-text-semibold.woff2"),
  font("700", "normal", "sf-text-bold.woff2"),
];

describe("buildDownloadCuts", () => {
  it("adds the used cuts of a fully-missing family from fontUsage", () => {
    const out = buildDownloadCuts(
      ["SF Pro Text"],
      {},
      usage({ "SF Pro Text": [{ weight: 400, italic: false }, { weight: 600, italic: false }] }),
    );
    expect(out["SF Pro Text"]).toEqual([
      { weight: 400, italic: false },
      { weight: 600, italic: false },
    ]);
  });

  it("keeps a partial family's absent-cut list instead of its usage", () => {
    const out = buildDownloadCuts(
      [],
      { Söhne: [{ weight: 500, italic: false }] },
      usage({ "Söhne": [{ weight: 400, italic: false }, { weight: 500, italic: false }] }),
    );
    // missingCuts (absent cuts) wins for installed/partial families.
    expect(out["Söhne"]).toEqual([{ weight: 500, italic: false }]);
  });

  it("omits a fully-missing family with no recorded usage (safety net keeps full set)", () => {
    const out = buildDownloadCuts(["Mystery"], {}, usage({}));
    expect(out["Mystery"]).toBeUndefined();
  });
});

describe("buildFontDownloads for a fully-missing family (end-to-end)", () => {
  it("ships only the used cuts, dropping the unused Light", () => {
    const cuts = buildDownloadCuts(
      ["SF Pro Text"],
      {},
      usage({ "SF Pro Text": [{ weight: 400, italic: false }, { weight: 600, italic: false }] }),
    );
    const downloads = buildFontDownloads(["SF Pro Text"], SF_TEXT_ALL, cuts);

    expect(downloads).toHaveLength(1);
    const urls = downloads![0].urls.join(" ");
    expect(urls).toContain("sf-text-regular");
    expect(urls).toContain("sf-text-semibold");
    expect(urls).not.toContain("sf-text-light");
    expect(urls).not.toContain("sf-text-bold");
    expect(downloads![0].urls).toHaveLength(2);
  });

  it("with no usage recorded, still ships the whole family (safety net)", () => {
    const cuts = buildDownloadCuts(["SF Pro Text"], {}, usage({}));
    const downloads = buildFontDownloads(["SF Pro Text"], SF_TEXT_ALL, cuts);

    expect(downloads).toHaveLength(1);
    expect(downloads![0].urls).toHaveLength(4);
  });
});
