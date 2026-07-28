/**
 * Each downloaded file must be named after the face that OWNS its URL.
 *
 * apple.com regression: the user needed SF Pro Text Regular 400 + Semibold
 * 600, and the ZIP arrived holding six files called Ultralight-100 /
 * Thin-200 / Light-300 (+ italics) — the six cuts they already had.
 *
 * Cause: entries were built by walking the family's flat URL list and reading
 * metadata at the SAME index (`matchingFonts[i]`). Two things break that:
 *   1. every @font-face carries 3 URLs (woff2/woff/ttf) but contributes ONE
 *      metadata entry, so index i drifts immediately;
 *   2. the URL list is filtered to the missing cuts while the metadata list
 *      is not, so the two start from different sets.
 * The result was file i named after face i — pure coincidence, never right.
 *
 * Fix: index the faces BY URL, and ship one installable file per face.
 */
import { describe, it, expect } from "vitest";
import { buildFontDownloadEntries } from "../utils/fontDownload";

const BASE = "https://www.apple.com/wss/fonts/SF-Pro-Text/v3";

/** An apple.com @font-face: 3 URLs in one src (woff2 → woff → ttf). */
const face = (weight: string, style: string, slug: string) => ({
  fontFamily: "SF Pro Text",
  fontWeight: weight,
  fontStyle: style,
  realFamily: "SF Pro Text",
  realSubfamily: slug.replace(/^\w/, (c) => c.toUpperCase()).replace("-italic", " Italic"),
  src:
    `local('☺'), url("${BASE}/sf-pro-text_${slug}.woff2") format("woff2"), ` +
    `url("${BASE}/sf-pro-text_${slug}.woff") format("woff"), ` +
    `url("${BASE}/sf-pro-text_${slug}.ttf") format("truetype")`,
});

/** The 18 SF Pro Text faces apple.com declares, in sheet order. */
const APPLE_FACES = [
  face("100", "normal", "ultralight"),
  face("100", "italic", "ultralight-italic"),
  face("200", "normal", "thin"),
  face("200", "italic", "thin-italic"),
  face("300", "normal", "light"),
  face("300", "italic", "light-italic"),
  face("400", "italic", "regular-italic"),
  face("500", "normal", "medium"),
  face("600", "normal", "semibold"),
  face("400", "normal", "regular"),
];

const urlsOf = (slug: string) => [
  `${BASE}/sf-pro-text_${slug}.woff2`,
  `${BASE}/sf-pro-text_${slug}.woff`,
  `${BASE}/sf-pro-text_${slug}.ttf`,
];

describe("buildFontDownloadEntries — names follow the URL, not the index", () => {
  it("names the Regular and Semibold files after their own faces", () => {
    // What the cut filter leaves once the user is missing 400 + 600: the URLs
    // of exactly those two faces — while extractedFonts still holds all 18.
    const downloads = [
      {
        family: "SF Pro Text",
        urls: [...urlsOf("regular"), ...urlsOf("semibold")],
        isGoogleFont: false,
      },
    ];

    const entries = buildFontDownloadEntries(downloads, APPLE_FACES);
    const names = entries.map((e) => e.fileName).sort();

    expect(names).toEqual([
      "SF-Pro-Text-Regular-400-100.ttf",
      "SF-Pro-Text-Semibold-600-100.ttf",
    ]);
  });

  it("ships one installable file per face, not one per URL", () => {
    const downloads = [
      { family: "SF Pro Text", urls: urlsOf("regular"), isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads, APPLE_FACES);

    // 3 URLs (woff2/woff/ttf) describe ONE cut — Font Book installs the TTF
    // and refuses the web-only wrappers, so shipping all three is noise.
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(`${BASE}/sf-pro-text_regular.ttf`);
    expect(entries[0].fileName).toBe("SF-Pro-Text-Regular-400-100.ttf");
  });

  it("falls back to a web format when the face ships no installable one", () => {
    const woff2Only = [
      {
        fontFamily: "Webby",
        fontWeight: "400",
        fontStyle: "normal",
        src: `url("https://x.test/webby.woff2") format("woff2")`,
      },
    ];
    const downloads = [
      { family: "Webby", urls: ["https://x.test/webby.woff2"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads, woff2Only);

    expect(entries).toHaveLength(1);
    expect(entries[0].fileName).toBe("Webby-normal-400-100.woff2");
  });

  it("drops EOT URLs but keeps the face's other formats", () => {
    // apple.com's Regular is the one face with a legacy IE `src: url(...eot)`
    // line ahead of the real one. EOT is uninstallable, but the rest of the
    // face must still ship.
    const withEot = [
      {
        fontFamily: "SF Pro Text",
        fontWeight: "400",
        fontStyle: "normal",
        realFamily: "SF Pro Text",
        realSubfamily: "Regular",
        src:
          `url('${BASE}/sf-pro-text_regular.eot'), ` +
          `url("${BASE}/sf-pro-text_regular.woff2") format("woff2"), ` +
          `url("${BASE}/sf-pro-text_regular.ttf") format("truetype")`,
      },
    ];
    const downloads = [
      {
        family: "SF Pro Text",
        urls: [
          `${BASE}/sf-pro-text_regular.eot`,
          `${BASE}/sf-pro-text_regular.woff2`,
          `${BASE}/sf-pro-text_regular.ttf`,
        ],
        isGoogleFont: false,
      },
    ];

    const entries = buildFontDownloadEntries(downloads, withEot);

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(`${BASE}/sf-pro-text_regular.ttf`);
  });

  it("an EOT-only face ships derived sibling candidates, never the EOT itself", () => {
    // telex.ge fix: whole families arrive EOT-only when the capture reads the
    // IE-first `src:`. They now get same-basename candidates (.ttf first);
    // the EOT itself remains unshippable.
    const eotOnly = [
      {
        fontFamily: "Ancient",
        fontWeight: "400",
        fontStyle: "normal",
        src: `url("https://x.test/ancient.eot")`,
      },
    ];
    const downloads = [
      { family: "Ancient", urls: ["https://x.test/ancient.eot"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads, eotOnly);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://x.test/ancient.ttf");
    expect(entries[0].url).not.toMatch(/\.eot/i);
    expect(entries[0].fileName).toBe("Ancient-normal-400-100.ttf");
  });

  it("URLs with no matching face still ship, named from the family", () => {
    const downloads = [
      { family: "Orphan", urls: ["https://x.test/orphan.ttf"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads, []);

    expect(entries).toHaveLength(1);
    expect(entries[0].fileName).toBe("Orphan-normal-400-100.ttf");
  });

  it("carries the face's pre-extracted binary, and names it by the binary's format", () => {
    // When the API pre-extracted a WOFF2 binary, the file must say .woff2 —
    // naming those bytes .ttf is exactly what made Font Book report
    // validation errors.
    const withBinary = [
      {
        fontFamily: "Cached",
        fontWeight: "500",
        fontStyle: "normal",
        format: "woff2",
        fontBase64: "AAAA",
        fontMimeType: "font/woff2",
        src: `url("https://x.test/cached.woff2") format("woff2"), url("https://x.test/cached.ttf") format("truetype")`,
      },
    ];
    const downloads = [
      {
        family: "Cached",
        urls: ["https://x.test/cached.woff2", "https://x.test/cached.ttf"],
        isGoogleFont: false,
      },
    ];

    const entries = buildFontDownloadEntries(downloads, withBinary);

    expect(entries).toHaveLength(1);
    expect(entries[0].fontBase64).toBe("AAAA");
    expect(entries[0].fileName).toBe("Cached-normal-500-100.woff2");
  });
});
